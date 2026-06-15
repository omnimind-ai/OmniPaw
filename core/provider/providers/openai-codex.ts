import type {
  BaseProvider,
  ChatCompletionChunk,
  ChatCompletionRequest,
  ProviderContentPart,
  ProviderMessage,
  ProviderModelCandidate,
  ProviderTool,
  ProviderToolCall,
  TokenUsage,
} from '../base-provider'
import { errorFromResponse, normalizeProviderError, throwProviderError } from '../errors'
import { extractOpenAICodexAccountId, type OpenAICodexOAuthCredential } from '../openai-codex-oauth'
import { parseSseStream } from './openai'

export interface OpenAICodexProviderOptions {
  id: string
  baseUrl: string
  apiKey?: string
  authHeader?: string
  headers?: Record<string, string>
  extraBody?: Record<string, unknown>
  oauthCredentialResolver?: () => Promise<OpenAICodexOAuthCredential | undefined>
  fetch?: typeof fetch
}

const DEFAULT_CODEX_BASE_URL = 'https://chatgpt.com/backend-api'
const CODEX_RESPONSE_STATUSES = new Set([
  'completed',
  'incomplete',
  'failed',
  'cancelled',
  'queued',
  'in_progress',
])

interface PendingFunctionCall {
  index: number
  id?: string
  callId?: string
  name: string
  arguments: string
}

export class OpenAICodexProvider implements BaseProvider {
  readonly id: string

  private readonly baseUrl: string
  private readonly apiKey?: string
  private readonly authHeader?: string
  private readonly headers: Record<string, string>
  private readonly extraBody: Record<string, unknown>
  private readonly oauthCredentialResolver?: () => Promise<OpenAICodexOAuthCredential | undefined>
  private readonly fetchImpl: typeof fetch

  constructor(options: OpenAICodexProviderOptions) {
    this.id = options.id
    this.baseUrl = options.baseUrl || DEFAULT_CODEX_BASE_URL
    this.apiKey = options.apiKey
    this.authHeader = options.authHeader
    this.headers = options.headers ?? {}
    this.extraBody = options.extraBody ?? {}
    this.oauthCredentialResolver = options.oauthCredentialResolver
    this.fetchImpl = options.fetch ?? fetch
  }

  async *streamChat(request: ChatCompletionRequest): AsyncIterable<ChatCompletionChunk> {
    try {
      const credential = await this.resolveCredential()
      const response = await this.fetchImpl(resolveCodexUrl(this.baseUrl), {
        method: 'POST',
        headers: this.buildHeaders(credential),
        body: JSON.stringify(this.buildBody(request)),
        signal: request.abortSignal,
      })

      if (!response.ok) {
        throwProviderError(await parseCodexError(response))
      }

      if (!response.body) {
        throwProviderError({
          code: 'network',
          message: 'OpenAI Codex response did not include a stream body.',
          retryable: true,
          providerStatus: response.status,
        })
      }

      let finalUsage: TokenUsage | undefined
      let finishReason: string | undefined
      const pendingToolCalls = new Map<string, PendingFunctionCall>()
      let nextToolIndex = 0

      for await (const eventText of parseSseStream(response.body)) {
        if (eventText === '[DONE]') {
          break
        }

        const event = parseEvent(eventText)
        const eventType = stringValue(event.type)

        if (eventType === 'error') {
          throwProviderError({
            code: 'provider_bad_request',
            message: stringValue(event.message) || stringValue(event.code) || 'OpenAI Codex error.',
            retryable: false,
            providerBodyPreview: eventText.slice(0, 1000),
          })
        }

        if (eventType === 'response.failed') {
          const responsePayload = isRecord(event.response) ? event.response : undefined
          const error = isRecord(responsePayload?.error) ? responsePayload?.error : undefined
          throwProviderError({
            code: 'provider_bad_request',
            message: stringValue(error?.message) || 'OpenAI Codex response failed.',
            retryable: false,
            providerBodyPreview: eventText.slice(0, 1000),
          })
        }

        if (eventType === 'response.output_item.added') {
          const item = isRecord(event.item) ? event.item : undefined
          if (item?.type === 'function_call') {
            const pending: PendingFunctionCall = {
              index: nextToolIndex++,
              id: stringValue(item.id) || undefined,
              callId: stringValue(item.call_id) || undefined,
              name: stringValue(item.name),
              arguments: stringValue(item.arguments),
            }
            pendingToolCalls.set(toolCallKey(pending), pending)
            yield {
              type: 'tool_call_delta',
              index: pending.index,
              id: toProviderToolCallId(pending),
              toolCallType: 'function',
              name: pending.name,
              argumentsDelta: pending.arguments || undefined,
              done: false,
              raw: event,
            }
          }
          continue
        }

        if (eventType === 'response.output_text.delta') {
          const delta = stringValue(event.delta)
          if (delta) {
            yield {
              type: 'delta',
              content: delta,
              done: false,
              finishReason,
              usage: finalUsage,
              raw: event,
            }
          }
          continue
        }

        if (eventType === 'response.reasoning_summary_text.delta') {
          const delta = stringValue(event.delta)
          if (delta) {
            yield {
              type: 'delta',
              reasoning: delta,
              done: false,
              finishReason,
              usage: finalUsage,
              raw: event,
            }
          }
          continue
        }

        if (eventType === 'response.function_call_arguments.delta') {
          const pending = findPendingToolCall(pendingToolCalls, event)
          const delta = stringValue(event.delta)
          if (pending && delta) {
            pending.arguments += delta
            yield {
              type: 'tool_call_delta',
              index: pending.index,
              id: toProviderToolCallId(pending),
              toolCallType: 'function',
              argumentsDelta: delta,
              done: false,
              raw: event,
            }
          }
          continue
        }

        if (eventType === 'response.function_call_arguments.done') {
          const pending = findPendingToolCall(pendingToolCalls, event)
          const args = stringValue(event.arguments)
          if (pending && args) {
            pending.arguments = args
          }
          continue
        }

        if (eventType === 'response.output_item.done') {
          const item = isRecord(event.item) ? event.item : undefined
          if (item?.type === 'function_call') {
            const pending = upsertDoneToolCall(pendingToolCalls, item, nextToolIndex)
            if (pending.index === nextToolIndex) {
              nextToolIndex += 1
            }
            yield {
              type: 'tool_call_final',
              toolCalls: [toProviderToolCall(pending)],
              done: false,
              finishReason: 'tool_calls',
              usage: finalUsage,
              raw: event,
            }
          }
          continue
        }

        if (eventType === 'response.completed' || eventType === 'response.done') {
          const responsePayload = isRecord(event.response) ? event.response : undefined
          finalUsage = parseResponsesUsage(responsePayload?.usage) ?? finalUsage
          finishReason = mapStopReason(stringValue(responsePayload?.status))
          if (pendingToolCalls.size && finishReason === 'stop') {
            finishReason = 'tool_calls'
          }
        }
      }

      yield {
        type: 'final',
        done: true,
        finishReason,
        usage: finalUsage,
      }
    } catch (error) {
      throwProviderError(normalizeProviderError(error), error)
    }
  }

  async test(modelId?: string, signal?: AbortSignal): Promise<void> {
    const credential = await this.resolveCredential()
    const response = await this.fetchImpl(resolveCodexUrl(this.baseUrl), {
      method: 'POST',
      headers: this.buildHeaders(credential),
      body: JSON.stringify({
        model: modelId ?? 'gpt-5.4',
        store: false,
        stream: false,
        input: [{ role: 'user', content: [{ type: 'input_text', text: 'ping' }] }],
        max_output_tokens: 1,
      }),
      signal,
    }).catch((error: unknown) => {
      throwProviderError(normalizeProviderError(error), error)
    })

    if (!response.ok) {
      throwProviderError(await parseCodexError(response))
    }
  }

  async listModels(): Promise<ProviderModelCandidate[]> {
    return OPENAI_CODEX_MODELS.map((model) => ({ ...model, input: [...(model.input ?? ['text'])] }))
  }

  private async resolveCredential(): Promise<OpenAICodexOAuthCredential> {
    if (this.apiKey) {
      return {
        access: this.apiKey,
        accountId: extractOpenAICodexAccountId(this.apiKey),
      }
    }

    const credential = await this.oauthCredentialResolver?.()
    if (!credential?.access) {
      throwProviderError({
        code: 'provider_auth',
        message:
          'OpenAI Codex OAuth credential is not configured. Sign in with OpenAI in provider settings or provide a bearer token for this provider.',
        retryable: false,
      })
    }
    return credential
  }

  private buildBody(request: ChatCompletionRequest): Record<string, unknown> {
    const body: Record<string, unknown> = {
      ...this.extraBody,
      model: request.modelId,
      store: false,
      stream: true,
      input: request.messages
        .filter((message) => message.role !== 'system')
        .flatMap(toResponsesMessage),
      text: { verbosity: 'medium' },
      include: ['reasoning.encrypted_content'],
      tool_choice: 'auto',
      parallel_tool_calls: true,
    }

    const instructions = collectInstructions(request.messages)
    if (instructions) {
      body.instructions = instructions
    }

    if (request.temperature !== undefined) {
      body.temperature = request.temperature
    }

    if (request.topP !== undefined) {
      body.top_p = request.topP
    }

    if (request.maxOutputTokens !== undefined) {
      body.max_output_tokens = request.maxOutputTokens
    }

    if (request.tools?.length) {
      body.tools = request.tools.map(toResponsesTool)
    }

    return body
  }

  private buildHeaders(credential: OpenAICodexOAuthCredential): Headers {
    const headers = new Headers(this.headers)
    const authHeader = this.authHeader?.trim() || 'Authorization'
    headers.set(
      authHeader,
      authHeader.toLowerCase() === 'authorization'
        ? `Bearer ${credential.access}`
        : credential.access
    )
    const accountId = credential.accountId ?? extractOpenAICodexAccountId(credential.access)
    if (accountId) {
      headers.set('chatgpt-account-id', accountId)
    }
    headers.set('OpenAI-Beta', 'responses=experimental')
    headers.set('originator', 'pi')
    headers.set('User-Agent', 'pi (openomniclaw-electron)')
    headers.set('Accept', 'text/event-stream')
    headers.set('Content-Type', 'application/json')
    return headers
  }
}

const OPENAI_CODEX_MODELS: ProviderModelCandidate[] = [
  {
    id: 'gpt-5.4',
    name: 'GPT-5.4 Codex',
    input: ['text', 'image'],
    supportsTools: true,
    supportsReasoning: true,
    contextWindow: 1_050_000,
    maxOutputTokens: 128_000,
  },
  {
    id: 'gpt-5.3-codex',
    name: 'GPT-5.3 Codex',
    input: ['text', 'image'],
    supportsTools: true,
    supportsReasoning: true,
  },
  {
    id: 'gpt-5.3-codex-spark',
    name: 'GPT-5.3 Codex Spark',
    input: ['text', 'image'],
    supportsTools: true,
    supportsReasoning: true,
  },
  {
    id: 'gpt-5.2-codex',
    name: 'GPT-5.2 Codex',
    input: ['text', 'image'],
    supportsTools: true,
    supportsReasoning: true,
  },
  {
    id: 'gpt-5.1-codex',
    name: 'GPT-5.1 Codex',
    input: ['text', 'image'],
    supportsTools: true,
    supportsReasoning: true,
  },
]

function resolveCodexUrl(baseUrl: string): string {
  const normalized = (baseUrl || DEFAULT_CODEX_BASE_URL).replace(/\/+$/, '')
  if (normalized.endsWith('/codex/responses')) return normalized
  if (normalized.endsWith('/codex')) return `${normalized}/responses`
  return `${normalized}/codex/responses`
}

function collectInstructions(messages: ProviderMessage[]): string {
  return messages
    .filter((message) => message.role === 'system')
    .map((message) => contentToText(message.content))
    .filter(Boolean)
    .join('\n\n')
}

function toResponsesMessage(message: ProviderMessage): Record<string, unknown>[] {
  if (message.role === 'tool') {
    return [
      {
        type: 'function_call_output',
        call_id: message.toolCallId?.split('|')[0] ?? message.toolCallId,
        output: contentToText(message.content),
      },
    ]
  }

  if (message.role === 'assistant' && message.toolCalls?.length) {
    return message.toolCalls.map(toResponsesFunctionCall)
  }

  const role = message.role === 'system' ? 'developer' : message.role
  return [
    {
      role,
      content: Array.isArray(message.content)
        ? message.content.map((part) =>
            toResponsesContentPart(part, role === 'developer' ? 'system' : role)
          )
        : message.content,
    },
  ]
}

function toResponsesFunctionCall(toolCall: ProviderToolCall): Record<string, unknown> {
  const [callId, itemId] = toolCall.id.split('|')
  return {
    type: 'function_call',
    id: itemId || undefined,
    call_id: callId || toolCall.id,
    name: toolCall.function.name,
    arguments: toolCall.function.arguments,
  }
}

function toResponsesContentPart(
  part: ProviderContentPart,
  role: ProviderMessage['role']
): Record<string, unknown> {
  if (part.type === 'text') {
    return { type: role === 'assistant' ? 'output_text' : 'input_text', text: part.text }
  }
  if (part.type === 'image_url') {
    return { type: 'input_image', detail: 'auto', image_url: part.image_url.url }
  }
  return { type: 'input_text', text: '[audio input omitted]' }
}

function toResponsesTool(tool: ProviderTool): Record<string, unknown> {
  return {
    type: 'function',
    name: tool.function.name,
    description: tool.function.description,
    parameters: tool.function.parameters,
    strict: null,
  }
}

function parseEvent(eventText: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(eventText) as unknown
    return isRecord(parsed) ? parsed : {}
  } catch (error) {
    throwProviderError(
      {
        code: 'provider_bad_request',
        message: 'OpenAI Codex returned malformed SSE JSON.',
        retryable: false,
        providerBodyPreview: eventText.slice(0, 1000),
      },
      error
    )
  }
}

function findPendingToolCall(
  pending: Map<string, PendingFunctionCall>,
  event: Record<string, unknown>
): PendingFunctionCall | undefined {
  const callId = stringValue(event.call_id)
  const itemId = stringValue(event.item_id)
  if (callId && pending.has(callId)) return pending.get(callId)
  if (itemId && pending.has(itemId)) return pending.get(itemId)
  return [...pending.values()].at(-1)
}

function upsertDoneToolCall(
  pending: Map<string, PendingFunctionCall>,
  item: Record<string, unknown>,
  fallbackIndex: number
): PendingFunctionCall {
  const callId = stringValue(item.call_id)
  const id = stringValue(item.id)
  const existing = (callId ? pending.get(callId) : undefined) ?? (id ? pending.get(id) : undefined)
  const toolCall =
    existing ??
    ({
      index: fallbackIndex,
      name: '',
      arguments: '',
    } satisfies PendingFunctionCall)
  toolCall.id = id || toolCall.id
  toolCall.callId = callId || toolCall.callId
  toolCall.name = stringValue(item.name) || toolCall.name
  toolCall.arguments = stringValue(item.arguments) || toolCall.arguments
  pending.set(toolCallKey(toolCall), toolCall)
  return toolCall
}

function toolCallKey(toolCall: PendingFunctionCall): string {
  return toolCall.callId || toolCall.id || String(toolCall.index)
}

function toProviderToolCall(toolCall: PendingFunctionCall): ProviderToolCall {
  return {
    id: toProviderToolCallId(toolCall),
    type: 'function',
    function: {
      name: toolCall.name,
      arguments: toolCall.arguments,
    },
  }
}

function toProviderToolCallId(toolCall: PendingFunctionCall): string {
  return [toolCall.callId, toolCall.id].filter(Boolean).join('|') || `call_${toolCall.index}`
}

function parseResponsesUsage(value: unknown): TokenUsage | undefined {
  if (!isRecord(value)) {
    return undefined
  }
  const inputDetails = isRecord(value.input_tokens_details) ? value.input_tokens_details : undefined
  const outputDetails = isRecord(value.output_tokens_details)
    ? value.output_tokens_details
    : undefined
  return {
    input: numberValue(value.input_tokens),
    output: numberValue(value.output_tokens),
    cachedInput: numberValue(inputDetails?.cached_tokens),
    reasoning: numberValue(outputDetails?.reasoning_tokens),
    total: numberValue(value.total_tokens),
  }
}

function mapStopReason(status: string): string | undefined {
  if (!status) return undefined
  if (!CODEX_RESPONSE_STATUSES.has(status)) return undefined
  if (status === 'incomplete') return 'length'
  if (status === 'failed' || status === 'cancelled') return 'error'
  return 'stop'
}

async function parseCodexError(response: Response) {
  if (response.status === 401 || response.status === 403) {
    return errorFromResponse(response)
  }
  const text = await response.text().catch(() => '')
  let message = text || response.statusText || 'OpenAI Codex request failed.'
  try {
    const parsed = JSON.parse(text) as unknown
    if (isRecord(parsed) && isRecord(parsed.error)) {
      message = stringValue(parsed.error.message) || message
    }
  } catch {
    // Use raw text preview.
  }
  return {
    code:
      response.status === 429
        ? 'provider_rate_limit'
        : response.status >= 500
          ? 'network'
          : 'provider_bad_request',
    message,
    retryable: response.status === 429 || response.status >= 500,
    providerStatus: response.status,
    providerBodyPreview: text.slice(0, 1000),
  } as const
}

function contentToText(content: ProviderMessage['content']): string {
  if (typeof content === 'string') return content
  return content
    .map((part) => {
      if (part.type === 'text') return part.text
      if (part.type === 'image_url') return `[image: ${part.image_url.url}]`
      return '[audio input]'
    })
    .join('\n')
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

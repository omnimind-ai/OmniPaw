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
import {
  loadModelsDevMetadata,
  lookupModelMetadata,
  parseProviderModelMetadata,
} from '../models-dev-metadata'
import { parseSseStream } from './openai'

export const ANTHROPIC_FALLBACK_CONTEXT_WINDOW = 200_000

const DEFAULT_ANTHROPIC_VERSION = '2023-06-01'
const DEFAULT_MAX_OUTPUT_TOKENS = 4096
const SUPPORTED_IMAGE_MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])

export interface AnthropicCompatibleProviderOptions {
  id: string
  baseUrl: string
  apiKey?: string
  authHeader?: string
  headers?: Record<string, string>
  extraBody?: Record<string, unknown>
  fetch?: typeof fetch
}

interface AnthropicMessagePayload {
  role: 'user' | 'assistant'
  content: Array<Record<string, unknown>>
}

interface PreparedAnthropicMessages {
  system: Array<Record<string, unknown>>
  messages: AnthropicMessagePayload[]
}

interface PendingToolUse {
  index: number
  id: string
  name: string
  arguments: string
  initialInputProvided: boolean
  sawJsonDelta: boolean
}

export class AnthropicCompatibleProvider implements BaseProvider {
  readonly id: string

  private readonly baseUrl: string
  private readonly apiKey?: string
  private readonly authHeader?: string
  private readonly headers: Record<string, string>
  private readonly extraBody: Record<string, unknown>
  private readonly fetchImpl: typeof fetch

  constructor(options: AnthropicCompatibleProviderOptions) {
    this.id = options.id
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.apiKey = options.apiKey
    this.authHeader = options.authHeader
    this.headers = options.headers ?? {}
    this.extraBody = options.extraBody ?? {}
    this.fetchImpl = options.fetch ?? fetch
  }

  async *streamChat(request: ChatCompletionRequest): AsyncIterable<ChatCompletionChunk> {
    try {
      const response = await this.fetchImpl(this.endpoint('messages'), {
        method: 'POST',
        headers: this.buildHeaders('text/event-stream', true),
        body: JSON.stringify(this.buildChatBody(request)),
        signal: request.abortSignal,
      })

      if (!response.ok) {
        throwProviderError(await errorFromResponse(response))
      }

      if (isJsonResponse(response)) {
        yield* parseAnthropicMessageResponse(response)
        return
      }

      if (!response.body) {
        throwProviderError({
          code: 'network',
          message: 'Anthropic-compatible provider response did not include a stream body.',
          retryable: true,
          providerStatus: response.status,
        })
      }

      const pendingTools = new Map<number, PendingToolUse>()
      const finalizedToolIndexes = new Set<number>()
      let usage: TokenUsage | undefined
      let finishReason: string | undefined
      let sawEvent = false
      let sawUsableOutput = false

      for await (const eventText of parseSseStream(response.body)) {
        if (eventText === '[DONE]') {
          const remainingTools = finalizePendingTools(pendingTools, finalizedToolIndexes)
          if (remainingTools.length) {
            sawUsableOutput = true
            yield {
              type: 'tool_call_final',
              toolCalls: remainingTools,
              done: false,
              finishReason: finishReason ?? 'tool_calls',
              usage,
            }
          }
          ensureUsableOutput(sawUsableOutput)
          yield { type: 'final', done: true, finishReason, usage }
          return
        }

        sawEvent = true
        const event = parseAnthropicEvent(eventText)
        const eventType = stringValue(event.type)

        if (eventType === 'error') {
          throwAnthropicStreamError(event, eventText)
        }

        if (eventType === 'message_start') {
          const message = isRecord(event.message) ? event.message : undefined
          usage = mergeAnthropicUsage(usage, message?.usage)
          continue
        }

        if (eventType === 'content_block_start') {
          const index = integerValue(event.index) ?? pendingTools.size
          const block = isRecord(event.content_block) ? event.content_block : undefined
          const blockType = stringValue(block?.type)

          if (blockType === 'text') {
            const text = stringValue(block?.text)
            if (text) {
              sawUsableOutput = true
              yield { type: 'delta', content: text, done: false, usage, raw: event }
            }
            continue
          }

          if (blockType === 'thinking') {
            const reasoning = stringValue(block?.thinking)
            const reasoningSignature = stringValue(block?.signature)
            if (reasoning || reasoningSignature) {
              sawUsableOutput = sawUsableOutput || Boolean(reasoning)
              yield {
                type: 'delta',
                reasoning: reasoning || undefined,
                reasoningSignature: reasoningSignature || undefined,
                done: false,
                usage,
                raw: event,
              }
            }
            continue
          }

          if (blockType === 'tool_use') {
            const initialInput =
              isRecord(block?.input) && Object.keys(block.input).length
                ? JSON.stringify(block.input)
                : ''
            const pending: PendingToolUse = {
              index,
              id: stringValue(block?.id),
              name: stringValue(block?.name),
              arguments: initialInput,
              initialInputProvided: Boolean(initialInput),
              sawJsonDelta: false,
            }
            pendingTools.set(index, pending)
            sawUsableOutput = true
            yield {
              type: 'tool_call_delta',
              index,
              id: pending.id || undefined,
              toolCallType: 'function',
              name: pending.name || undefined,
              argumentsDelta: initialInput || undefined,
              done: false,
              usage,
              raw: event,
            }
          }
          continue
        }

        if (eventType === 'content_block_delta') {
          const index = integerValue(event.index) ?? 0
          const delta = isRecord(event.delta) ? event.delta : undefined
          const deltaType = stringValue(delta?.type)

          if (deltaType === 'text_delta') {
            const text = stringValue(delta?.text)
            if (text) {
              sawUsableOutput = true
              yield { type: 'delta', content: text, done: false, usage, raw: event }
            }
            continue
          }

          if (deltaType === 'thinking_delta') {
            const reasoning = stringValue(delta?.thinking)
            if (reasoning) {
              sawUsableOutput = true
              yield { type: 'delta', reasoning, done: false, usage, raw: event }
            }
            continue
          }

          if (deltaType === 'signature_delta') {
            const reasoningSignature = stringValue(delta?.signature)
            if (reasoningSignature) {
              yield {
                type: 'delta',
                reasoningSignature,
                done: false,
                usage,
                raw: event,
              }
            }
            continue
          }

          if (deltaType === 'input_json_delta') {
            const argumentsDelta = stringValue(delta?.partial_json)
            const pending = pendingTools.get(index)
            if (pending && argumentsDelta) {
              if (!pending.sawJsonDelta && pending.initialInputProvided) {
                pending.arguments = ''
              }
              pending.sawJsonDelta = true
              pending.arguments += argumentsDelta
              sawUsableOutput = true
              yield {
                type: 'tool_call_delta',
                index,
                id: pending.id || undefined,
                toolCallType: 'function',
                name: pending.name || undefined,
                argumentsDelta,
                done: false,
                usage,
                raw: event,
              }
            }
          }
          continue
        }

        if (eventType === 'content_block_stop') {
          const index = integerValue(event.index)
          if (index === undefined || finalizedToolIndexes.has(index)) {
            continue
          }
          const pending = pendingTools.get(index)
          if (pending) {
            finalizedToolIndexes.add(index)
            yield {
              type: 'tool_call_final',
              toolCalls: [toProviderToolCall(pending)],
              done: false,
              finishReason: finishReason ?? 'tool_calls',
              usage,
              raw: event,
            }
          }
          continue
        }

        if (eventType === 'message_delta') {
          const delta = isRecord(event.delta) ? event.delta : undefined
          finishReason = mapAnthropicStopReason(stringValue(delta?.stop_reason)) ?? finishReason
          usage = mergeAnthropicUsage(usage, event.usage)
          continue
        }

        if (eventType === 'message_stop') {
          const remainingTools = finalizePendingTools(pendingTools, finalizedToolIndexes)
          if (remainingTools.length) {
            sawUsableOutput = true
            yield {
              type: 'tool_call_final',
              toolCalls: remainingTools,
              done: false,
              finishReason: finishReason ?? 'tool_calls',
              usage,
              raw: event,
            }
          }
          ensureUsableOutput(sawUsableOutput)
          yield { type: 'final', done: true, finishReason, usage, raw: event }
          return
        }
      }

      const remainingTools = finalizePendingTools(pendingTools, finalizedToolIndexes)
      if (remainingTools.length) {
        sawUsableOutput = true
        yield {
          type: 'tool_call_final',
          toolCalls: remainingTools,
          done: false,
          finishReason: finishReason ?? 'tool_calls',
          usage,
        }
      }
      if (!sawEvent) {
        ensureUsableOutput(false)
      }
      ensureUsableOutput(sawUsableOutput)
      yield { type: 'final', done: true, finishReason, usage }
    } catch (error) {
      throwProviderError(normalizeProviderError(error), error)
    }
  }

  async test(modelId?: string, signal?: AbortSignal): Promise<void> {
    if (!this.hasConfiguredCredential()) {
      throwProviderError({
        code: 'provider_auth',
        message: 'Provider credential is not configured.',
        retryable: false,
      })
    }

    const body = this.buildChatBody({
      modelId: modelId ?? 'claude-3-5-haiku-latest',
      messages: [{ role: 'user', content: 'ping' }],
      maxOutputTokens: 1,
    })
    body.stream = false

    const response = await this.fetchImpl(this.endpoint('messages'), {
      method: 'POST',
      headers: this.buildHeaders('application/json', true),
      body: JSON.stringify(body),
      signal,
    }).catch((error: unknown) => {
      throwProviderError(normalizeProviderError(error), error)
    })

    if (!response.ok) {
      throwProviderError(await errorFromResponse(response))
    }
  }

  async listModels(signal?: AbortSignal): Promise<ProviderModelCandidate[]> {
    const response = await this.fetchImpl(this.endpoint('models'), {
      method: 'GET',
      headers: this.buildHeaders('application/json', false),
      signal,
    }).catch((error: unknown) => {
      throwProviderError(normalizeProviderError(error), error)
    })

    if (!response.ok) {
      throwProviderError(await errorFromResponse(response))
    }

    const payload = await response.json().catch((error: unknown) => {
      throwProviderError(
        {
          code: 'provider_bad_request',
          message: 'Anthropic-compatible provider returned malformed model list JSON.',
          retryable: false,
          providerStatus: response.status,
        },
        error
      )
    })
    if (!isRecord(payload) || !Array.isArray(payload.data)) {
      return []
    }

    let metadata: Awaited<ReturnType<typeof loadModelsDevMetadata>> | undefined
    try {
      metadata = await loadModelsDevMetadata({ fetchImpl: this.fetchImpl, signal })
    } catch {
      metadata = undefined
    }

    return payload.data
      .filter(isRecord)
      .flatMap((model) => {
        const id = stringValue(model.id)
        if (!id) {
          return []
        }

        const inlineMetadata = parseProviderModelMetadata(model)
        const catalogMetadata = metadata
          ? (lookupModelMetadata(metadata, id) ??
            lookupModelMetadata(metadata, stringValue(model.display_name)))
          : undefined
        const capabilities = isRecord(model.capabilities) ? model.capabilities : undefined
        const imageInput =
          capabilitySupported(capabilities?.image_input) ??
          inlineMetadata.input?.includes('image') ??
          catalogMetadata?.input?.includes('image')
        const input: ProviderModelCandidate['input'] = imageInput ? ['text', 'image'] : ['text']

        return [
          {
            id,
            name: stringValue(model.display_name) || stringValue(model.name) || id,
            input: mergeInput(input, inlineMetadata.input, catalogMetadata?.input),
            supportsTools: inlineMetadata.supportsTools ?? catalogMetadata?.supportsTools ?? true,
            supportsReasoning:
              capabilitySupported(capabilities?.thinking) ??
              inlineMetadata.supportsReasoning ??
              catalogMetadata?.supportsReasoning ??
              false,
            contextWindow:
              positiveInteger(model.max_input_tokens) ??
              inlineMetadata.contextWindow ??
              catalogMetadata?.contextWindow ??
              ANTHROPIC_FALLBACK_CONTEXT_WINDOW,
            maxOutputTokens:
              positiveInteger(model.max_tokens) ??
              inlineMetadata.maxOutputTokens ??
              catalogMetadata?.maxOutputTokens,
          },
        ]
      })
      .sort((left, right) => left.id.localeCompare(right.id))
  }

  private buildChatBody(request: ChatCompletionRequest): Record<string, unknown> {
    const prepared = prepareAnthropicMessages(request.messages)
    const configuredMaxTokens = positiveInteger(this.extraBody.max_tokens)
    const body: Record<string, unknown> = {
      ...this.extraBody,
      model: request.modelId,
      messages: prepared.messages,
      max_tokens: request.maxOutputTokens ?? configuredMaxTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
      stream: true,
    }

    if (prepared.system.length) {
      body.system = prepared.system
    } else {
      delete body.system
    }

    if (request.temperature !== undefined) {
      body.temperature = request.temperature
    }

    if (request.topP !== undefined) {
      body.top_p = request.topP
    }

    if (request.tools?.length) {
      body.tools = request.tools.map(toAnthropicTool)
      if (body.tool_choice === undefined) {
        body.tool_choice = { type: 'auto' }
      }
    } else {
      delete body.tools
      delete body.tool_choice
    }

    return body
  }

  private buildHeaders(accept: string, includeJsonContentType: boolean): Headers {
    const headers = new Headers(this.headers)
    if (!headers.has('Accept')) {
      headers.set('Accept', accept)
    }
    if (includeJsonContentType && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }
    if (!headers.has('anthropic-version')) {
      headers.set('anthropic-version', DEFAULT_ANTHROPIC_VERSION)
    }

    if (this.apiKey) {
      const authHeader = this.authHeader?.trim() || 'x-api-key'
      headers.set(
        authHeader,
        authHeader.toLowerCase() === 'authorization' ? `Bearer ${this.apiKey}` : this.apiKey
      )
    }

    return headers
  }

  private hasConfiguredCredential(): boolean {
    if (this.apiKey) {
      return true
    }
    const headers = new Headers(this.headers)
    const authHeader = this.authHeader?.trim()
    return Boolean(
      headers.has('authorization') ||
        headers.has('x-api-key') ||
        (authHeader && headers.has(authHeader))
    )
  }

  private endpoint(resource: 'messages' | 'models'): string {
    if (/\/(messages|models)$/i.test(this.baseUrl)) {
      return this.baseUrl.replace(/\/(messages|models)$/i, `/${resource}`)
    }
    if (/\/v\d+(?:beta)?$/i.test(this.baseUrl)) {
      return `${this.baseUrl}/${resource}`
    }
    return `${this.baseUrl}/v1/${resource}`
  }
}

function prepareAnthropicMessages(messages: ProviderMessage[]): PreparedAnthropicMessages {
  const system: Array<Record<string, unknown>> = []
  const converted: AnthropicMessagePayload[] = []

  for (const message of messages) {
    if (message.role === 'system') {
      const text = contentToText(message.content).trim()
      if (text) {
        system.push({ type: 'text', text })
      }
      continue
    }

    if (message.role === 'tool') {
      if (!message.toolCallId) {
        continue
      }
      converted.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: message.toolCallId,
            content: contentToText(message.content) || '<empty response>',
          },
        ],
      })
      continue
    }

    const content: Array<Record<string, unknown>> = []
    if (message.role === 'assistant' && message.reasoningContent && message.reasoningSignature) {
      content.push({
        type: 'thinking',
        thinking: message.reasoningContent,
        signature: message.reasoningSignature,
      })
    }
    content.push(...toAnthropicContentBlocks(message.content, message.role))

    if (message.role === 'assistant') {
      for (const toolCall of message.toolCalls ?? []) {
        if (!toolCall.id || !toolCall.function.name) {
          continue
        }
        content.push({
          type: 'tool_use',
          id: toolCall.id,
          name: toolCall.function.name,
          input: parseToolInput(toolCall.function.arguments),
        })
      }
    }

    if (!content.length) {
      continue
    }
    converted.push({ role: message.role, content })
  }

  return {
    system,
    messages: sanitizeAnthropicMessages(mergeConsecutiveMessages(converted)),
  }
}

function toAnthropicContentBlocks(
  content: ProviderMessage['content'],
  role: Exclude<ProviderMessage['role'], 'system' | 'tool'>
): Array<Record<string, unknown>> {
  const parts: ProviderContentPart[] =
    typeof content === 'string' ? [{ type: 'text', text: content }] : content
  const blocks: Array<Record<string, unknown>> = []

  for (const part of parts) {
    if (part.type === 'text') {
      if (part.text) {
        blocks.push({ type: 'text', text: part.text })
      }
      continue
    }

    if (part.type === 'image_url') {
      if (role !== 'user') {
        blocks.push({ type: 'text', text: '[image omitted]' })
        continue
      }
      const source = anthropicImageSource(part.image_url.url)
      if (source) {
        blocks.push({ type: 'image', source })
      } else {
        blocks.push({ type: 'text', text: '[unsupported image omitted]' })
      }
      continue
    }

    blocks.push({ type: 'text', text: '[audio input omitted]' })
  }

  return blocks
}

function anthropicImageSource(url: string): Record<string, unknown> | undefined {
  if (/^https?:\/\//i.test(url)) {
    return { type: 'url', url }
  }

  if (!url.startsWith('data:')) {
    return undefined
  }
  const separator = url.indexOf(',')
  if (separator < 0) {
    return undefined
  }
  const metadata = url.slice('data:'.length, separator)
  if (!metadata.toLowerCase().includes(';base64')) {
    return undefined
  }
  const data = url.slice(separator + 1)
  if (!data) {
    return undefined
  }

  const declaredMediaType = metadata.split(';')[0]?.trim().toLowerCase()
  const mediaType = detectImageMediaType(data) ?? declaredMediaType
  if (!mediaType || !SUPPORTED_IMAGE_MEDIA_TYPES.has(mediaType)) {
    return undefined
  }

  return {
    type: 'base64',
    media_type: mediaType,
    data,
  }
}

function detectImageMediaType(base64Data: string): string | undefined {
  try {
    const bytes = Buffer.from(base64Data, 'base64')
    if (
      bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    ) {
      return 'image/png'
    }
    if (bytes[0] === 0xff && bytes[1] === 0xd8) {
      return 'image/jpeg'
    }
    const signature = bytes.subarray(0, 6).toString('ascii')
    if (signature === 'GIF87a' || signature === 'GIF89a') {
      return 'image/gif'
    }
    if (
      bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
      bytes.subarray(8, 12).toString('ascii') === 'WEBP'
    ) {
      return 'image/webp'
    }
  } catch {
    return undefined
  }
  return undefined
}

function mergeConsecutiveMessages(messages: AnthropicMessagePayload[]): AnthropicMessagePayload[] {
  const merged: AnthropicMessagePayload[] = []
  for (const message of messages) {
    const previous = merged.at(-1)
    if (previous?.role === message.role) {
      const content = [...previous.content, ...message.content]
      previous.content =
        message.role === 'user'
          ? [
              ...content.filter((block) => block.type === 'tool_result'),
              ...content.filter((block) => block.type !== 'tool_result'),
            ]
          : content
      continue
    }
    merged.push({ role: message.role, content: [...message.content] })
  }
  return merged
}

function sanitizeAnthropicMessages(messages: AnthropicMessagePayload[]): AnthropicMessagePayload[] {
  const sanitized: AnthropicMessagePayload[] = []
  let pendingToolUseIds = new Set<string>()

  for (const message of messages) {
    if (message.role === 'assistant') {
      pendingToolUseIds = new Set(
        message.content
          .filter((block) => block.type === 'tool_use')
          .map((block) => stringValue(block.id))
          .filter(Boolean)
      )
      sanitized.push({ role: message.role, content: [...message.content] })
      continue
    }

    const toolResults: Array<Record<string, unknown>> = []
    const otherBlocks: Array<Record<string, unknown>> = []
    for (const block of message.content) {
      if (block.type !== 'tool_result') {
        otherBlocks.push(block)
        continue
      }
      const toolUseId = stringValue(block.tool_use_id)
      if (toolUseId && pendingToolUseIds.has(toolUseId)) {
        toolResults.push(block)
        pendingToolUseIds.delete(toolUseId)
      }
    }

    const content = [...toolResults, ...otherBlocks]
    if (content.length) {
      sanitized.push({ role: message.role, content })
    }
    pendingToolUseIds = new Set()
  }

  return mergeConsecutiveMessages(sanitized)
}

function toAnthropicTool(tool: ProviderTool): Record<string, unknown> {
  return {
    name: tool.function.name,
    description: tool.function.description,
    input_schema: tool.function.parameters,
  }
}

function parseToolInput(value: string): Record<string, unknown> {
  try {
    const parsed = value.trim() ? (JSON.parse(value) as unknown) : {}
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

async function* parseAnthropicMessageResponse(
  response: Response
): AsyncIterable<ChatCompletionChunk> {
  const payload = await response.json().catch((error: unknown) => {
    throwProviderError(
      {
        code: 'provider_bad_request',
        message: 'Anthropic-compatible provider returned malformed message JSON.',
        retryable: false,
        providerStatus: response.status,
      },
      error
    )
  })
  if (!isRecord(payload)) {
    throwMalformedAnthropicResponse()
  }

  const usage = mergeAnthropicUsage(undefined, payload.usage)
  const finishReason = mapAnthropicStopReason(stringValue(payload.stop_reason))
  const toolCalls: ProviderToolCall[] = []
  let sawUsableOutput = false

  for (const block of Array.isArray(payload.content) ? payload.content : []) {
    if (!isRecord(block)) {
      continue
    }
    const blockType = stringValue(block.type)
    if (blockType === 'text') {
      const content = stringValue(block.text)
      if (content) {
        sawUsableOutput = true
        yield { type: 'delta', content, done: false, finishReason, usage, raw: payload }
      }
      continue
    }
    if (blockType === 'thinking') {
      const reasoning = stringValue(block.thinking)
      const reasoningSignature = stringValue(block.signature)
      if (reasoning || reasoningSignature) {
        sawUsableOutput = sawUsableOutput || Boolean(reasoning)
        yield {
          type: 'delta',
          reasoning: reasoning || undefined,
          reasoningSignature: reasoningSignature || undefined,
          done: false,
          finishReason,
          usage,
          raw: payload,
        }
      }
      continue
    }
    if (blockType === 'tool_use') {
      sawUsableOutput = true
      toolCalls.push({
        id: requiredString(block.id, 'tool use id'),
        type: 'function',
        function: {
          name: requiredString(block.name, 'tool use name'),
          arguments: JSON.stringify(isRecord(block.input) ? block.input : {}),
        },
      })
    }
  }

  if (toolCalls.length) {
    yield {
      type: 'tool_call_final',
      toolCalls,
      done: false,
      finishReason: finishReason ?? 'tool_calls',
      usage,
      raw: payload,
    }
  }

  ensureUsableOutput(sawUsableOutput)
  yield { type: 'final', done: true, finishReason, usage, raw: payload }
}

function parseAnthropicEvent(eventText: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(eventText) as unknown
    if (isRecord(parsed)) {
      return parsed
    }
  } catch (error) {
    throwProviderError(
      {
        code: 'provider_bad_request',
        message: 'Anthropic-compatible provider returned malformed SSE JSON.',
        retryable: false,
        providerBodyPreview: eventText.slice(0, 1000),
      },
      error
    )
  }
  throwMalformedAnthropicResponse()
}

function throwAnthropicStreamError(event: Record<string, unknown>, raw: string): never {
  const error = isRecord(event.error) ? event.error : undefined
  const errorType = stringValue(error?.type)
  const message = stringValue(error?.message) || 'Anthropic-compatible provider stream failed.'
  const code =
    errorType === 'authentication_error' || errorType === 'permission_error'
      ? 'provider_auth'
      : errorType === 'rate_limit_error'
        ? 'provider_rate_limit'
        : errorType === 'overloaded_error' || errorType === 'api_error'
          ? 'network'
          : message.toLowerCase().includes('context') || message.toLowerCase().includes('token')
            ? 'provider_context_length'
            : 'provider_bad_request'

  throwProviderError({
    code,
    message,
    retryable:
      code === 'network' || code === 'provider_rate_limit' || errorType === 'overloaded_error',
    providerBodyPreview: raw.slice(0, 1000),
  })
}

function finalizePendingTools(
  pendingTools: Map<number, PendingToolUse>,
  finalizedToolIndexes: Set<number>
): ProviderToolCall[] {
  const toolCalls: ProviderToolCall[] = []
  for (const [index, pending] of pendingTools) {
    if (finalizedToolIndexes.has(index)) {
      continue
    }
    finalizedToolIndexes.add(index)
    toolCalls.push(toProviderToolCall(pending))
  }
  return toolCalls
}

function toProviderToolCall(tool: PendingToolUse): ProviderToolCall {
  return {
    id: requiredString(tool.id, 'tool use id'),
    type: 'function',
    function: {
      name: requiredString(tool.name, 'tool use name'),
      arguments: tool.arguments || '{}',
    },
  }
}

function mergeAnthropicUsage(
  current: TokenUsage | undefined,
  value: unknown
): TokenUsage | undefined {
  if (!isRecord(value)) {
    return current
  }

  const inputTokens = numberValue(value.input_tokens)
  const cacheCreationTokens = numberValue(value.cache_creation_input_tokens)
  const cacheReadTokens = numberValue(value.cache_read_input_tokens)
  const outputTokens = numberValue(value.output_tokens)
  const reasoningTokens = numberValue(value.thinking_tokens) ?? numberValue(value.reasoning_tokens)
  const hasInputUpdate =
    inputTokens !== undefined || cacheCreationTokens !== undefined || cacheReadTokens !== undefined
  const input = hasInputUpdate
    ? (inputTokens ?? 0) + (cacheCreationTokens ?? 0) + (cacheReadTokens ?? 0)
    : current?.input
  const output = outputTokens ?? current?.output
  const cachedInput = cacheReadTokens ?? current?.cachedInput
  const reasoning = reasoningTokens ?? current?.reasoning
  const explicitTotal = numberValue(value.total_tokens)
  const total =
    explicitTotal ??
    (input !== undefined || output !== undefined ? (input ?? 0) + (output ?? 0) : current?.total)

  if (
    input === undefined &&
    output === undefined &&
    cachedInput === undefined &&
    reasoning === undefined &&
    total === undefined
  ) {
    return current
  }

  return { input, output, cachedInput, reasoning, total }
}

function mapAnthropicStopReason(value: string): string | undefined {
  if (!value) {
    return undefined
  }
  if (value === 'tool_use') {
    return 'tool_calls'
  }
  if (value === 'max_tokens' || value === 'model_context_window_exceeded') {
    return 'length'
  }
  if (value === 'end_turn' || value === 'stop_sequence' || value === 'pause_turn') {
    return 'stop'
  }
  return value
}

function contentToText(content: ProviderMessage['content']): string {
  if (typeof content === 'string') {
    return content
  }
  return content
    .map((part) => {
      if (part.type === 'text') {
        return part.text
      }
      if (part.type === 'image_url') {
        return '[image]'
      }
      return '[audio input]'
    })
    .join('\n')
}

function mergeInput(
  ...values: Array<ProviderModelCandidate['input'] | undefined>
): ProviderModelCandidate['input'] {
  const merged = new Set<NonNullable<ProviderModelCandidate['input']>[number]>()
  for (const value of values) {
    for (const input of value ?? []) {
      merged.add(input)
    }
  }
  return merged.size ? Array.from(merged) : ['text']
}

function capabilitySupported(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value
  }
  return isRecord(value) && typeof value.supported === 'boolean' ? value.supported : undefined
}

function isJsonResponse(response: Response): boolean {
  return response.headers.get('content-type')?.toLowerCase().includes('application/json') ?? false
}

function ensureUsableOutput(sawUsableOutput: boolean): void {
  if (sawUsableOutput) {
    return
  }
  throwProviderError({
    code: 'provider_bad_request',
    message:
      'Anthropic-compatible provider returned an empty message response. Check the configured base URL, model ID, and streaming compatibility.',
    retryable: false,
  })
}

function throwMalformedAnthropicResponse(): never {
  throwProviderError({
    code: 'provider_bad_request',
    message: 'Anthropic-compatible provider returned a malformed message response.',
    retryable: false,
  })
}

function requiredString(value: unknown, label: string): string {
  const normalized = stringValue(value)
  if (normalized) {
    return normalized
  }
  throwProviderError({
    code: 'provider_bad_request',
    message: `Anthropic-compatible provider returned a malformed ${label}.`,
    retryable: false,
  })
}

function positiveInteger(value: unknown): number | undefined {
  const number =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : undefined
  return typeof number === 'number' && Number.isFinite(number) && number > 0
    ? Math.floor(number)
    : undefined
}

function integerValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined
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

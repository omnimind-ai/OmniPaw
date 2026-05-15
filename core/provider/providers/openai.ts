import type {
  BaseProvider,
  ChatCompletionChunk,
  ChatCompletionRequest,
  ProviderContentPart,
  ProviderMessage,
  ProviderModelCandidate,
  ProviderToolCall,
  TokenUsage,
} from '../base-provider'
import { errorFromResponse, normalizeProviderError, throwProviderError } from '../errors'

export interface OpenAICompatibleProviderOptions {
  id: string
  baseUrl: string
  apiKey?: string
  authHeader?: string
  headers?: Record<string, string>
  extraBody?: Record<string, unknown>
  maxTokensField?: 'max_tokens' | 'max_completion_tokens'
  fetch?: typeof fetch
}

interface OpenAIChunkChoice {
  delta?: {
    content?: string | null
    reasoning_content?: string | null
    tool_calls?: unknown
  }
  finish_reason?: string | null
}

interface OpenAIStreamChunk {
  choices?: OpenAIChunkChoice[]
  usage?: unknown
}

export class OpenAICompatibleProvider implements BaseProvider {
  readonly id: string

  private readonly baseUrl: string
  private readonly apiKey?: string
  private readonly authHeader?: string
  private readonly headers: Record<string, string>
  private readonly extraBody: Record<string, unknown>
  private readonly maxTokensField: 'max_tokens' | 'max_completion_tokens'
  private readonly fetchImpl: typeof fetch

  constructor(options: string | OpenAICompatibleProviderOptions) {
    const normalized = typeof options === 'string' ? { id: options, baseUrl: 'https://api.openai.com/v1' } : options

    this.id = normalized.id
    this.baseUrl = normalized.baseUrl.replace(/\/+$/, '')
    this.apiKey = normalized.apiKey
    this.authHeader = normalized.authHeader
    this.headers = normalized.headers ?? {}
    this.extraBody = normalized.extraBody ?? {}
    this.maxTokensField = normalized.maxTokensField ?? 'max_tokens'
    this.fetchImpl = normalized.fetch ?? fetch
  }

  async *streamChat(request: ChatCompletionRequest): AsyncIterable<ChatCompletionChunk> {
    try {
      const response = await this.fetchImpl(this.url('/chat/completions'), {
        method: 'POST',
        headers: this.buildHeaders(true),
        body: JSON.stringify(this.buildChatBody(request)),
        signal: request.abortSignal,
      })

      if (!response.ok) {
        throwProviderError(await errorFromResponse(response))
      }

      if (!response.body) {
        throwProviderError({
          code: 'network',
          message: 'Provider response did not include a stream body.',
          retryable: true,
          providerStatus: response.status,
        })
      }

      let finalUsage: TokenUsage | undefined
      let finishReason: string | undefined

      for await (const event of parseSseStream(response.body)) {
        if (event === '[DONE]') {
          yield {
            type: 'final',
            done: true,
            finishReason,
            usage: finalUsage,
          }
          return
        }

        const chunk = parseChunk(event)
        const choice = chunk.choices?.[0]
        const content = choice?.delta?.content ?? undefined
        const reasoning = choice?.delta?.reasoning_content ?? undefined

        finishReason = choice?.finish_reason ?? finishReason
        finalUsage = parseUsage(chunk.usage) ?? finalUsage

        if (content || reasoning) {
          yield {
            type: 'delta',
            content,
            reasoning,
            done: false,
            finishReason,
            usage: finalUsage,
            raw: chunk,
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
    if (!this.apiKey && !this.authHeader) {
      throwProviderError({
        code: 'provider_auth',
        message: 'Provider credential is not configured.',
        retryable: false,
      })
    }

    const response = await this.fetchImpl(this.url('/chat/completions'), {
      method: 'POST',
      headers: this.buildHeaders(true),
      body: JSON.stringify({
        model: modelId ?? 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'ping' }],
        stream: false,
        max_tokens: 1,
      }),
      signal,
    }).catch((error: unknown) => {
      throwProviderError(normalizeProviderError(error), error)
    })

    if (!response.ok) {
      throwProviderError(await errorFromResponse(response))
    }
  }

  async listModels(signal?: AbortSignal): Promise<ProviderModelCandidate[]> {
    const response = await this.fetchImpl(this.url('/models'), {
      method: 'GET',
      headers: this.buildHeaders(false),
      signal,
    }).catch((error: unknown) => {
      throwProviderError(normalizeProviderError(error), error)
    })

    if (!response.ok) {
      throwProviderError(await errorFromResponse(response))
    }

    const payload = (await response.json()) as unknown
    if (!isRecord(payload) || !Array.isArray(payload.data)) {
      return []
    }

    return payload.data
      .filter(isRecord)
      .map((model) => ({
        id: String(model.id),
        name: typeof model.id === 'string' ? model.id : String(model.id),
      }))
      .filter((model) => model.id && model.id !== 'undefined')
  }

  private buildChatBody(request: ChatCompletionRequest): Record<string, unknown> {
    const body: Record<string, unknown> = {
      ...this.extraBody,
      model: request.modelId,
      messages: request.messages.map(toOpenAIMessage),
      stream: true,
      stream_options: { include_usage: true },
    }

    if (request.temperature !== undefined) {
      body.temperature = request.temperature
    }

    if (request.topP !== undefined) {
      body.top_p = request.topP
    }

    if (request.maxOutputTokens !== undefined) {
      body[this.maxTokensField] = request.maxOutputTokens
    }

    if (request.tools?.length) {
      body.tools = request.tools
    }

    return body
  }

  private buildHeaders(includeJsonContentType: boolean): HeadersInit {
    const headers: Record<string, string> = {
      Accept: 'text/event-stream',
      ...this.headers,
    }

    if (includeJsonContentType) {
      headers['Content-Type'] = 'application/json'
    }

    if (this.authHeader) {
      headers.Authorization = this.authHeader
    } else if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`
    }

    return headers
  }

  private url(path: string): string {
    return `${this.baseUrl}${path}`
  }
}

export async function* parseSseStream(stream: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let dataLines: string[] = []

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) {
        break
      }

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ''

      const result = readSseLines(lines, dataLines)
      dataLines = result.pendingDataLines
      for (const event of result.events) {
        yield event
      }
    }

    buffer += decoder.decode()
    if (buffer) {
      const result = readSseLines(buffer.split(/\r?\n/), dataLines)
      dataLines = result.pendingDataLines
      for (const event of result.events) {
        yield event
      }
    }

    if (dataLines.length) {
      yield dataLines.join('\n')
    }
  } finally {
    reader.releaseLock()
  }
}

export function parseUsage(value: unknown): TokenUsage | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const input = numberValue(value.prompt_tokens)
  const output = numberValue(value.completion_tokens)
  const total = numberValue(value.total_tokens)
  const promptDetails = isRecord(value.prompt_tokens_details) ? value.prompt_tokens_details : undefined
  const completionDetails = isRecord(value.completion_tokens_details) ? value.completion_tokens_details : undefined

  return {
    input,
    output,
    total,
    cachedInput: numberValue(promptDetails?.cached_tokens),
    reasoning: numberValue(completionDetails?.reasoning_tokens),
  }
}

function readSseLines(
  lines: string[],
  pendingDataLines: string[],
): { events: string[]; pendingDataLines: string[] } {
  const events: string[] = []
  let dataLines = pendingDataLines

  for (const line of lines) {
    if (line.trim() === '') {
      if (dataLines.length) {
        events.push(dataLines.join('\n'))
        dataLines = []
      }
      continue
    }

    if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trimStart())
    }
  }

  return { events, pendingDataLines: dataLines }
}

function parseChunk(event: string): OpenAIStreamChunk {
  try {
    return JSON.parse(event) as OpenAIStreamChunk
  } catch (error) {
    throwProviderError({
      code: 'provider_bad_request',
      message: 'Provider returned malformed SSE JSON.',
      retryable: false,
      providerBodyPreview: event.slice(0, 1000),
    }, error)
  }
}

function toOpenAIMessage(message: ProviderMessage): Record<string, unknown> {
  const result: Record<string, unknown> = {
    role: message.role,
    content: Array.isArray(message.content) ? message.content.map(toOpenAIContentPart) : message.content,
  }

  if (message.toolCalls?.length) {
    result.tool_calls = message.toolCalls.map(toOpenAIToolCall)
  }

  if (message.toolCallId) {
    result.tool_call_id = message.toolCallId
  }

  return result
}

function toOpenAIContentPart(part: ProviderContentPart): Record<string, unknown> {
  return part
}

function toOpenAIToolCall(toolCall: ProviderToolCall): Record<string, unknown> {
  return {
    id: toolCall.id,
    type: toolCall.type,
    function: toolCall.function,
  }
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

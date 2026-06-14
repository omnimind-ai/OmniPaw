import type {
  BaseProvider,
  ChatCompletionChunk,
  ChatCompletionRequest,
  ProviderContentPart,
  ProviderMessage,
  ProviderModelCandidate,
  ProviderToolCall,
  TextEmbeddingRequest,
  TextEmbeddingResponse,
  TokenUsage,
} from '../base-provider'
import { errorFromResponse, normalizeProviderError, throwProviderError } from '../errors'
import {
  loadModelsDevMetadata,
  lookupModelMetadata,
  OPENAI_COMPATIBLE_FALLBACK_CONTEXT_WINDOW,
  parseProviderModelMetadata,
} from '../models-dev-metadata'

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

interface OpenAIChatCompletionChoice {
  message?: {
    content?: unknown
    reasoning_content?: unknown
    tool_calls?: unknown
  }
  finish_reason?: string | null
}

interface OpenAIChatCompletionResponse {
  choices?: OpenAIChatCompletionChoice[]
  usage?: unknown
}

interface OpenAIModelListItem {
  id: string
  name?: string
  metadata: Record<string, unknown>
}

interface PendingToolCall {
  id?: string
  type?: ProviderToolCall['type']
  name: string
  arguments: string
}

interface ParsedToolCallDelta {
  index: number
  id?: string
  toolCallType?: ProviderToolCall['type']
  name?: string
  argumentsDelta?: string
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
    const normalized =
      typeof options === 'string' ? { id: options, baseUrl: 'https://api.openai.com/v1' } : options

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

      if (isJsonResponse(response)) {
        yield* parseChatCompletionResponse(response)
        return
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
      const toolCallsByIndex = new Map<number, PendingToolCall>()
      let yieldedToolCallFinal = false
      let sawEvent = false
      let sawOutput = false

      for await (const event of parseSseStream(response.body)) {
        sawEvent = true
        if (event === '[DONE]') {
          if (!sawOutput && !finalUsage && !finishReason) {
            throwEmptyChatResponse()
          }
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
        const toolCallDeltas = parseToolCallDeltas(choice?.delta?.tool_calls, toolCallsByIndex)

        finishReason = choice?.finish_reason ?? finishReason
        finalUsage = parseUsage(chunk.usage) ?? finalUsage

        if (content || reasoning) {
          sawOutput = true
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

        for (const toolCallDelta of toolCallDeltas) {
          sawOutput = true
          yield {
            type: 'tool_call_delta',
            ...toolCallDelta,
            done: false,
            finishReason,
            usage: finalUsage,
            raw: chunk,
          }
        }

        if (choice?.finish_reason === 'tool_calls' && !yieldedToolCallFinal) {
          yieldedToolCallFinal = true
          sawOutput = true
          yield {
            type: 'tool_call_final',
            toolCalls: buildFinalToolCalls(toolCallsByIndex),
            done: false,
            finishReason,
            usage: finalUsage,
            raw: chunk,
          }
        }
      }

      if (!sawEvent || (!sawOutput && !finalUsage && !finishReason)) {
        throwEmptyChatResponse()
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

  async embedTexts(request: TextEmbeddingRequest): Promise<TextEmbeddingResponse> {
    try {
      const response = await this.fetchImpl(this.url('/embeddings'), {
        method: 'POST',
        headers: this.buildHeaders(true, 'application/json'),
        body: JSON.stringify({
          model: request.modelId,
          input: request.input,
        }),
        signal: request.abortSignal,
      })

      if (!response.ok) {
        throwProviderError(await errorFromResponse(response))
      }

      const payload = await response.json().catch((error: unknown) => {
        throwProviderError(normalizeProviderError(error), error)
      })
      const embeddings = parseEmbeddingPayload(payload, request.input.length)
      if (!embeddings.length) {
        throwProviderError({
          code: 'provider_bad_request',
          message: 'Provider returned an empty embedding response.',
          retryable: false,
          providerStatus: response.status,
        })
      }

      return {
        embeddings,
        modelId: isRecord(payload)
          ? stringValue(payload.model) || request.modelId
          : request.modelId,
      }
    } catch (error) {
      throwProviderError(normalizeProviderError(error), error)
    }
  }

  async listModels(signal?: AbortSignal): Promise<ProviderModelCandidate[]> {
    const response = await this.fetchImpl(this.url('/models'), {
      method: 'GET',
      headers: this.buildHeaders(false, 'application/json'),
      signal,
    }).catch((error: unknown) => {
      throwProviderError(normalizeProviderError(error), error)
    })

    if (!response.ok) {
      throwProviderError(await errorFromResponse(response))
    }

    const body = await response.text().catch((error: unknown) => {
      throwProviderError(normalizeProviderError(error), error)
    })
    const payload = parseModelListPayload(body)
    if (!isRecord(payload) || !Array.isArray(payload.data)) {
      return []
    }

    const remoteModels = payload.data
      .filter(isRecord)
      .map((model): OpenAIModelListItem => {
        const id = stringValue(model.id)
        return {
          id,
          name: stringValue(model.name) || id,
          metadata: model,
        }
      })
      .filter((model) => model.id && model.id !== 'undefined')

    let metadata: Map<string, ReturnType<typeof parseProviderModelMetadata>> | undefined
    try {
      metadata = await loadModelsDevMetadata({ fetchImpl: this.fetchImpl, signal })
    } catch {
      metadata = undefined
    }

    return remoteModels.map((model) => {
      const inlineMetadata = parseProviderModelMetadata(model.metadata)
      const catalogMetadata = metadata
        ? (lookupModelMetadata(metadata, model.id) ??
          lookupModelMetadata(metadata, model.name ?? ''))
        : undefined
      const contextWindow =
        inlineMetadata.contextWindow ??
        catalogMetadata?.contextWindow ??
        OPENAI_COMPATIBLE_FALLBACK_CONTEXT_WINDOW

      return {
        id: model.id,
        name: model.name ?? model.id,
        input: inlineMetadata.input ?? catalogMetadata?.input ?? ['text'],
        supportsTools: inlineMetadata.supportsTools ?? catalogMetadata?.supportsTools ?? false,
        supportsReasoning:
          inlineMetadata.supportsReasoning ?? catalogMetadata?.supportsReasoning ?? false,
        contextWindow,
        maxOutputTokens: inlineMetadata.maxOutputTokens ?? catalogMetadata?.maxOutputTokens,
      }
    })
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

  private buildHeaders(includeJsonContentType: boolean, accept = 'text/event-stream'): HeadersInit {
    const headers: Record<string, string> = {
      Accept: accept,
      ...this.headers,
    }

    if (includeJsonContentType) {
      headers['Content-Type'] = 'application/json'
    }

    if (this.apiKey) {
      const authHeaderName = this.authHeader?.trim() || 'Authorization'
      headers[authHeaderName] =
        authHeaderName.toLowerCase() === 'authorization' ? `Bearer ${this.apiKey}` : this.apiKey
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
  const promptDetails = isRecord(value.prompt_tokens_details)
    ? value.prompt_tokens_details
    : undefined
  const completionDetails = isRecord(value.completion_tokens_details)
    ? value.completion_tokens_details
    : undefined

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
  pendingDataLines: string[]
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

function parseModelListPayload(body: string): unknown {
  const trimmed = body.trim()
  if (!trimmed) {
    return undefined
  }

  const directJson = parseJsonValue(trimmed)
  if (directJson.ok) {
    return directJson.value
  }

  const events = parseSseTextEvents(trimmed)
  for (const event of events) {
    const eventText = event.trim()
    if (!eventText || eventText === '[DONE]') {
      continue
    }

    const eventJson = parseJsonValue(eventText)
    if (!eventJson.ok) {
      throwMalformedModelListPayload(eventJson.error, trimmed)
    }

    return eventJson.value
  }

  throwMalformedModelListPayload(directJson.error, trimmed)
}

function parseSseTextEvents(body: string): string[] {
  const result = readSseLines(body.split(/\r?\n/), [])
  return [
    ...result.events,
    ...(result.pendingDataLines.length ? [result.pendingDataLines.join('\n')] : []),
  ]
}

function parseJsonValue(
  text: string
): { ok: true; value: unknown } | { ok: false; error: unknown } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown }
  } catch (error) {
    return { ok: false, error }
  }
}

function throwMalformedModelListPayload(error: unknown, body: string): never {
  throwProviderError(
    {
      code: 'provider_bad_request',
      message: 'Provider returned malformed model list JSON.',
      retryable: false,
      providerBodyPreview: body.slice(0, 1000),
    },
    error
  )
}

function parseEmbeddingPayload(payload: unknown, expectedCount: number): number[][] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throwProviderError({
      code: 'provider_bad_request',
      message: 'Provider returned malformed embedding JSON.',
      retryable: false,
    })
  }

  const rows = payload.data
    .filter(isRecord)
    .map((item) => ({
      index: typeof item.index === 'number' ? item.index : undefined,
      embedding: parseEmbeddingVector(item.embedding),
    }))
    .filter((item) => item.embedding.length)

  if (!rows.length) {
    return []
  }

  const sorted = rows.every((item) => item.index !== undefined)
    ? rows.sort((left, right) => (left.index ?? 0) - (right.index ?? 0))
    : rows
  const embeddings = sorted.map((item) => item.embedding)
  return expectedCount > 0 ? embeddings.slice(0, expectedCount) : embeddings
}

function parseEmbeddingVector(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => (typeof item === 'number' && Number.isFinite(item) ? item : undefined))
    .filter((item): item is number => item !== undefined)
}

function parseChunk(event: string): OpenAIStreamChunk {
  try {
    return JSON.parse(event) as OpenAIStreamChunk
  } catch (error) {
    throwProviderError(
      {
        code: 'provider_bad_request',
        message: 'Provider returned malformed SSE JSON.',
        retryable: false,
        providerBodyPreview: event.slice(0, 1000),
      },
      error
    )
  }
}

async function* parseChatCompletionResponse(
  response: Response
): AsyncIterable<ChatCompletionChunk> {
  const payload = (await response.json().catch((error: unknown) => {
    throwProviderError(
      {
        code: 'provider_bad_request',
        message: 'Provider returned malformed chat completion JSON.',
        retryable: false,
      },
      error
    )
  })) as OpenAIChatCompletionResponse

  if (!isRecord(payload)) {
    throwMalformedChatCompletionResponse()
  }

  const choice = Array.isArray(payload.choices) ? payload.choices.find(isRecord) : undefined
  const message = isRecord(choice?.message) ? choice.message : undefined
  const content = parseMessageText(message?.content)
  const reasoning = stringValue(message?.reasoning_content) || undefined
  const usage = parseUsage(payload.usage)
  const finishReason = typeof choice?.finish_reason === 'string' ? choice.finish_reason : undefined
  const toolCalls = parseChatCompletionToolCalls(message?.tool_calls)

  if (content || reasoning) {
    yield {
      type: 'delta',
      content,
      reasoning,
      done: false,
      finishReason,
      usage,
      raw: payload,
    }
  }

  if (toolCalls.length) {
    yield {
      type: 'tool_call_final',
      toolCalls,
      done: false,
      finishReason,
      usage,
      raw: payload,
    }
  }

  if (!content && !reasoning && !toolCalls.length && !usage && !finishReason) {
    throwEmptyChatResponse()
  }

  yield {
    type: 'final',
    done: true,
    finishReason,
    usage,
    raw: payload,
  }
}

function parseMessageText(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value || undefined
  }
  if (!Array.isArray(value)) {
    return undefined
  }

  const text = value
    .map((part) => {
      if (!isRecord(part)) {
        return undefined
      }
      return part.type === 'text' ? stringValue(part.text) : undefined
    })
    .filter((part): part is string => Boolean(part))
    .join('')
  return text || undefined
}

function parseChatCompletionToolCalls(value: unknown): ProviderToolCall[] {
  if (value === undefined || value === null) {
    return []
  }
  if (!Array.isArray(value)) {
    throwMalformedChatCompletionResponse()
  }

  return value.map((item) => {
    if (!isRecord(item) || !isRecord(item.function)) {
      throwMalformedChatCompletionResponse()
    }
    const id = stringValue(item.id)
    const name = stringValue(item.function.name)
    const args = stringValue(item.function.arguments)
    const type = stringValue(item.type) || 'function'
    if (!id || type !== 'function' || !name) {
      throwMalformedChatCompletionResponse()
    }

    return {
      id,
      type: 'function',
      function: {
        name,
        arguments: args || '',
      },
    }
  })
}

function throwMalformedChatCompletionResponse(): never {
  throwProviderError({
    code: 'provider_bad_request',
    message: 'Provider returned malformed chat completion JSON.',
    retryable: false,
  })
}

function throwEmptyChatResponse(): never {
  throwProviderError({
    code: 'provider_bad_request',
    message:
      'Provider returned an empty chat completion response. Check the configured base URL, model ID, and streaming compatibility.',
    retryable: false,
  })
}

function parseToolCallDeltas(
  value: unknown,
  toolCallsByIndex: Map<number, PendingToolCall>
): ParsedToolCallDelta[] {
  if (value === undefined || value === null) {
    return []
  }

  if (!Array.isArray(value)) {
    throwMalformedToolCallDelta(
      'Provider returned malformed tool call delta: tool_calls must be an array.'
    )
  }

  const deltas: ParsedToolCallDelta[] = []

  for (const item of value) {
    if (!isRecord(item)) {
      throwMalformedToolCallDelta(
        'Provider returned malformed tool call delta: each tool call must be an object.'
      )
    }

    const rawIndex = parseToolCallIndex(item.index)
    const id = optionalStringField(item, 'id', 'tool call id')
    const toolCallType = parseToolCallType(optionalStringField(item, 'type', 'tool call type'))
    const functionDelta = item.function
    let nameDelta: string | undefined
    let argumentsDelta: string | undefined

    if (functionDelta !== undefined && functionDelta !== null) {
      if (!isRecord(functionDelta)) {
        throwMalformedToolCallDelta(
          'Provider returned malformed tool call delta: function must be an object.'
        )
      }
      nameDelta = optionalStringField(functionDelta, 'name', 'tool call function name')
      argumentsDelta = optionalStringField(
        functionDelta,
        'arguments',
        'tool call function arguments'
      )
    }

    const index = normalizeToolCallDeltaIndex({
      rawIndex,
      id,
      toolCallType,
      nameDelta,
      argumentsDelta,
      toolCallsByIndex,
    })
    const pending = getPendingToolCall(toolCallsByIndex, index)

    if (id !== undefined) {
      pending.id = id
    }
    if (toolCallType !== undefined) {
      pending.type = toolCallType
    }
    if (nameDelta !== undefined) {
      pending.name += nameDelta
    }
    if (argumentsDelta !== undefined) {
      pending.arguments += argumentsDelta
    }

    if (isUsefulToolCallDelta(id, toolCallType, nameDelta, argumentsDelta)) {
      deltas.push({
        index,
        id,
        toolCallType,
        name: nameDelta,
        argumentsDelta,
      })
    }
  }

  return deltas
}

function normalizeToolCallDeltaIndex(input: {
  rawIndex: number
  id?: string
  toolCallType?: ProviderToolCall['type']
  nameDelta?: string
  argumentsDelta?: string
  toolCallsByIndex: Map<number, PendingToolCall>
}): number {
  if (input.toolCallsByIndex.has(input.rawIndex)) {
    return input.rawIndex
  }

  if (
    input.argumentsDelta !== undefined &&
    !input.id &&
    !input.toolCallType &&
    !input.nameDelta &&
    input.toolCallsByIndex.size === 1
  ) {
    const existingIndex = input.toolCallsByIndex.keys().next().value
    if (typeof existingIndex === 'number') {
      return existingIndex
    }
  }

  return input.rawIndex
}

function buildFinalToolCalls(toolCallsByIndex: Map<number, PendingToolCall>): ProviderToolCall[] {
  const entries = [...toolCallsByIndex.entries()].sort(([left], [right]) => left - right)
  if (!entries.length) {
    throwMalformedToolCallDelta(
      'Provider finished with tool_calls but did not stream any tool calls.'
    )
  }

  return entries.map(([index, toolCall]) => {
    if (!toolCall.id) {
      throwMalformedToolCallDelta(
        `Provider finished with incomplete tool call at index ${index}: missing id.`
      )
    }
    if (!toolCall.name) {
      throwMalformedToolCallDelta(
        `Provider finished with incomplete tool call at index ${index}: missing function name.`
      )
    }

    return {
      id: toolCall.id,
      type: toolCall.type ?? 'function',
      function: {
        name: toolCall.name,
        arguments: toolCall.arguments,
      },
    }
  })
}

function getPendingToolCall(
  toolCallsByIndex: Map<number, PendingToolCall>,
  index: number
): PendingToolCall {
  const existing = toolCallsByIndex.get(index)
  if (existing) {
    return existing
  }

  const pending: PendingToolCall = {
    name: '',
    arguments: '',
  }
  toolCallsByIndex.set(index, pending)
  return pending
}

function parseToolCallIndex(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throwMalformedToolCallDelta(
      'Provider returned malformed tool call delta: index must be a non-negative integer.'
    )
  }
  return value
}

function parseToolCallType(value: string | undefined): ProviderToolCall['type'] | undefined {
  if (value === undefined) {
    return undefined
  }
  if (value !== 'function') {
    throwMalformedToolCallDelta(`Provider returned unsupported tool call type: ${value}.`)
  }
  return value
}

function optionalStringField(
  record: Record<string, unknown>,
  key: string,
  label: string
): string | undefined {
  const value = record[key]
  if (value === undefined || value === null) {
    return undefined
  }
  if (typeof value !== 'string') {
    throwMalformedToolCallDelta(
      `Provider returned malformed tool call delta: ${label} must be a string.`
    )
  }
  return value
}

function isUsefulToolCallDelta(
  id: string | undefined,
  toolCallType: ProviderToolCall['type'] | undefined,
  nameDelta: string | undefined,
  argumentsDelta: string | undefined
): boolean {
  return Boolean(id || toolCallType || nameDelta || argumentsDelta)
}

function throwMalformedToolCallDelta(message: string): never {
  throwProviderError({
    code: 'provider_bad_request',
    message,
    retryable: false,
  })
}

function toOpenAIMessage(message: ProviderMessage): Record<string, unknown> {
  const result: Record<string, unknown> = {
    role: message.role,
    content: Array.isArray(message.content)
      ? message.content.map(toOpenAIContentPart)
      : message.content,
  }

  if (message.reasoningContent) {
    result.reasoning_content = message.reasoningContent
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

function isJsonResponse(response: Response): boolean {
  return response.headers.get('content-type')?.toLowerCase().includes('application/json') ?? false
}

function stringValue(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim()
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

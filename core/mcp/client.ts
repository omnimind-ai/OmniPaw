import { Buffer } from 'node:buffer'
import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'

import type { AgentToolResult, AgentToolResultContent } from '@core/agent/tools/types'
import type { McpErrorCode, McpServerRecord } from '@shared/types/mcp'
import { mcpError, redactSecretText } from './schema'

export interface McpClientTool {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
  annotations?: Record<string, unknown>
  title?: string
}

export interface McpClient {
  listTools(server: McpServerRecord, signal?: AbortSignal): Promise<McpClientTool[]>
  callTool(
    server: McpServerRecord,
    toolName: string,
    args: unknown,
    signal?: AbortSignal
  ): Promise<AgentToolResult>
}

export class McpClientError extends Error {
  readonly code: McpErrorCode
  readonly recoverable: boolean

  constructor(
    code: McpErrorCode,
    message: string,
    options: { recoverable?: boolean; cause?: unknown } = {}
  ) {
    super(redactSecretText(message), { cause: options.cause })
    this.name = 'McpClientError'
    this.code = code
    this.recoverable = options.recoverable ?? false
  }
}

export class JsonRpcMcpClient implements McpClient {
  async listTools(server: McpServerRecord, signal?: AbortSignal): Promise<McpClientTool[]> {
    return withJsonRpcSession(server, signal, async (session) => {
      await initialize(session, server, signal)

      const tools: McpClientTool[] = []
      let cursor: string | undefined
      do {
        const result = await session.request(
          'tools/list',
          cursor ? { cursor } : {},
          server.timeoutMs,
          signal,
          'discovery_failed'
        )
        const page = normalizeToolsListResult(result)
        tools.push(...page.tools)
        cursor = page.nextCursor
      } while (cursor)

      return tools
    })
  }

  async callTool(
    server: McpServerRecord,
    toolName: string,
    args: unknown,
    signal?: AbortSignal
  ): Promise<AgentToolResult> {
    return withJsonRpcSession(server, signal, async (session) => {
      await initialize(session, server, signal)
      const result = await session.request(
        'tools/call',
        { name: toolName, arguments: args ?? {} },
        server.toolTimeoutMs,
        signal,
        'mcp_io_error'
      )
      return normalizeToolCallResult(result)
    })
  }
}

export function normalizeMcpClientError(
  error: unknown,
  fallbackCode: McpErrorCode
): McpClientError {
  if (error instanceof McpClientError) {
    return error
  }

  if (isAbortError(error)) {
    return new McpClientError('mcp_io_error', 'MCP operation was aborted.', {
      recoverable: true,
      cause: error,
    })
  }

  if (error instanceof Error) {
    return new McpClientError(fallbackCode, error.message, { recoverable: true, cause: error })
  }

  return new McpClientError(fallbackCode, 'MCP operation failed.', {
    recoverable: true,
    cause: error,
  })
}

const STDIO_PROTOCOL_VERSION = '2024-11-05'
const STREAMABLE_HTTP_PROTOCOL_VERSION = '2025-06-18'
const HTTP_ACCEPT_HEADER = 'application/json, text/event-stream'

type HttpMcpServerRecord = McpServerRecord & {
  transport: Extract<McpServerRecord['transport'], { type: 'http' }>
}

type StdioMcpServerRecord = McpServerRecord & {
  transport: Extract<McpServerRecord['transport'], { type: 'stdio' }>
}

interface JsonRpcSession {
  readonly protocolVersion: string
  start(signal?: AbortSignal): void
  setProtocolVersion?(protocolVersion: string): void
  request(
    method: string,
    params: unknown,
    timeoutMs: number,
    signal: AbortSignal | undefined,
    errorCode: McpErrorCode
  ): Promise<unknown>
  notify(
    method: string,
    params: unknown,
    timeoutMs: number,
    signal: AbortSignal | undefined
  ): Promise<void> | void
  close(): Promise<void> | void
}

async function withJsonRpcSession<T>(
  server: McpServerRecord,
  signal: AbortSignal | undefined,
  execute: (session: JsonRpcSession) => Promise<T>
): Promise<T> {
  const session = createJsonRpcSession(server)
  try {
    session.start(signal)
    return await execute(session)
  } finally {
    await session.close()
  }
}

async function initialize(
  session: JsonRpcSession,
  server: McpServerRecord,
  signal?: AbortSignal
): Promise<void> {
  const result = await session.request(
    'initialize',
    {
      protocolVersion: session.protocolVersion,
      capabilities: {},
      clientInfo: {
        name: 'OpenOmniClaw',
        version: '1.0.0',
      },
    },
    server.timeoutMs,
    signal,
    'discovery_failed'
  )
  if (isRecord(result) && typeof result.protocolVersion === 'string') {
    session.setProtocolVersion?.(result.protocolVersion)
  }
  await session.notify('notifications/initialized', {}, server.timeoutMs, signal)
}

function createJsonRpcSession(server: McpServerRecord): JsonRpcSession {
  if (server.transport.type === 'stdio') {
    return new StdioJsonRpcSession(server as StdioMcpServerRecord)
  }
  return new StreamableHttpJsonRpcSession(server as HttpMcpServerRecord)
}

class StdioJsonRpcSession implements JsonRpcSession {
  readonly protocolVersion = STDIO_PROTOCOL_VERSION
  private child: ChildProcessWithoutNullStreams | undefined
  private buffer = Buffer.alloc(0)
  private nextId = 1
  private readonly pending = new Map<number, PendingRequest>()
  private stderr = ''
  private closing = false

  constructor(private readonly server: StdioMcpServerRecord) {}

  start(signal?: AbortSignal): void {
    const child = spawn(this.server.transport.command, this.server.transport.args, {
      cwd: this.server.transport.cwd,
      env: {
        ...process.env,
        ...this.server.transport.env,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
    })
    this.child = child

    child.stdout.on('data', (chunk: Buffer) => this.handleStdout(chunk))
    child.stderr.on('data', (chunk: Buffer) => {
      this.stderr = `${this.stderr}${chunk.toString('utf8')}`.slice(-4_000)
    })
    child.on('error', (error) =>
      this.failAll(
        new McpClientError(
          'mcp_io_error',
          `Failed to start MCP server "${this.server.name}": ${error.message}`,
          { recoverable: true, cause: error }
        )
      )
    )
    child.on('exit', (code, signalName) => {
      if (this.closing) {
        return
      }
      const suffix = this.stderrPreview()
      this.failAll(
        new McpClientError(
          'mcp_io_error',
          `MCP server "${this.server.name}" exited before completing the request (${signalName ?? code ?? 'unknown'}).${suffix}`,
          { recoverable: true }
        )
      )
    })

    if (signal) {
      if (signal.aborted) {
        this.close()
      } else {
        signal.addEventListener('abort', () => this.close(), { once: true })
      }
    }
  }

  request(
    method: string,
    params: unknown,
    timeoutMs: number,
    signal: AbortSignal | undefined,
    errorCode: McpErrorCode
  ): Promise<unknown> {
    const child = this.child
    if (!child || child.killed || !child.stdin.writable) {
      return Promise.reject(
        new McpClientError('mcp_io_error', 'MCP server process is not available.', {
          recoverable: true,
        })
      )
    }

    const id = this.nextId++
    return new Promise((resolve, reject) => {
      let timeout: NodeJS.Timeout | undefined
      const cleanup = () => {
        if (timeout) {
          clearTimeout(timeout)
        }
        signal?.removeEventListener('abort', abort)
        this.pending.delete(id)
      }
      const abort = () => {
        cleanup()
        this.close()
        reject(createAbortError('MCP request was aborted.'))
      }

      timeout = setTimeout(() => {
        cleanup()
        this.close()
        reject(
          new McpClientError(
            errorCode,
            `MCP request "${method}" timed out after ${timeoutMs}ms.${this.stderrPreview()}`,
            { recoverable: true }
          )
        )
      }, timeoutMs)

      if (signal) {
        if (signal.aborted) {
          abort()
          return
        }
        signal.addEventListener('abort', abort, { once: true })
      }

      this.pending.set(id, {
        resolve: (value) => {
          cleanup()
          resolve(value)
        },
        reject: (error) => {
          cleanup()
          reject(error)
        },
      })

      child.stdin.write(encodeMessage({ jsonrpc: '2.0', id, method, params }), (error) => {
        if (error) {
          const pending = this.pending.get(id)
          pending?.reject(
            new McpClientError(
              'mcp_io_error',
              `Failed to write MCP request "${method}": ${error.message}`,
              { recoverable: true, cause: error }
            )
          )
        }
      })
    })
  }

  notify(
    method: string,
    params: unknown,
    _timeoutMs: number,
    _signal: AbortSignal | undefined
  ): void {
    const child = this.child
    if (!child || child.killed || !child.stdin.writable) {
      return
    }
    child.stdin.write(encodeMessage({ jsonrpc: '2.0', method, params }))
  }

  close(): void {
    this.closing = true
    for (const pending of this.pending.values()) {
      pending.reject(createAbortError('MCP session was closed.'))
    }
    this.pending.clear()
    this.child?.stdin.destroy()
    if (this.child && !this.child.killed) {
      this.child.kill('SIGTERM')
    }
  }

  private handleStdout(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk])

    while (true) {
      const header = findHeaderEnd(this.buffer)
      if (!header) {
        return
      }

      const headerText = this.buffer.subarray(0, header.index).toString('ascii')
      const lengthMatch = /^Content-Length:\s*(\d+)$/im.exec(headerText)
      if (!lengthMatch) {
        this.failAll(
          new McpClientError('mcp_io_error', 'MCP response is missing Content-Length.', {
            recoverable: false,
          })
        )
        return
      }

      const length = Number(lengthMatch[1])
      const bodyStart = header.index + header.length
      if (this.buffer.length < bodyStart + length) {
        return
      }

      const body = this.buffer.subarray(bodyStart, bodyStart + length).toString('utf8')
      this.buffer = this.buffer.subarray(bodyStart + length)

      try {
        this.handleMessage(JSON.parse(body) as unknown)
      } catch (error) {
        this.failAll(
          new McpClientError(
            'mcp_io_error',
            error instanceof Error ? error.message : 'Failed to parse MCP response.',
            { recoverable: false, cause: error }
          )
        )
        return
      }
    }
  }

  private handleMessage(message: unknown): void {
    if (!isRecord(message)) {
      return
    }

    const id = typeof message.id === 'number' ? message.id : undefined
    if (id !== undefined && ('result' in message || 'error' in message)) {
      const pending = this.pending.get(id)
      if (!pending) {
        return
      }

      if (isRecord(message.error)) {
        pending.reject(
          new McpClientError(
            'mcp_io_error',
            typeof message.error.message === 'string'
              ? message.error.message
              : 'MCP server returned an error.',
            { recoverable: true }
          )
        )
        return
      }

      pending.resolve(message.result)
      return
    }

    if (id !== undefined && typeof message.method === 'string') {
      this.notifyResponse(id, {
        code: -32601,
        message: `Method not found: ${message.method}`,
      })
    }
  }

  private notifyResponse(id: number, error: { code: number; message: string }): void {
    const child = this.child
    if (!child || child.killed || !child.stdin.writable) {
      return
    }
    child.stdin.write(encodeMessage({ jsonrpc: '2.0', id, error }))
  }

  private failAll(error: Error): void {
    for (const pending of this.pending.values()) {
      pending.reject(error)
    }
    this.pending.clear()
  }

  private stderrPreview(): string {
    const preview = redactSecretText(this.stderr.trim()).slice(0, 1000)
    return preview ? ` Stderr: ${preview}` : ''
  }
}

class StreamableHttpJsonRpcSession implements JsonRpcSession {
  protocolVersion = STREAMABLE_HTTP_PROTOCOL_VERSION
  private nextId = 1
  private sessionId: string | undefined

  constructor(private readonly server: HttpMcpServerRecord) {}

  start(_signal?: AbortSignal): void {}

  setProtocolVersion(protocolVersion: string): void {
    if (protocolVersion.trim()) {
      this.protocolVersion = protocolVersion.trim()
    }
  }

  async request(
    method: string,
    params: unknown,
    timeoutMs: number,
    signal: AbortSignal | undefined,
    errorCode: McpErrorCode
  ): Promise<unknown> {
    const id = this.nextId++
    return this.postJsonRpc(
      { jsonrpc: '2.0', id, method, params },
      method,
      timeoutMs,
      signal,
      errorCode,
      (response, requestSignal) =>
        this.readJsonRpcResponse(response, id, method, errorCode, requestSignal)
    )
  }

  async notify(
    method: string,
    params: unknown,
    timeoutMs: number,
    signal: AbortSignal | undefined
  ): Promise<void> {
    await this.postJsonRpc(
      { jsonrpc: '2.0', method, params },
      method,
      timeoutMs,
      signal,
      'mcp_io_error',
      async (response) => {
        await response.body?.cancel().catch(() => undefined)
      }
    )
  }

  close(): void {}

  private async postJsonRpc<T>(
    message: unknown,
    method: string,
    timeoutMs: number,
    signal: AbortSignal | undefined,
    errorCode: McpErrorCode,
    handleResponse: (response: Response, signal: AbortSignal) => Promise<T>
  ): Promise<T> {
    const request = createRequestSignal(timeoutMs, signal)
    try {
      const response = await fetch(this.server.transport.url, {
        method: 'POST',
        headers: this.headersFor(method),
        body: JSON.stringify(message),
        signal: request.signal,
      })
      this.captureSessionId(response)
      if (!response.ok) {
        throw new McpClientError(
          errorCode,
          `MCP HTTP request "${method}" failed with status ${response.status}${response.statusText ? ` ${response.statusText}` : ''}.`,
          { recoverable: isRecoverableHttpStatus(response.status) }
        )
      }
      return await handleResponse(response, request.signal)
    } catch (error) {
      if (error instanceof McpClientError) {
        throw error
      }
      if (isAbortError(error)) {
        if (request.timedOut()) {
          throw new McpClientError(
            errorCode,
            `MCP HTTP request "${method}" timed out after ${timeoutMs}ms.`,
            { recoverable: true, cause: error }
          )
        }
        throw createAbortError('MCP request was aborted.')
      }
      if (error instanceof Error) {
        throw new McpClientError(errorCode, error.message, { recoverable: true, cause: error })
      }
      throw new McpClientError(errorCode, 'MCP HTTP request failed.', {
        recoverable: true,
        cause: error,
      })
    } finally {
      request.cleanup()
    }
  }

  private headersFor(method: string): Headers {
    const headers = new Headers(this.server.transport.headers)
    headers.set('Accept', HTTP_ACCEPT_HEADER)
    headers.set('Content-Type', 'application/json')
    if (method !== 'initialize') {
      headers.set('MCP-Protocol-Version', this.protocolVersion)
    }
    if (this.sessionId) {
      headers.set('Mcp-Session-Id', this.sessionId)
    }
    return headers
  }

  private captureSessionId(response: Response): void {
    const sessionId = response.headers.get('Mcp-Session-Id')
    if (!sessionId) {
      return
    }
    if (!isVisibleAscii(sessionId)) {
      throw new McpClientError('mcp_io_error', 'MCP server returned an invalid session ID.', {
        recoverable: false,
      })
    }
    this.sessionId = sessionId
  }

  private async readJsonRpcResponse(
    response: Response,
    id: number,
    method: string,
    errorCode: McpErrorCode,
    signal: AbortSignal
  ): Promise<unknown> {
    if (response.status === 202) {
      throw new McpClientError(
        errorCode,
        `MCP HTTP request "${method}" was accepted but did not return a JSON-RPC response.`,
        { recoverable: true }
      )
    }

    const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
    if (contentType.includes('text/event-stream')) {
      const message = await readSseJsonRpcResponse(response, id, method, errorCode, signal)
      return resultFromJsonRpcResponse(message, errorCode)
    }

    const text = await response.text()
    if (!text.trim()) {
      throw new McpClientError(
        errorCode,
        `MCP HTTP request "${method}" returned an empty response.`,
        { recoverable: true }
      )
    }

    try {
      const payload = JSON.parse(text) as unknown
      const message = findJsonRpcResponse(payload, id)
      if (!message) {
        throw new McpClientError(
          errorCode,
          `MCP HTTP request "${method}" did not return the expected JSON-RPC response.`,
          { recoverable: true }
        )
      }
      return resultFromJsonRpcResponse(message, errorCode)
    } catch (error) {
      if (error instanceof McpClientError) {
        throw error
      }
      throw new McpClientError(
        errorCode,
        error instanceof Error ? error.message : 'Failed to parse MCP HTTP response.',
        { recoverable: false, cause: error }
      )
    }
  }
}

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

function normalizeToolsListResult(result: unknown): {
  tools: McpClientTool[]
  nextCursor?: string
} {
  if (!isRecord(result)) {
    throw new McpClientError('discovery_failed', 'MCP tools/list returned an invalid response.')
  }

  const tools = Array.isArray(result.tools)
    ? result.tools.map(normalizeClientTool).filter((tool): tool is McpClientTool => Boolean(tool))
    : []

  return {
    tools,
    nextCursor: typeof result.nextCursor === 'string' ? result.nextCursor : undefined,
  }
}

function normalizeClientTool(value: unknown): McpClientTool | undefined {
  if (!isRecord(value) || typeof value.name !== 'string' || !value.name.trim()) {
    return undefined
  }

  return {
    name: value.name.trim(),
    description: typeof value.description === 'string' ? value.description : undefined,
    inputSchema: isRecord(value.inputSchema) ? structuredClone(value.inputSchema) : undefined,
    annotations: isRecord(value.annotations) ? structuredClone(value.annotations) : undefined,
    title: typeof value.title === 'string' ? value.title : undefined,
  }
}

function normalizeToolCallResult(result: unknown): AgentToolResult {
  if (isRecord(result) && result.isError === true) {
    throw new McpClientError(
      'mcp_io_error',
      textFromMcpContent(result.content) || 'MCP tool returned an error.',
      {
        recoverable: false,
      }
    )
  }

  if (!isRecord(result)) {
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
      details: result,
    }
  }

  const content = Array.isArray(result.content)
    ? result.content.map(normalizeContentPart)
    : [{ type: 'text' as const, text: JSON.stringify(result) }]

  return {
    content,
    details: structuredClone(result),
  }
}

function normalizeContentPart(part: unknown): AgentToolResultContent {
  if (isRecord(part) && part.type === 'text' && typeof part.text === 'string') {
    return { type: 'text', text: part.text }
  }
  if (
    isRecord(part) &&
    part.type === 'image' &&
    typeof part.data === 'string' &&
    typeof part.mimeType === 'string'
  ) {
    return { type: 'image', data: part.data, mimeType: part.mimeType }
  }
  return { type: 'text', text: JSON.stringify(part) }
}

function textFromMcpContent(content: unknown): string | undefined {
  if (!Array.isArray(content)) {
    return undefined
  }
  const text = content
    .map((part) =>
      isRecord(part) && part.type === 'text' && typeof part.text === 'string'
        ? part.text
        : undefined
    )
    .filter((part): part is string => Boolean(part))
    .join('\n')
    .trim()
  return text || undefined
}

function encodeMessage(message: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(message), 'utf8')
  return Buffer.concat([Buffer.from(`Content-Length: ${body.byteLength}\r\n\r\n`, 'ascii'), body])
}

function findHeaderEnd(buffer: Buffer): { index: number; length: number } | undefined {
  const crlf = buffer.indexOf('\r\n\r\n')
  const lf = buffer.indexOf('\n\n')

  if (crlf === -1 && lf === -1) {
    return undefined
  }
  if (crlf !== -1 && (lf === -1 || crlf <= lf)) {
    return { index: crlf, length: 4 }
  }
  return { index: lf, length: 2 }
}

function createAbortError(message: string): Error {
  const error = new Error(message)
  error.name = 'AbortError'
  return error
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function createRequestSignal(timeoutMs: number, upstream?: AbortSignal): RequestSignal {
  const controller = new AbortController()
  let timeoutHit = false
  const timeout = setTimeout(() => {
    timeoutHit = true
    controller.abort()
  }, timeoutMs)
  const abort = () => controller.abort(upstream?.reason)

  if (upstream?.aborted) {
    abort()
  } else {
    upstream?.addEventListener('abort', abort, { once: true })
  }

  return {
    signal: controller.signal,
    timedOut: () => timeoutHit,
    cleanup: () => {
      clearTimeout(timeout)
      upstream?.removeEventListener('abort', abort)
    },
  }
}

interface RequestSignal {
  signal: AbortSignal
  timedOut: () => boolean
  cleanup: () => void
}

async function readSseJsonRpcResponse(
  response: Response,
  id: number,
  method: string,
  errorCode: McpErrorCode,
  signal: AbortSignal
): Promise<Record<string, unknown>> {
  const body = response.body
  if (!body) {
    throw new McpClientError(
      errorCode,
      `MCP HTTP request "${method}" returned an empty event stream.`,
      { recoverable: true }
    )
  }

  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const abort = () => {
    void reader.cancel().catch(() => undefined)
  }

  try {
    if (signal.aborted) {
      abort()
    } else {
      signal.addEventListener('abort', abort, { once: true })
    }

    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      buffer += decoder.decode(value, { stream: true })
      const found = readBufferedSseResponse(buffer, id, errorCode)
      buffer = found.buffer
      if (found.message) {
        await reader.cancel().catch(() => undefined)
        return found.message
      }
    }

    if (signal.aborted) {
      throw createAbortError('MCP request was aborted.')
    }

    buffer += decoder.decode()
    const found = readBufferedSseResponse(`${buffer}\n\n`, id, errorCode)
    if (found.message) {
      return found.message
    }
  } catch (error) {
    if (error instanceof McpClientError) {
      throw error
    }
    if (isAbortError(error)) {
      throw error
    }
    throw new McpClientError(
      errorCode,
      error instanceof Error ? error.message : 'Failed to read MCP HTTP event stream.',
      { recoverable: true, cause: error }
    )
  } finally {
    signal.removeEventListener('abort', abort)
    reader.releaseLock()
  }

  throw new McpClientError(
    errorCode,
    `MCP HTTP request "${method}" event stream ended without the expected JSON-RPC response.`,
    { recoverable: true }
  )
}

function readBufferedSseResponse(
  initialBuffer: string,
  id: number,
  errorCode: McpErrorCode
): { buffer: string; message?: Record<string, unknown> } {
  let buffer = initialBuffer
  while (true) {
    const event = takeSseEvent(buffer)
    if (!event) {
      return { buffer }
    }
    buffer = event.rest
    const data = dataFromSseEvent(event.value)
    if (!data) {
      continue
    }
    let payload: unknown
    try {
      payload = JSON.parse(data)
    } catch (error) {
      throw new McpClientError(
        errorCode,
        error instanceof Error ? error.message : 'Failed to parse MCP HTTP event data.',
        { recoverable: false, cause: error }
      )
    }
    const message = findJsonRpcResponse(payload, id)
    if (message) {
      return { buffer, message }
    }
  }
}

function takeSseEvent(buffer: string): { value: string; rest: string } | undefined {
  const match = /\r?\n\r?\n/.exec(buffer)
  if (!match) {
    return undefined
  }
  return {
    value: buffer.slice(0, match.index),
    rest: buffer.slice(match.index + match[0].length),
  }
}

function dataFromSseEvent(event: string): string | undefined {
  const data = event
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).replace(/^ /, ''))
    .join('\n')
  return data.trim() ? data : undefined
}

function findJsonRpcResponse(payload: unknown, id: number): Record<string, unknown> | undefined {
  const messages = Array.isArray(payload) ? payload : [payload]
  return messages.find(
    (message): message is Record<string, unknown> =>
      isRecord(message) && message.id === id && ('result' in message || 'error' in message)
  )
}

function resultFromJsonRpcResponse(
  message: Record<string, unknown>,
  errorCode: McpErrorCode
): unknown {
  if (isRecord(message.error)) {
    throw new McpClientError(
      errorCode,
      typeof message.error.message === 'string'
        ? message.error.message
        : 'MCP server returned an error.',
      { recoverable: true }
    )
  }
  return message.result
}

function isRecoverableHttpStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500
}

function isVisibleAscii(value: string): boolean {
  return /^[\x21-\x7E]+$/.test(value)
}

export function mcpClientErrorToOperationError(error: unknown, fallbackCode: McpErrorCode) {
  const normalized = normalizeMcpClientError(error, fallbackCode)
  return mcpError(normalized.code, normalized.message, {
    recoverable: normalized.recoverable,
  })
}

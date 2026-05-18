import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { Buffer } from 'node:buffer'

import type { AgentToolResult, AgentToolResultContent } from '@core/agent/tool'
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
    assertSupportedTransport(server)

    return withStdioSession(server, signal, async (session) => {
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
    assertSupportedTransport(server)

    return withStdioSession(server, signal, async (session) => {
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

async function withStdioSession<T>(
  server: McpServerRecord,
  signal: AbortSignal | undefined,
  execute: (session: StdioJsonRpcSession) => Promise<T>
): Promise<T> {
  const session = new StdioJsonRpcSession(server)
  try {
    session.start(signal)
    return await execute(session)
  } finally {
    session.close()
  }
}

async function initialize(
  session: StdioJsonRpcSession,
  server: McpServerRecord,
  signal?: AbortSignal
): Promise<void> {
  await session.request(
    'initialize',
    {
      protocolVersion: '2024-11-05',
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
  session.notify('notifications/initialized', {})
}

class StdioJsonRpcSession {
  private child: ChildProcessWithoutNullStreams | undefined
  private buffer = Buffer.alloc(0)
  private nextId = 1
  private readonly pending = new Map<number, PendingRequest>()
  private stderr = ''
  private closing = false

  constructor(private readonly server: McpServerRecord) {}

  start(signal?: AbortSignal): void {
    if (this.server.transport.type !== 'stdio') {
      throw new McpClientError(
        'transport_unsupported',
        'Only stdio MCP transport is supported in this build.'
      )
    }

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

  notify(method: string, params: unknown): void {
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

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

function assertSupportedTransport(
  server: McpServerRecord
): asserts server is McpServerRecord & { transport: { type: 'stdio' } } {
  if (server.transport.type !== 'stdio') {
    throw new McpClientError('transport_unsupported', 'HTTP MCP transport is not supported yet.', {
      recoverable: false,
    })
  }
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

export function mcpClientErrorToOperationError(error: unknown, fallbackCode: McpErrorCode) {
  const normalized = normalizeMcpClientError(error, fallbackCode)
  return mcpError(normalized.code, normalized.message, {
    recoverable: normalized.recoverable,
  })
}

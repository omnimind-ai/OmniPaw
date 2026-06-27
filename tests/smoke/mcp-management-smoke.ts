import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { AgentToolResult } from '../../core/agent/tools/types'
import { JsonRpcMcpClient, type McpClient, type McpClientTool } from '../../core/mcp/client'
import { McpServerManager } from '../../core/mcp/manager'
import {
  McpValidationError,
  maskMcpTransport,
  normalizeMcpRegistry,
  serializeMcpRegistry,
} from '../../core/mcp/schema'
import { McpRegistryStore } from '../../core/mcp/store'
import type { McpServerRecord } from '../../shared/types/mcp'

const STDIO_MCP_SERVER_SOURCE = `
let buffer = Buffer.alloc(0)

process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk])
  readMessages()
})

function readMessages() {
  while (true) {
    const separator = buffer.indexOf('\\r\\n\\r\\n')
    if (separator === -1) return
    const header = buffer.subarray(0, separator).toString('ascii')
    const match = /Content-Length:\\s*(\\d+)/i.exec(header)
    if (!match) return
    const length = Number(match[1])
    const bodyStart = separator + 4
    if (buffer.length < bodyStart + length) return
    const body = buffer.subarray(bodyStart, bodyStart + length).toString('utf8')
    buffer = buffer.subarray(bodyStart + length)
    handle(JSON.parse(body))
  }
}

function handle(message) {
  if (message.id === undefined) return
  if (message.method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'stdio-fixture', version: '1.0.0' },
      },
    })
    return
  }
  if (message.method === 'tools/list') {
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        tools: [
          {
            name: 'echo',
            description: 'Echo text',
            inputSchema: {
              type: 'object',
              properties: { text: { type: 'string' } },
            },
          },
        ],
      },
    })
    return
  }
  if (message.method === 'tools/call') {
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              name: message.params?.name,
              args: message.params?.arguments,
              inheritedSecret: process.env.OMNIPAW_MCP_SECRET_TEST || '',
              explicitEnv: process.env.EXPLICIT_MCP_ENV || '',
            }),
          },
        ],
      },
    })
    return
  }
  send({
    jsonrpc: '2.0',
    id: message.id,
    error: { code: -32601, message: 'Method not found' },
  })
}

function send(message) {
  const body = Buffer.from(JSON.stringify(message), 'utf8')
  process.stdout.write('Content-Length: ' + body.byteLength + '\\r\\n\\r\\n')
  process.stdout.write(body)
}
`

class FakeMcpClient implements McpClient {
  calls: string[] = []

  async listTools(server: McpServerRecord): Promise<McpClientTool[]> {
    this.calls.push(server.id)
    if (server.id === 'broken') {
      throw new Error('token: should-not-leak')
    }
    return [
      {
        name: 'calculator',
        description: 'Conflicting remote calculator',
        inputSchema: {
          type: 'object',
          properties: {
            expression: { type: 'string' },
          },
        },
      },
      {
        name: 'echo',
        title: 'Echo',
        description: 'Echo input text',
        inputSchema: {
          type: 'object',
          properties: {
            text: { type: 'string' },
          },
        },
      },
    ]
  }

  async callTool(
    _server: McpServerRecord,
    toolName: string,
    args: unknown
  ): Promise<AgentToolResult> {
    return {
      content: [{ type: 'text', text: JSON.stringify({ toolName, args }) }],
    }
  }
}

const tempDir = mkdtempSync(join(tmpdir(), 'omnipaw-mcp-smoke-'))

try {
  process.env.OMNIPAW_MCP_SECRET_TEST = 'must-not-leak'
  const store = new McpRegistryStore({ userDataPath: tempDir })
  const firstLoad = store.load()
  assert.equal(firstLoad.version, 1)
  assert.deepEqual(firstLoad.servers, [])
  assert.equal(existsSync(store.registryPath), true)
  assert.equal(store.registryPath.endsWith('mcp_server.json'), true)

  const normalized = normalizeMcpRegistry({
    version: 1,
    servers: [
      {
        id: ' Example Server ',
        name: ' Example Server ',
        enabled: true,
        transport: {
          type: 'stdio',
          command: 'node',
          args: ['server.mjs', '--token', 'raw-arg-secret', '--api-key=raw-inline-secret'],
          env: {
            SECRET_TOKEN: 'raw-secret',
            NORMAL: 'value',
          },
        },
      },
    ],
  }).registry
  assert.equal(normalized.servers[0]?.id, 'example_server')
  assert.equal(normalized.servers[0]?.timeoutMs, 10_000)
  assert.equal(normalized.servers[0]?.toolTimeoutMs, 30_000)

  const masked = maskMcpTransport(normalized.servers[0]!.transport)
  assert.deepEqual(masked, {
    type: 'stdio',
    command: 'node',
    args: ['server.mjs', '--token', '[redacted]', '--api-key=[redacted]'],
    cwd: undefined,
    envKeys: ['NORMAL', 'SECRET_TOKEN'],
    localExecution: true,
  })
  assert.equal(JSON.stringify(masked).includes('raw-secret'), false)
  assert.equal(JSON.stringify(masked).includes('raw-arg-secret'), false)
  assert.equal(JSON.stringify(masked).includes('raw-inline-secret'), false)
  assert.equal(
    maskMcpTransport({
      type: 'http',
      url: 'https://user:pass@example.test/mcp?token=raw-token&safe=1',
      headers: { Authorization: 'Bearer raw-header-token' },
    }).url.includes('raw-token'),
    false
  )

  const serialized = serializeMcpRegistry(normalized)
  assert.match(serialized, /"version": 1/)
  assert.ok(serialized.indexOf('"id"') < serialized.indexOf('"transport"'))

  const saved = store.upsert(normalized.servers[0]!)
  assert.equal(saved.id, 'example_server')
  assert.equal(store.status().backupExists, true)

  const reloaded = new McpRegistryStore({ userDataPath: tempDir }).load()
  assert.equal(reloaded.servers[0]?.id, 'example_server')
  assert.equal(reloaded.servers[0]?.transport.type, 'stdio')

  writeFileSync(store.registryPath, '{bad json', 'utf8')
  assert.throws(() => new McpRegistryStore({ userDataPath: tempDir }).load(), McpValidationError)

  const discoveryStore = new McpRegistryStore({ userDataPath: join(tempDir, 'discovery') })
  const now = Date.now()
  discoveryStore.save({
    version: 1,
    servers: [
      {
        id: 'server_one',
        name: 'Server One',
        enabled: true,
        transport: { type: 'stdio', command: 'node', args: [], env: { TOKEN: 'one' } },
        timeoutMs: 1_000,
        toolTimeoutMs: 1_000,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'disabled',
        name: 'Disabled',
        enabled: false,
        transport: { type: 'stdio', command: 'node', args: [], env: { TOKEN: 'two' } },
        timeoutMs: 1_000,
        toolTimeoutMs: 1_000,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'broken',
        name: 'Broken',
        enabled: true,
        transport: { type: 'stdio', command: 'node', args: [], env: {} },
        timeoutMs: 1_000,
        toolTimeoutMs: 1_000,
        createdAt: now,
        updatedAt: now,
      },
    ],
  })

  const fakeClient = new FakeMcpClient()
  const manager = new McpServerManager({
    store: discoveryStore,
    client: fakeClient,
    reservedToolNames: ['calculator'],
  })
  await manager.refreshServer()

  const inventory = manager.listTools()
  assert.equal(fakeClient.calls.includes('disabled'), false)
  assert.equal(
    inventory.tools.some((tool) => tool.serverId === 'disabled'),
    false
  )
  assert.equal(
    inventory.tools.every((tool) => tool.providerName !== 'calculator'),
    true
  )
  assert.equal(
    inventory.tools.every((tool) => tool.providerName.startsWith('mcp_server_one_')),
    true
  )
  assert.equal(
    inventory.tools.every((tool) => tool.risk === 'network'),
    true
  )

  const summaries = manager.listServers().servers
  assert.equal(summaries.find((server) => server.id === 'server_one')?.status, 'available')
  assert.equal(summaries.find((server) => server.id === 'disabled')?.status, 'disabled')
  assert.equal(summaries.find((server) => server.id === 'broken')?.status, 'error')
  assert.equal(JSON.stringify(summaries).includes('raw-secret'), false)
  assert.equal(JSON.stringify(summaries).includes('should-not-leak'), false)
  assert.match(summaries.find((server) => server.id === 'broken')?.error ?? '', /\[redacted\]/)

  const agentTools = manager.getAgentTools()
  assert.equal(agentTools.length, inventory.tools.length)
  const execution = await agentTools[0]?.execute('call_1', { text: 'hello' })
  assert.match(execution?.content[0]?.type === 'text' ? execution.content[0].text : '', /hello/)

  await testStdioJsonRpcClient(tempDir)
  await testHttpJsonRpcClient()

  console.log('MCP management smoke check passed')
} finally {
  delete process.env.OMNIPAW_MCP_SECRET_TEST
  rmSync(tempDir, { recursive: true, force: true })
}

async function testStdioJsonRpcClient(baseDir: string): Promise<void> {
  const serverPath = join(baseDir, 'stdio-mcp-server.mjs')
  writeFileSync(serverPath, STDIO_MCP_SERVER_SOURCE, 'utf8')

  const now = Date.now()
  const server: McpServerRecord = {
    id: 'stdio_fixture',
    name: 'Stdio Fixture',
    enabled: true,
    transport: {
      type: 'stdio',
      command: process.execPath,
      args: [serverPath],
      env: { EXPLICIT_MCP_ENV: 'visible' },
    },
    timeoutMs: 5_000,
    toolTimeoutMs: 5_000,
    createdAt: now,
    updatedAt: now,
  }
  const client = new JsonRpcMcpClient()
  const tools = await client.listTools(server)
  assert.equal(tools[0]?.name, 'echo')

  const result = await client.callTool(server, 'echo', { text: 'stdio works' })
  const text = result.content[0]?.type === 'text' ? result.content[0].text : ''
  const parsed = JSON.parse(text) as { inheritedSecret?: string; explicitEnv?: string }
  assert.match(text, /stdio works/)
  assert.equal(parsed.inheritedSecret, '')
  assert.equal(parsed.explicitEnv, 'visible')
}

async function testHttpJsonRpcClient(): Promise<void> {
  const server = createServer((request, response) => {
    void handleHttpMcpRequest(request, response)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))

  try {
    const address = server.address()
    assert.equal(typeof address, 'object')
    assert.notEqual(address, null)
    const now = Date.now()
    const mcpServer: McpServerRecord = {
      id: 'http_fixture',
      name: 'HTTP Fixture',
      enabled: true,
      transport: {
        type: 'http',
        url: `http://127.0.0.1:${address!.port}/mcp`,
        headers: { 'x-fixture-token': 'ok' },
      },
      timeoutMs: 5_000,
      toolTimeoutMs: 5_000,
      createdAt: now,
      updatedAt: now,
    }
    const client = new JsonRpcMcpClient()
    const tools = await client.listTools(mcpServer)
    assert.equal(tools[0]?.name, 'http_echo')

    const result = await client.callTool(mcpServer, 'http_echo', { text: 'http works' })
    assert.match(result.content[0]?.type === 'text' ? result.content[0].text : '', /http works/)
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    )
  }
}

async function handleHttpMcpRequest(
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  if (request.method !== 'POST' || request.url !== '/mcp') {
    response.writeHead(404).end()
    return
  }
  assert.equal(request.headers['x-fixture-token'], 'ok')
  assert.match(String(request.headers.accept), /application\/json/)
  assert.match(String(request.headers.accept), /text\/event-stream/)

  const body = await readRequestBody(request)
  const message = JSON.parse(body) as {
    id?: number
    method?: string
    params?: { name?: string; arguments?: unknown }
  }

  if (message.method === 'initialize') {
    response.writeHead(200, {
      'Content-Type': 'application/json',
      'Mcp-Session-Id': 'fixture-session',
    })
    response.end(
      JSON.stringify({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          protocolVersion: '2025-06-18',
          capabilities: { tools: {} },
          serverInfo: { name: 'http-fixture', version: '1.0.0' },
        },
      })
    )
    return
  }

  assert.equal(request.headers['mcp-session-id'], 'fixture-session')
  assert.equal(request.headers['mcp-protocol-version'], '2025-06-18')

  if (message.method === 'notifications/initialized') {
    response.writeHead(202).end()
    return
  }

  if (message.method === 'tools/list') {
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(
      JSON.stringify({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          tools: [
            {
              name: 'http_echo',
              description: 'Echo text over HTTP',
              inputSchema: {
                type: 'object',
                properties: { text: { type: 'string' } },
              },
            },
          ],
        },
      })
    )
    return
  }

  if (message.method === 'tools/call') {
    response.writeHead(200, { 'Content-Type': 'text/event-stream' })
    response.write(
      `event: message\ndata: ${JSON.stringify({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                name: message.params?.name,
                args: message.params?.arguments,
              }),
            },
          ],
        },
      })}\n\n`
    )
    response.end()
    return
  }

  response.writeHead(200, { 'Content-Type': 'application/json' })
  response.end(
    JSON.stringify({
      jsonrpc: '2.0',
      id: message.id,
      error: { code: -32601, message: 'Method not found' },
    })
  )
}

function readRequestBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    request.setEncoding('utf8')
    request.on('data', (chunk) => {
      body += chunk
    })
    request.on('end', () => resolve(body))
    request.on('error', reject)
  })
}

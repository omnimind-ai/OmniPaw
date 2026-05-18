import { createHash } from 'node:crypto'

import type { AgentTool } from '@core/agent/tool'
import type { ToolProfile, ToolRisk } from '@shared/types/chat'
import type {
  DeleteMcpServerRequest,
  McpDiscoveredToolSummary,
  McpRegistryStatus,
  McpServerChangedEvent,
  McpServerListResponse,
  McpServerRecord,
  McpServerSummary,
  McpToolInventoryResponse,
  RefreshMcpServerRequest,
  SaveMcpServerRequest,
  SetMcpServerEnabledRequest,
} from '@shared/types/mcp'
import { JsonRpcMcpClient, type McpClient, type McpClientTool, normalizeMcpClientError } from './client'
import {
  createMcpServerSummary,
  DEFAULT_MCP_SERVER_TIMEOUT_MS,
  DEFAULT_MCP_TOOL_PROFILES,
  DEFAULT_MCP_TOOL_TIMEOUT_MS,
  isKnownToolRisk,
  mcpError,
  McpValidationError,
  normalizeMcpServerId,
  normalizeMcpServerRecord,
} from './schema'
import type { McpRegistryStore } from './store'

export interface McpServerManagerOptions {
  store: McpRegistryStore
  client?: McpClient
  reservedToolNames?: Iterable<string>
  onChanged?: (event: McpServerChangedEvent) => void
}

interface DiscoveryState {
  status: McpServerSummary['status']
  error?: string
  tools: McpDiscoveredToolSummary[]
}

export class McpServerManager {
  private readonly client: McpClient
  private readonly reservedToolNames: Set<string>
  private readonly discoveries = new Map<string, DiscoveryState>()
  private startupRefreshStarted = false

  constructor(private readonly options: McpServerManagerOptions) {
    this.client = options.client ?? new JsonRpcMcpClient()
    this.reservedToolNames = new Set(options.reservedToolNames ?? [])
  }

  load(): McpServerListResponse {
    this.syncDiscoveryStates(this.options.store.load().servers)
    const response = this.listServers()
    this.emitChanged('load')
    this.startBackgroundRefresh()
    return response
  }

  startBackgroundRefresh(): void {
    if (this.startupRefreshStarted) {
      return
    }
    this.startupRefreshStarted = true
    void this.refreshServer().catch(() => {
      // Startup discovery is best-effort; built-in tools must remain available.
    })
  }

  listServers(): McpServerListResponse {
    const servers = this.options.store.list()
    this.syncDiscoveryStates(servers)
    return {
      servers: servers.map((server) => this.summaryFor(server)),
      status: this.options.store.status(),
    }
  }

  async saveServer(request: SaveMcpServerRequest): Promise<McpServerSummary> {
    const now = Date.now()
    const registry = this.options.store.get()
    const existing = request.server.id
      ? registry.servers.find((server) => server.id === normalizeMcpServerId(request.server.id ?? ''))
      : undefined
    const record = normalizeSaveRequest(request, registry.servers, existing, now)
    const saved = this.options.store.upsert(record)

    if (!saved.enabled) {
      this.discoveries.set(saved.id, { status: 'disabled', tools: [] })
      this.emitChanged('save')
      return this.summaryFor(saved)
    }

    await this.refreshOne(saved.id, 'save')
    return this.summaryForId(saved.id)
  }

  deleteServer(request: DeleteMcpServerRequest | string): McpServerListResponse {
    const serverId = typeof request === 'string' ? request : request.serverId
    const deleted = this.options.store.delete(serverId)
    if (!deleted) {
      throw new McpValidationError(mcpError('not_found', `MCP server was not found: ${serverId}`, {
        path: this.options.store.status().path,
        recoverable: false,
      }))
    }

    this.discoveries.delete(serverId)
    this.emitChanged('delete')
    return this.listServers()
  }

  async setServerEnabled(request: SetMcpServerEnabledRequest): Promise<McpServerSummary> {
    const saved = this.options.store.setEnabled(request.serverId, request.enabled)
    if (!saved.enabled) {
      this.discoveries.set(saved.id, { status: 'disabled', tools: [] })
      this.emitChanged('enable')
      return this.summaryFor(saved)
    }

    await this.refreshOne(saved.id, 'enable')
    return this.summaryForId(saved.id)
  }

  async refreshServer(request?: RefreshMcpServerRequest | string): Promise<McpServerListResponse> {
    const serverId = typeof request === 'string' ? request : request?.serverId
    const servers = this.options.store.list()

    if (serverId) {
      if (!servers.some((server) => server.id === serverId)) {
        throw new McpValidationError(mcpError('not_found', `MCP server was not found: ${serverId}`, {
          path: this.options.store.status().path,
          recoverable: false,
        }))
      }
      await this.refreshOne(serverId, 'refresh')
      return this.listServers()
    }

    await Promise.all(servers.map((server) => this.refreshServerRecord(server)))
    this.emitChanged('refresh')
    return this.listServers()
  }

  listTools(): McpToolInventoryResponse {
    const response = this.listServers()
    return {
      tools: response.servers.flatMap((server) => (
        server.enabled && server.status === 'available' ? server.tools : []
      )),
      servers: response.servers,
    }
  }

  getAgentTools(): AgentTool[] {
    const servers = new Map(this.options.store.list().map((server) => [server.id, server]))
    return this.listTools().tools.flatMap((tool) => {
      const server = servers.get(tool.serverId)
      if (!server || !server.enabled) {
        return []
      }

      const providerName = tool.providerName
      return [{
        name: providerName,
        providerName,
        label: tool.label,
        description: tool.description,
        parameters: tool.parameters,
        risk: tool.risk,
        source: 'mcp',
        serverId: server.id,
        serverName: server.name,
        profiles: [...tool.profiles],
        timeoutMs: server.toolTimeoutMs,
        execute: async (_toolCallId, args, signal) => this.client.callTool(server, tool.name, args, signal),
      } satisfies AgentTool]
    })
  }

  status(): McpRegistryStatus {
    return this.options.store.status()
  }

  private async refreshOne(serverId: string, reason: McpServerChangedEvent['reason']): Promise<void> {
    const server = this.options.store.list().find((item) => item.id === serverId)
    if (!server) {
      throw new McpValidationError(mcpError('not_found', `MCP server was not found: ${serverId}`, {
        path: this.options.store.status().path,
        recoverable: false,
      }))
    }

    await this.refreshServerRecord(server)
    this.emitChanged(reason)
  }

  private async refreshServerRecord(server: McpServerRecord): Promise<void> {
    if (!server.enabled) {
      this.discoveries.set(server.id, { status: 'disabled', tools: [] })
      return
    }

    this.discoveries.set(server.id, { status: 'refreshing', tools: [] })
    try {
      const tools = await this.client.listTools(server)
      const normalized = normalizeDiscoveredTools(server, tools, new Set([
        ...this.reservedToolNames,
        ...this.allCurrentProviderToolNames(server.id),
      ]))
      this.discoveries.set(server.id, {
        status: 'available',
        tools: normalized.tools,
        error: normalized.warning,
      })
    } catch (error) {
      const normalized = normalizeMcpClientError(error, 'discovery_failed')
      this.discoveries.set(server.id, {
        status: 'error',
        error: normalized.message,
        tools: [],
      })
    }
  }

  private allCurrentProviderToolNames(excludeServerId: string): string[] {
    const names: string[] = []
    for (const [serverId, discovery] of this.discoveries) {
      if (serverId === excludeServerId) {
        continue
      }
      names.push(...discovery.tools.map((tool) => tool.providerName))
    }
    return names
  }

  private summaryForId(serverId: string): McpServerSummary {
    const server = this.options.store.list().find((item) => item.id === serverId)
    if (!server) {
      throw new McpValidationError(mcpError('not_found', `MCP server was not found: ${serverId}`, {
        path: this.options.store.status().path,
        recoverable: false,
      }))
    }
    return this.summaryFor(server)
  }

  private summaryFor(server: McpServerRecord): McpServerSummary {
    return createMcpServerSummary(server, this.discoveryFor(server))
  }

  private discoveryFor(server: McpServerRecord): DiscoveryState {
    const current = this.discoveries.get(server.id)
    if (!server.enabled) {
      return { status: 'disabled', tools: [] }
    }
    return current ?? { status: 'idle', tools: [] }
  }

  private syncDiscoveryStates(servers: McpServerRecord[]): void {
    const currentIds = new Set(servers.map((server) => server.id))
    for (const serverId of this.discoveries.keys()) {
      if (!currentIds.has(serverId)) {
        this.discoveries.delete(serverId)
      }
    }
    for (const server of servers) {
      if (!this.discoveries.has(server.id)) {
        this.discoveries.set(server.id, server.enabled ? { status: 'idle', tools: [] } : { status: 'disabled', tools: [] })
      } else if (!server.enabled) {
        this.discoveries.set(server.id, { status: 'disabled', tools: [] })
      }
    }
  }

  private emitChanged(reason: McpServerChangedEvent['reason']): void {
    this.options.onChanged?.({
      reason,
      servers: this.listServers().servers,
      status: this.options.store.status(),
    })
  }
}

function normalizeSaveRequest(
  request: SaveMcpServerRequest,
  servers: McpServerRecord[],
  existing: McpServerRecord | undefined,
  now: number,
): McpServerRecord {
  const rawServer = request.server
  const requestedId = typeof rawServer.id === 'string' ? normalizeMcpServerId(rawServer.id) : ''
  const id = requestedId || makeUniqueServerId(rawServer.name, servers)
  const duplicate = servers.find((server) => server.id === id && server.id !== existing?.id)
  if (duplicate) {
    throw new McpValidationError(mcpError('validation_failed', `MCP server ID already exists: ${id}`, {
      issues: [{ path: 'server.id', message: 'Server ID must be unique.', code: 'duplicate' }],
    }))
  }

  return normalizeMcpServerRecord({
    id,
    name: rawServer.name,
    enabled: rawServer.enabled ?? existing?.enabled ?? true,
    transport: rawServer.transport,
    timeoutMs: rawServer.timeoutMs ?? existing?.timeoutMs ?? DEFAULT_MCP_SERVER_TIMEOUT_MS,
    toolTimeoutMs: rawServer.toolTimeoutMs ?? existing?.toolTimeoutMs ?? DEFAULT_MCP_TOOL_TIMEOUT_MS,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }, 'server')
}

function normalizeDiscoveredTools(
  server: McpServerRecord,
  tools: McpClientTool[],
  reservedNames: Set<string>,
): { tools: McpDiscoveredToolSummary[]; warning?: string } {
  const discovered: McpDiscoveredToolSummary[] = []
  const originalNames = new Set<string>()
  const excluded: string[] = []

  for (const tool of tools) {
    const originalName = tool.name.trim()
    if (!originalName) {
      excluded.push('(unnamed)')
      continue
    }
    if (originalNames.has(originalName)) {
      excluded.push(originalName)
      continue
    }
    originalNames.add(originalName)

    const providerName = providerSafeMcpToolName(server.id, originalName, reservedNames)
    reservedNames.add(providerName)
    discovered.push({
      name: originalName,
      providerName,
      label: tool.title,
      description: tool.description?.trim() || `MCP tool from ${server.name}.`,
      parameters: normalizeToolParameters(tool.inputSchema),
      risk: inferMcpToolRisk(tool),
      profiles: [...DEFAULT_MCP_TOOL_PROFILES],
      source: 'mcp',
      serverId: server.id,
      serverName: server.name,
      enabled: server.enabled,
    })
  }

  return {
    tools: discovered.sort((left, right) => left.providerName.localeCompare(right.providerName)),
    warning: excluded.length ? `Excluded duplicate or invalid MCP tools: ${excluded.join(', ')}` : undefined,
  }
}

function normalizeToolParameters(inputSchema: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!inputSchema) {
    return {
      type: 'object',
      properties: {},
      additionalProperties: true,
    }
  }

  const schema = structuredClone(inputSchema)
  if (schema.type === undefined && (schema.properties !== undefined || schema.required !== undefined)) {
    schema.type = 'object'
  }

  if (schema.type !== 'object') {
    return {
      type: 'object',
      properties: {},
      additionalProperties: true,
    }
  }

  return schema
}

function inferMcpToolRisk(tool: McpClientTool): ToolRisk {
  const rawRisk = tool.annotations?.risk
  if (isKnownToolRisk(rawRisk) && rawRisk !== 'safe' && rawRisk !== 'read') {
    return rawRisk
  }
  if (tool.annotations?.destructiveHint === true) {
    return 'write'
  }
  if (tool.annotations?.execHint === true) {
    return 'exec'
  }
  return 'network'
}

function providerSafeMcpToolName(serverId: string, toolName: string, reserved: Set<string>): string {
  const serverPart = providerNamePart(serverId) || 'server'
  const toolPart = providerNamePart(toolName) || 'tool'
  let candidate = trimProviderName(`mcp_${serverPart}_${toolPart}`, shortHash(`${serverId}:${toolName}`))
  if (!reserved.has(candidate)) {
    return candidate
  }

  candidate = trimProviderName(`mcp_${serverPart}_${toolPart}`, shortHash(`collision:${serverId}:${toolName}`))
  if (!reserved.has(candidate)) {
    return candidate
  }

  let index = 2
  while (reserved.has(trimProviderName(`mcp_${serverPart}_${toolPart}_${index}`, shortHash(`${serverId}:${toolName}:${index}`)))) {
    index += 1
  }
  return trimProviderName(`mcp_${serverPart}_${toolPart}_${index}`, shortHash(`${serverId}:${toolName}:${index}`))
}

function providerNamePart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function trimProviderName(value: string, hash: string): string {
  if (value.length <= 64) {
    return value
  }
  return `${value.slice(0, 55)}_${hash}`.slice(0, 64)
}

function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 8)
}

function makeUniqueServerId(name: string, servers: McpServerRecord[]): string {
  const base = normalizeMcpServerId(name) || 'mcp_server'
  const ids = new Set(servers.map((server) => server.id))
  if (!ids.has(base)) {
    return base
  }

  let index = 1
  while (ids.has(`${base}_${index}`)) {
    index += 1
  }
  return `${base}_${index}`
}

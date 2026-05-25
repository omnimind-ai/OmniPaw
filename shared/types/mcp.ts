import type { ToolProfile, ToolRisk } from './chat'

export type McpRegistryVersion = 1
export type McpServerTransportType = 'stdio' | 'http'
export type McpServerDiscoveryStatus = 'idle' | 'refreshing' | 'available' | 'error' | 'disabled'
export type McpChangeReason = 'load' | 'save' | 'delete' | 'enable' | 'refresh'

export interface McpStdioTransportConfig {
  type: 'stdio'
  command: string
  args: string[]
  cwd?: string
  env: Record<string, string>
}

export interface McpHttpTransportConfig {
  type: 'http'
  url: string
  headers: Record<string, string>
}

export type McpServerTransportConfig = McpStdioTransportConfig | McpHttpTransportConfig

export interface McpServerRecord {
  id: string
  name: string
  enabled: boolean
  transport: McpServerTransportConfig
  timeoutMs: number
  toolTimeoutMs: number
  createdAt: number
  updatedAt: number
}

export interface McpServerRegistry {
  version: McpRegistryVersion
  servers: McpServerRecord[]
}

export interface McpSafeStdioTransport {
  type: 'stdio'
  command: string
  args: string[]
  cwd?: string
  envKeys: string[]
  localExecution: true
}

export interface McpSafeHttpTransport {
  type: 'http'
  url: string
  headerKeys: string[]
}

export type McpSafeTransport = McpSafeStdioTransport | McpSafeHttpTransport

export interface McpDiscoveredToolSummary {
  name: string
  providerName: string
  label?: string
  description: string
  parameters: Record<string, unknown>
  risk: ToolRisk
  profiles: ToolProfile[]
  source: 'mcp'
  serverId: string
  serverName: string
  enabled: boolean
}

export interface McpServerSummary {
  id: string
  name: string
  enabled: boolean
  transport: McpSafeTransport
  timeoutMs: number
  toolTimeoutMs: number
  status: McpServerDiscoveryStatus
  error?: string
  tools: McpDiscoveredToolSummary[]
  createdAt: number
  updatedAt: number
}

export interface McpValidationIssue {
  path: string
  message: string
  code?: string
}

export type McpErrorCode =
  | 'invalid_json'
  | 'invalid_registry'
  | 'unsupported_version'
  | 'mcp_io_error'
  | 'save_failed'
  | 'not_found'
  | 'validation_failed'
  | 'discovery_failed'
  | 'transport_unsupported'

export interface McpOperationError {
  code: McpErrorCode
  message: string
  path?: string
  recoverable: boolean
  issues?: McpValidationIssue[]
}

export interface McpRegistryStatus {
  path: string
  backupPath: string
  exists: boolean
  backupExists: boolean
  loaded: boolean
  version?: McpRegistryVersion
  recoverable: boolean
  error?: McpOperationError
}

export interface SaveMcpServerRequest {
  server: {
    id?: string
    name: string
    enabled?: boolean
    transport: McpServerTransportConfig
    timeoutMs?: number
    toolTimeoutMs?: number
  }
}

export interface DeleteMcpServerRequest {
  serverId: string
}

export interface SetMcpServerEnabledRequest {
  serverId: string
  enabled: boolean
}

export interface RefreshMcpServerRequest {
  serverId?: string
}

export interface McpServerListResponse {
  servers: McpServerSummary[]
  status: McpRegistryStatus
}

export interface McpToolInventoryResponse {
  tools: McpDiscoveredToolSummary[]
  servers: McpServerSummary[]
}

export interface McpServerChangedEvent {
  reason: McpChangeReason
  servers: McpServerSummary[]
  status: McpRegistryStatus
}

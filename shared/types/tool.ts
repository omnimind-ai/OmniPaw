import type { ToolProfile, ToolRisk } from './chat'

export type ToolSource = 'builtin' | 'mcp'

export interface ManagedToolInfo {
  name: string
  providerName?: string
  label?: string
  description: string
  parameters: Record<string, unknown>
  risk: ToolRisk
  profiles: ToolProfile[]
  source: ToolSource
  serverId?: string
  serverName?: string
  discoveryStatus?: string
  error?: string
  enabled: boolean
  readonly?: boolean
}

export interface SetToolEnabledRequest {
  name: string
  enabled: boolean
}

export interface SetToolEnabledResponse {
  tool: ManagedToolInfo
  tools: ManagedToolInfo[]
}

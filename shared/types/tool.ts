import type { ToolProfile, ToolRisk } from './chat'

export type ToolSource = 'builtin'

export interface ManagedToolInfo {
  name: string
  label?: string
  description: string
  parameters: Record<string, unknown>
  risk: ToolRisk
  profiles: ToolProfile[]
  source: ToolSource
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

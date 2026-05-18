import type { BridgeMcpServerTransportType } from '@/bridge/app'

export type McpKeyValueRow = {
  id: string
  key: string
  value: string
}

export type McpServerDraft = {
  id?: string
  name: string
  enabled: boolean
  transportType: BridgeMcpServerTransportType
  command: string
  argsText: string
  cwd: string
  envRows: McpKeyValueRow[]
  url: string
  headerRows: McpKeyValueRow[]
  timeoutMs: string
  toolTimeoutMs: string
}

export type McpSecretRowType = 'env' | 'header'

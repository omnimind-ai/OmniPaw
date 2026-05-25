import type { ProviderTool, ProviderToolCall } from '@core/provider/base-provider'
import type { ToolCallDisplay, ToolCallStatus, ToolProfile, ToolRisk } from '@shared/types/chat'
import type { LocalToolApprovalPlan } from '@shared/types/local-agent'
import type { ToolSource } from '@shared/types/tool'

export type { ToolCallStatus, ToolProfile, ToolRisk, ToolSource }

export interface AgentToolContext {
  sessionId: string
  runId?: string
  policyProfile: ToolProfile
}

export interface AgentTool<TDetails = unknown> {
  name: string
  providerName?: string
  label?: string
  description: string
  parameters: Record<string, unknown>
  risk: ToolRisk
  source: ToolSource
  serverId?: string
  serverName?: string
  profiles?: ToolProfile[]
  timeoutMs?: number
  localCapability?: {
    kind: 'workspace' | 'terminal'
    sandboxLevel?: string
    fullAccess?: boolean
  }
  resolveRisk?: (args: unknown, context: AgentToolContext) => ToolRisk
  resolveTimeoutMs?: (args: unknown, context: AgentToolContext) => number | undefined
  requiresApproval?: (args: unknown, context: AgentToolContext, risk: ToolRisk) => boolean
  approvalPlan?: (
    args: unknown,
    context: AgentToolContext
  ) => Promise<LocalToolApprovalPlan | undefined> | LocalToolApprovalPlan | undefined
  execute: (
    toolCallId: string,
    args: unknown,
    signal?: AbortSignal,
    onUpdate?: (update: unknown) => void,
    context?: AgentToolContext
  ) => Promise<AgentToolResult<TDetails>>
}

export interface AgentToolResult<TDetails = unknown> {
  content: AgentToolResultContent[]
  details?: TDetails
}

export type AgentToolResultContent =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string }

export interface NormalizedToolResult {
  status: ToolCallStatus
  resultText: string
  details?: unknown
  error?: {
    code: string
    message: string
  }
}

export interface ExecutedToolCall {
  providerToolCall: ProviderToolCall
  display: ToolCallDisplay
  result: NormalizedToolResult
}

export function toProviderTool(tool: AgentTool): ProviderTool {
  return {
    type: 'function',
    function: {
      name: tool.providerName ?? tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }
}

export function toolResultToText(result: AgentToolResult): string {
  return result.content
    .map((part) => {
      if (part.type === 'text') {
        return part.text
      }
      return `[Image: ${part.mimeType}, ${part.data.length} bytes]`
    })
    .join('\n')
}

export function parseToolArguments(value: string): unknown {
  if (!value.trim()) {
    return {}
  }
  return JSON.parse(value) as unknown
}

export function displayArguments(value: string): unknown {
  try {
    return parseToolArguments(value)
  } catch {
    return value
  }
}

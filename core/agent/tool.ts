import type { ProviderTool, ProviderToolCall } from '@core/provider/base-provider'
import type { ToolCallDisplay, ToolCallStatus, ToolProfile, ToolRisk } from '@shared/types/chat'

export type { ToolCallStatus, ToolProfile, ToolRisk }

export interface AgentToolContext {
  sessionId: string
}

export interface AgentTool<TArgs = unknown, TDetails = unknown> {
  name: string
  label?: string
  description: string
  parameters: Record<string, unknown>
  risk: ToolRisk
  profiles?: ToolProfile[]
  timeoutMs?: number
  execute: (
    toolCallId: string,
    args: TArgs,
    signal?: AbortSignal,
    onUpdate?: (update: unknown) => void,
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
      name: tool.name,
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

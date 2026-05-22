import type { ChatMessagePart, ToolCallDisplay } from '@shared/types/chat'
import type { ProviderMessage } from '@shared/types/provider'
import { hasProviderContent } from './serialize'

export function compileToolCallMessages(
  parts: ChatMessagePart[],
  assistantContext: Pick<ProviderMessage, 'content' | 'reasoningContent'>,
  options: { maxToolResultChars?: number } = {}
): ProviderMessage[] {
  const compiled = completedToolCalls(parts).flatMap((toolCall) => {
    const args = serializeToolArguments(toolCall.arguments ?? toolCall.args)
    const result = serializeToolResult(
      toolCall.result ?? toolCall.error,
      options.maxToolResultChars
    )
    if (!toolCall.id || !toolCall.name || args === undefined || result === undefined) {
      return []
    }

    return [
      {
        toolCall: {
          id: toolCall.id,
          type: 'function' as const,
          function: {
            name: toolCall.name,
            arguments: args,
          },
        },
        result,
      },
    ]
  })

  if (!compiled.length) {
    return []
  }

  return [
    {
      role: 'assistant',
      content: hasProviderContent(assistantContext.content) ? assistantContext.content : '',
      reasoningContent: assistantContext.reasoningContent,
      toolCalls: compiled.map((item) => item.toolCall),
    },
    ...compiled.map((item) => ({
      role: 'tool' as const,
      toolCallId: item.toolCall.id,
      content: item.result,
    })),
  ]
}

export function softTrim(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value
  }
  const half = Math.max(100, Math.floor((maxChars - 80) / 2))
  return `${value.slice(0, half)}\n\n[...trimmed ${value.length - half * 2} chars...]\n\n${value.slice(-half)}`
}

function completedToolCalls(parts: ChatMessagePart[]): ToolCallDisplay[] {
  const calls: ToolCallDisplay[] = []
  for (const part of parts) {
    if (part.type !== 'tool_call') {
      continue
    }
    const toolCalls = (part.tool_calls ?? part.toolCalls ?? []) as ToolCallDisplay[]
    for (const toolCall of toolCalls) {
      if (
        toolCall.status === 'complete' ||
        toolCall.status === 'denied' ||
        toolCall.status === 'error'
      ) {
        calls.push(toolCall)
      }
    }
  }
  return calls
}

function serializeToolArguments(value: unknown): string | undefined {
  if (value === undefined) {
    return '{}'
  }
  if (typeof value === 'string') {
    return value
  }
  try {
    return JSON.stringify(value)
  } catch {
    return undefined
  }
}

function serializeToolResult(value: unknown, maxChars?: number): string | undefined {
  if (value === undefined || value === null) {
    return undefined
  }
  if (typeof value === 'string') {
    return maxChars ? softTrim(value, maxChars) : value
  }
  try {
    const serialized = JSON.stringify(value)
    return maxChars ? softTrim(serialized, maxChars) : serialized
  } catch {
    return String(value)
  }
}

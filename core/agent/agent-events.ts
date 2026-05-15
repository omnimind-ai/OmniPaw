import type { ChatMessagePart, ChatRunAgentStepEvent, ChatRunToolCallEvent, ChatRunToolResultEvent, ToolCallDisplay } from '@shared/types/chat'

export interface AgentEventBase {
  runId: string
  sessionId: string
  assistantMessageId: string
  seq: number
  step: number
}

export function upsertToolCallPart(parts: ChatMessagePart[], toolCall: ToolCallDisplay): ChatMessagePart[] {
  const next = [...parts]
  for (const part of next) {
    if (part.type !== 'tool_call') {
      continue
    }
    const calls = part.tool_calls ?? part.toolCalls ?? []
    const index = calls.findIndex((item) => item.id === toolCall.id)
    if (index >= 0) {
      calls[index] = { ...calls[index], ...toolCall }
      part.tool_calls = calls
      part.toolCalls = calls
      return next
    }
  }

  next.push({ type: 'tool_call', tool_calls: [toolCall], toolCalls: [toolCall] })
  return next
}

export function toolCallPart(toolCall: ToolCallDisplay): ChatMessagePart {
  return {
    type: 'tool_call',
    tool_calls: [toolCall],
    toolCalls: [toolCall],
  }
}

export function createAgentStepEvent(
  base: AgentEventBase & { maxSteps: number; status: ChatRunAgentStepEvent['status'] },
): ChatRunAgentStepEvent {
  return {
    type: 'agent_step',
    runId: base.runId,
    sessionId: base.sessionId,
    assistantMessageId: base.assistantMessageId,
    seq: base.seq,
    step: base.step,
    maxSteps: base.maxSteps,
    status: base.status,
  }
}

export function createToolCallEvent(base: AgentEventBase & { toolCall: ToolCallDisplay }): ChatRunToolCallEvent {
  return {
    type: 'tool_call',
    runId: base.runId,
    sessionId: base.sessionId,
    assistantMessageId: base.assistantMessageId,
    seq: base.seq,
    step: base.step,
    toolCall: base.toolCall,
  }
}

export function createToolResultEvent(base: AgentEventBase & { toolCall: ToolCallDisplay }): ChatRunToolResultEvent {
  return {
    type: 'tool_result',
    runId: base.runId,
    sessionId: base.sessionId,
    assistantMessageId: base.assistantMessageId,
    seq: base.seq,
    step: base.step,
    toolCall: base.toolCall,
  }
}

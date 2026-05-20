import type { RunManager } from '@core/chat/run-manager'
import type { ChatMessageRepo, ChatRunRepo } from '@core/db/repos'
import type { ProviderToolCall } from '@core/provider/base-provider'
import type { SkillManager } from '@core/skill/skill-manager'
import type { ChatRun, ToolCallDisplay } from '@shared/types/chat'
import {
  createToolCallEvent,
  createToolResultEvent,
  toolCallPart,
  upsertToolCallPart,
} from './run/events'
import { parseArgumentsForDisplay } from './run/helpers'
import type { AgentRunState } from './run/state'
import type { ToolExecutor } from './tools/executor'

export interface AgentToolLoopOptions {
  messages: ChatMessageRepo
  runs: ChatRunRepo
  runManager: RunManager
  skills?: SkillManager
  toolExecutor: ToolExecutor
}

export async function executeAgentToolLoop(
  options: AgentToolLoopOptions,
  state: AgentRunState,
  toolCalls: ProviderToolCall[],
  step: number
): Promise<void> {
  for (const toolCall of toolCalls) {
    const now = Date.now()
    const runningCall: ToolCallDisplay = {
      id: toolCall.id,
      name: toolCall.function.name,
      arguments: parseArgumentsForDisplay(toolCall.function.arguments),
      args: parseArgumentsForDisplay(toolCall.function.arguments),
      status: 'running',
      startedAt: now,
      ts: now / 1000,
    }
    upsertAndEmitTool(options, state.input.run, state, runningCall, step, 'call')

    const execution = await options.toolExecutor.execute({
      toolCall,
      tools: state.agentTools,
      policy: state.policy,
      signal: state.input.signal,
    })

    if (toolCall.function.name === 'skill_read') {
      mergeReadSkillIds(options, state)
    }

    upsertAndEmitTool(options, state.input.run, state, execution.display, step, 'result')

    if (execution.result.status === 'aborted') {
      throw new DOMException('Run aborted.', 'AbortError')
    }

    state.appendToolResultMessage(toolCall.id, execution.result.resultText)
  }
}

function upsertAndEmitTool(
  options: AgentToolLoopOptions,
  run: ChatRun,
  state: AgentRunState,
  toolCall: ToolCallDisplay,
  step: number,
  kind: 'call' | 'result'
): void {
  const updated = upsertToolCallPart(state.assistantParts, toolCall)
  state.assistantParts.splice(0, state.assistantParts.length, ...updated)
  options.messages.updateParts(run.assistantMessageId, state.assistantParts, {
    status: 'streaming',
  })
  options.runManager.emit({
    type: 'part',
    runId: run.id,
    sessionId: run.sessionId,
    assistantMessageId: run.assistantMessageId,
    seq: options.runManager.nextSeq(run.id),
    part: toolCallPart(toolCall),
  })
  options.runManager.emit(
    kind === 'call'
      ? createToolCallEvent({
          runId: run.id,
          sessionId: run.sessionId,
          assistantMessageId: run.assistantMessageId,
          seq: options.runManager.nextSeq(run.id),
          step,
          toolCall,
        })
      : createToolResultEvent({
          runId: run.id,
          sessionId: run.sessionId,
          assistantMessageId: run.assistantMessageId,
          seq: options.runManager.nextSeq(run.id),
          step,
          toolCall,
        })
  )
}

function mergeReadSkillIds(options: AgentToolLoopOptions, state: AgentRunState): void {
  const readSkillIds = options.skills?.drainReadSkillIds() ?? []
  if (!readSkillIds.length) {
    return
  }

  const { run } = state.input
  const currentRun = options.runs.get(run.id) ?? run
  const currentSnapshot = currentRun.requestSnapshot ?? state.snapshot
  const nextSnapshot = {
    ...currentSnapshot,
    skills: {
      enabledSkillIds:
        currentSnapshot.skills?.enabledSkillIds ?? state.skillPrompt?.enabledSkillIds ?? [],
      injected: currentSnapshot.skills?.injected ?? state.skillPrompt?.injected ?? false,
      omittedReason: currentSnapshot.skills?.omittedReason ?? state.skillPrompt?.omittedReason,
      readSkillIds: [
        ...new Set([...(currentSnapshot.skills?.readSkillIds ?? []), ...readSkillIds]),
      ].sort(),
    },
  }
  state.snapshot = nextSnapshot
  options.runs.save({
    ...currentRun,
    requestSnapshot: nextSnapshot,
    updatedAt: Date.now(),
  })
}

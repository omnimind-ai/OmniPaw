import type { Logger } from '@core/logging'
import type { BaseProvider, ProviderToolCall } from '@core/provider/base-provider'
import { normalizeProviderError } from '@core/provider/errors'
import type { ChatMessagePart } from '@shared/types/chat'
import { createAgentStepEvent } from './run/events'
import type { AgentRunFinalizer } from './run/finalize'
import { canRetryWithoutTools, throwIfAborted } from './run/helpers'
import type { AgentRunState } from './run/state'
import type { AgentToolLoopOptions } from './tool-loop'
import { executeAgentToolLoop } from './tool-loop'

export interface AgentStepEngineOptions extends AgentToolLoopOptions {}

export class AgentStepEngine {
  constructor(
    private readonly options: AgentStepEngineOptions,
    private readonly client: BaseProvider,
    private readonly finalizer: AgentRunFinalizer,
    private readonly logger?: Logger
  ) {}

  async run(state: AgentRunState): Promise<void> {
    const { input } = state
    for (let step = 1; step <= state.maxSteps; step += 1) {
      throwIfAborted(input.signal)
      const stepParts: ChatMessagePart[] = []
      this.emitStep(state, step, 'started')

      const stepToolCalls: ProviderToolCall[] = []
      let sawFinal = false
      let retryWithoutTools = false
      do {
        retryWithoutTools = false
        try {
          for await (const chunk of this.client.streamChat({
            modelId: input.model.remoteId || input.model.id,
            messages: state.providerMessages,
            maxOutputTokens: input.model.maxOutputTokens,
            tools: state.activeProviderTools.length ? state.activeProviderTools : undefined,
            abortSignal: input.signal,
          })) {
            throwIfAborted(input.signal)

            if (chunk.type === 'delta' && (chunk.content || chunk.reasoning)) {
              const text = chunk.content ?? chunk.reasoning ?? ''
              if (chunk.content) {
                state.appendContentDelta(text, stepParts)
              }
              if (chunk.reasoning) {
                state.appendReasoningDelta(text, stepParts)
              }
              this.options.messages.updateParts(
                input.run.assistantMessageId,
                state.assistantParts,
                {
                  status: 'streaming',
                }
              )
              this.options.runManager.emit({
                type: 'delta',
                runId: input.run.id,
                sessionId: input.run.sessionId,
                assistantMessageId: input.run.assistantMessageId,
                seq: this.options.runManager.nextSeq(input.run.id),
                text,
                channel: chunk.reasoning ? 'reasoning' : 'content',
              })
              continue
            }

            if (chunk.type === 'tool_call_delta') {
              continue
            }

            if (chunk.type === 'tool_call_final') {
              stepToolCalls.push(...chunk.toolCalls)
              continue
            }

            if (chunk.type === 'final') {
              sawFinal = true
              if (!stepToolCalls.length) {
                this.finalizer.completeRun(state, chunk.usage)
                this.logger?.info('Agent run completed.', {
                  status: 'complete',
                  step,
                  durationMs: Date.now() - state.startedAt,
                })
                return
              }
            }
          }
        } catch (error) {
          const chatError = normalizeProviderError(error)
          if (
            state.activeProviderTools.length &&
            canRetryWithoutTools(chatError, stepParts, stepToolCalls, sawFinal)
          ) {
            state.disableToolsForFallback('provider_rejected_tools')
            const currentRun = this.options.runs.get(input.run.id) ?? input.run
            this.options.runs.save({
              ...currentRun,
              requestSnapshot: state.snapshot,
              updatedAt: Date.now(),
            })
            retryWithoutTools = true
            this.logger?.info('Provider rejected tool calling; retrying without tools.', {
              providerId: input.provider.id,
              modelId: input.model.id,
              errorCode: chatError.code,
              providerStatus: chatError.providerStatus,
              fallbackReason: 'provider_rejected_tools',
            })
            continue
          }
          throw error
        }
      } while (retryWithoutTools)

      if (!stepToolCalls.length) {
        if (!sawFinal) {
          this.finalizer.completeRun(state)
          this.logger?.info('Agent run completed without final chunk.', {
            status: 'complete',
            step,
            durationMs: Date.now() - state.startedAt,
          })
        }
        return
      }

      this.emitStep(state, step, 'tool_calling')
      state.appendAssistantToolCallMessage(stepParts, stepToolCalls)
      await executeAgentToolLoop(this.options, state, stepToolCalls, step)
      this.emitStep(state, step, 'tool_complete')
    }

    this.finalizer.completeMaxSteps(state)
  }

  private emitStep(
    state: AgentRunState,
    step: number,
    status: 'started' | 'tool_calling' | 'tool_complete'
  ): void {
    const { run } = state.input
    this.options.runManager.emit(
      createAgentStepEvent({
        runId: run.id,
        sessionId: run.sessionId,
        assistantMessageId: run.assistantMessageId,
        seq: this.options.runManager.nextSeq(run.id),
        step,
        maxSteps: state.maxSteps,
        status,
      })
    )
  }
}

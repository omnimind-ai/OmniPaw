import type { Logger } from '@core/logging'
import type { BaseProvider, ProviderToolCall } from '@core/provider/base-provider'
import { normalizeProviderError, throwIncompleteProviderStream } from '@core/provider/errors'
import type { ChatMessagePart } from '@shared/types/chat'
import { createAgentStepEvent } from './run/events'
import type { AgentRunFinalizer } from './run/finalize'
import { throwIfAborted, toolFallbackReasonForProviderError } from './run/helpers'
import type { AgentRunState } from './run/state'
import type { AgentToolLoopOptions } from './tool-loop'
import { executeAgentToolLoop } from './tool-loop'

export interface AgentStepEngineOptions extends AgentToolLoopOptions {}

const MAX_TRANSIENT_NETWORK_RETRIES = 5
const NETWORK_RETRY_BASE_DELAY_MS = 500

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
      let networkRetryCount = 0
      do {
        retryWithoutTools = false
        const attemptStepPartCount = stepParts.length
        const attemptToolCallCount = stepToolCalls.length
        try {
          for await (const chunk of this.client.streamChat({
            modelId: input.model.remoteId || input.model.id,
            messages: state.providerMessages,
            maxOutputTokens: input.model.maxOutputTokens,
            tools: state.activeProviderTools.length ? state.activeProviderTools : undefined,
            abortSignal: input.signal,
          })) {
            throwIfAborted(input.signal)

            if (
              chunk.type === 'delta' &&
              (chunk.content || chunk.reasoning || chunk.reasoningSignature)
            ) {
              const text = chunk.content ?? chunk.reasoning ?? ''
              if (chunk.content) {
                state.appendContentDelta(text, stepParts)
              }
              if (chunk.reasoning) {
                state.appendReasoningDelta(text, stepParts)
              }
              if (chunk.reasoningSignature) {
                state.appendReasoningSignature(chunk.reasoningSignature, stepParts)
              }
              this.options.messages.updateParts(
                input.run.assistantMessageId,
                state.assistantParts,
                {
                  status: 'streaming',
                }
              )
              if (text) {
                this.options.runManager.emit({
                  type: 'delta',
                  runId: input.run.id,
                  sessionId: input.run.sessionId,
                  assistantMessageId: input.run.assistantMessageId,
                  seq: this.options.runManager.nextSeq(input.run.id),
                  text,
                  channel: chunk.reasoning ? 'reasoning' : 'content',
                })
              }
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
              state.markStreamCompleted()
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
          if (!sawFinal) {
            throwIncompleteProviderStream('Provider')
          }
        } catch (error) {
          const chatError = normalizeProviderError(error)
          const toolFallbackReason = state.activeProviderTools.length
            ? toolFallbackReasonForProviderError(chatError, stepParts, stepToolCalls, sawFinal)
            : undefined
          if (state.activeProviderTools.length && toolFallbackReason) {
            state.disableToolsForFallback(toolFallbackReason)
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
              fallbackReason: toolFallbackReason,
            })
            continue
          }
          if (
            isRetryableTransportError(chatError) &&
            !sawFinal &&
            stepParts.length === attemptStepPartCount &&
            stepToolCalls.length === attemptToolCallCount &&
            networkRetryCount < MAX_TRANSIENT_NETWORK_RETRIES
          ) {
            networkRetryCount += 1
            const delayMs = NETWORK_RETRY_BASE_DELAY_MS * 2 ** (networkRetryCount - 1)
            state.recordTransportRetry()
            const currentRun = this.options.runs.get(input.run.id) ?? input.run
            this.options.runs.save({
              ...currentRun,
              requestSnapshot: state.snapshot,
              updatedAt: Date.now(),
            })
            this.options.runManager.emit({
              type: 'retry',
              runId: input.run.id,
              sessionId: input.run.sessionId,
              assistantMessageId: input.run.assistantMessageId,
              seq: this.options.runManager.nextSeq(input.run.id),
              attempt: networkRetryCount,
              maxAttempts: MAX_TRANSIENT_NETWORK_RETRIES,
              delayMs,
              reason:
                chatError.code === 'provider_stream_incomplete' ? 'stream_incomplete' : 'network',
            })
            this.logger?.info('Transient provider transport failure; retrying stream.', {
              providerId: input.provider.id,
              modelId: input.model.id,
              errorCode: chatError.code,
              retryAttempt: networkRetryCount,
              maxRetryAttempts: MAX_TRANSIENT_NETWORK_RETRIES,
              delayMs,
            })
            await abortableDelay(delayMs, input.signal)
            retryWithoutTools = true
            continue
          }
          if (
            chatError.code === 'provider_context_length' &&
            !sawFinal &&
            stepParts.length === 0 &&
            stepToolCalls.length === 0 &&
            state.trimForContextLengthRetry('provider_context_length_retry')
          ) {
            const currentRun = this.options.runs.get(input.run.id) ?? input.run
            this.options.runs.save({
              ...currentRun,
              requestSnapshot: state.snapshot,
              updatedAt: Date.now(),
            })
            retryWithoutTools = true
            this.logger?.info('Provider rejected context length; retrying with trimmed context.', {
              providerId: input.provider.id,
              modelId: input.model.id,
              errorCode: chatError.code,
              fallbackReason: 'provider_context_length_retry',
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

function isRetryableTransportError(error: ReturnType<typeof normalizeProviderError>): boolean {
  return (
    error.retryable === true &&
    (error.code === 'network' || error.code === 'provider_stream_incomplete')
  )
}

function abortableDelay(delayMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(new DOMException('Run aborted.', 'AbortError'))
  }

  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', abort)
      resolve()
    }, delayMs)
    const abort = () => {
      clearTimeout(timeout)
      signal.removeEventListener('abort', abort)
      reject(new DOMException('Run aborted.', 'AbortError'))
    }
    signal.addEventListener('abort', abort, { once: true })
  })
}

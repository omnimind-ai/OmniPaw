import type { Logger } from '@core/logging'
import type { ChatError, TokenUsage } from '@core/provider/base-provider'
import { normalizeProviderError } from '@core/provider/errors'
import type { AgentRunInput, AgentRunnerOptions } from '../agent-runner'
import { appendTextPart } from './helpers'
import type { AgentRunState } from './state'

export class AgentRunFinalizer {
  constructor(
    private readonly options: AgentRunnerOptions,
    private readonly logger?: Logger
  ) {}

  completeRun(state: AgentRunState, usage?: TokenUsage): void {
    const { run } = state.input
    this.options.messages.updateParts(run.assistantMessageId, state.assistantParts, {
      status: 'complete',
      usage,
    })
    this.options.runs.updateStatus(run.id, 'complete', {
      finishedAt: Date.now(),
      usage,
    })
    this.emitFinal(state)
    this.options.onComplete?.(run.sessionId)
  }

  completeMaxSteps(state: AgentRunState): void {
    const { run } = state.input
    const message = `Reached maximum agent steps (${state.maxSteps}) before a final answer.`
    appendTextPart(state.assistantParts, message)
    this.options.messages.updateParts(run.assistantMessageId, state.assistantParts, {
      status: 'complete',
    })
    this.options.runs.updateStatus(run.id, 'complete', { finishedAt: Date.now() })
    this.emitFinal(state)
    this.options.onComplete?.(run.sessionId)
    this.logger?.warn('Agent run reached max steps.', {
      status: 'complete',
      maxSteps: state.maxSteps,
      durationMs: Date.now() - state.startedAt,
    })
  }

  failRun(state: AgentRunState, error: unknown): void {
    const chatError = normalizeProviderError(error)
    const status = chatError.code === 'aborted' ? 'aborted' : 'error'
    this.logFailure(status, chatError, state.startedAt)

    const { run } = state.input
    this.options.messages.updateParts(run.assistantMessageId, state.assistantParts, {
      status,
      error: chatError,
    })
    this.options.runs.updateStatus(run.id, status, {
      finishedAt: Date.now(),
      error: chatError,
    })
    this.options.runManager.emit({
      type: 'error',
      runId: run.id,
      sessionId: run.sessionId,
      assistantMessageId: run.assistantMessageId,
      seq: this.options.runManager.nextSeq(run.id),
      error: chatError,
    })
  }

  failInput(input: AgentRunInput, startedAt: number, error: unknown): void {
    const chatError = normalizeProviderError(error)
    const status = chatError.code === 'aborted' ? 'aborted' : 'error'
    this.logFailure(status, chatError, startedAt)
    this.options.messages.updateParts(input.run.assistantMessageId, [], {
      status,
      error: chatError,
    })
    this.options.runs.updateStatus(input.run.id, status, {
      finishedAt: Date.now(),
      error: chatError,
    })
    this.options.runManager.emit({
      type: 'error',
      runId: input.run.id,
      sessionId: input.run.sessionId,
      assistantMessageId: input.run.assistantMessageId,
      seq: this.options.runManager.nextSeq(input.run.id),
      error: chatError,
    })
  }

  finish(state: AgentRunState): void {
    this.options.runManager.finish(state.input.run.id)
  }

  finishRun(runId: string): void {
    this.options.runManager.finish(runId)
  }

  private emitFinal(state: AgentRunState): void {
    const { run } = state.input
    const finalMessage = this.options.messages.get(run.assistantMessageId)
    if (!finalMessage) {
      return
    }
    this.options.runManager.emit({
      type: 'final',
      runId: run.id,
      sessionId: run.sessionId,
      assistantMessageId: run.assistantMessageId,
      seq: this.options.runManager.nextSeq(run.id),
      message: finalMessage,
    })
  }

  private logFailure(status: 'aborted' | 'error', chatError: ChatError, startedAt: number): void {
    if (status === 'aborted') {
      this.logger?.info('Agent run aborted.', {
        errorCode: chatError.code,
        retryable: chatError.retryable,
        durationMs: Date.now() - startedAt,
        error: safeLogError(chatError),
      })
      return
    }
    this.logger?.warn('Agent run failed.', {
      errorCode: chatError.code,
      retryable: chatError.retryable,
      durationMs: Date.now() - startedAt,
      error: safeLogError(chatError),
    })
  }
}

function safeLogError(chatError: ChatError) {
  return {
    code: chatError.code,
    message: chatError.message,
    retryable: chatError.retryable,
    providerStatus: chatError.providerStatus,
  }
}

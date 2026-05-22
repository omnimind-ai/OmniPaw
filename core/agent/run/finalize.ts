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
    this.applyUsageToSnapshot(state, usage)
    this.options.messages.updateParts(run.assistantMessageId, state.assistantParts, {
      status: 'complete',
      usage,
      metadata: this.contextUsageMetadata(state),
    })
    const finishedAt = Date.now()
    this.options.runs.save({
      ...(this.options.runs.get(run.id) ?? run),
      status: 'complete',
      finishedAt,
      usage,
      requestSnapshot: state.snapshot,
      updatedAt: finishedAt,
    })
    this.maybeCompact(state)
    this.emitFinal(state)
    this.options.onComplete?.(run.sessionId)
  }

  completeMaxSteps(state: AgentRunState): void {
    const { run } = state.input
    const message = `Reached maximum agent steps (${state.maxSteps}) before a final answer.`
    appendTextPart(state.assistantParts, message)
    this.options.messages.updateParts(run.assistantMessageId, state.assistantParts, {
      status: 'complete',
      metadata: this.contextUsageMetadata(state),
    })
    const finishedAt = Date.now()
    this.options.runs.save({
      ...(this.options.runs.get(run.id) ?? run),
      status: 'complete',
      finishedAt,
      requestSnapshot: state.snapshot,
      updatedAt: finishedAt,
    })
    this.maybeCompact(state)
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

  private applyUsageToSnapshot(state: AgentRunState, usage?: TokenUsage): void {
    if (!usage) {
      return
    }
    const budgetInputTokens = state.snapshot.contextUsage?.budgetInputTokens
    const contextWindowTokens = state.snapshot.contextUsage?.contextWindowTokens
    const inputTokens = usage.input ?? state.snapshot.contextUsage?.estimatedInputTokens
    state.snapshot = {
      ...state.snapshot,
      usageSource: 'actual',
      contextUsage: {
        ...(state.snapshot.contextUsage ?? { updatedAt: Date.now(), source: 'actual' }),
        source: 'actual',
        inputTokens: usage.input,
        outputTokens: usage.output,
        cachedInputTokens: usage.cachedInput,
        reasoningTokens: usage.reasoning,
        totalTokens: usage.total,
        contextWindowTokens,
        budgetInputTokens,
        windowUsagePercent:
          inputTokens !== undefined && contextWindowTokens
            ? Math.round((inputTokens / contextWindowTokens) * 100)
            : state.snapshot.contextUsage?.windowUsagePercent,
        usagePercent:
          inputTokens !== undefined && budgetInputTokens
            ? Math.round((inputTokens / budgetInputTokens) * 100)
            : state.snapshot.contextUsage?.usagePercent,
        updatedAt: Date.now(),
      },
    }
  }

  private maybeCompact(state: AgentRunState): void {
    const summary = this.options.contextCompaction?.maybeCompact({
      sessionId: state.input.session.id,
      messages: this.options.messages.listBySession(state.input.session.id),
      provider: state.input.provider,
      model: state.input.model,
      snapshot: state.snapshot,
      settings: this.options.contextDefaults?.(),
    })
    if (!summary) {
      return
    }
    state.snapshot = {
      ...state.snapshot,
      summaryId: summary.id,
      fallbackReasons: [...(state.snapshot.fallbackReasons ?? []), 'auto_compact_created_summary'],
      contextUsage: state.snapshot.contextUsage
        ? {
            ...state.snapshot.contextUsage,
            summaryId: summary.id,
            fallbackReasons: [
              ...(state.snapshot.contextUsage.fallbackReasons ?? []),
              'auto_compact_created_summary',
            ],
            updatedAt: Date.now(),
          }
        : undefined,
    }
    const currentRun = this.options.runs.get(state.input.run.id) ?? state.input.run
    this.options.runs.save({
      ...currentRun,
      requestSnapshot: state.snapshot,
      updatedAt: Date.now(),
    })
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
      contextUsage: state.snapshot.contextUsage,
      requestSnapshot: state.snapshot,
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

  private contextUsageMetadata(state: AgentRunState): Record<string, unknown> | undefined {
    if (!state.snapshot.contextUsage) {
      return undefined
    }
    const current = this.options.messages.get(state.input.run.assistantMessageId)?.metadata ?? {}
    return {
      ...current,
      contextUsage: state.snapshot.contextUsage,
    }
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

import type { AttachmentService } from '@core/chat/attachment-service'
import { type ChatService, ChatSessionKindMismatchError } from '@core/chat/chat-service'
import type { ChatRunEventTarget } from '@core/chat/run-manager'
import type { Logger } from '@core/logging'
import type { ProviderManager } from '@core/provider/manager'
import type {
  ObservationCaptureMetadata,
  ObservationChangedEvent,
  ObservationErrorCode,
  ObservationErrorInfo,
  ObservationPermissionStatus,
  ObservationReactionEvent,
  ObservationRun,
  ObservationRuntimeState,
  ObservationScope,
  ObservationScreenshotRetention,
  ObservationState,
  ScreenObserveToolResult,
  StartObservationRequest,
  StopObservationRequest,
  TriggerObservationRequest,
} from '@shared/types/observation'
import type { DesktopObservationSettings } from '@shared/types/settings'
import {
  createObservationError,
  isAbortError,
  normalizeObservationError,
  ObservationRuntimeError,
  toObservationErrorInfo,
} from './errors'
import { ObservationModelChainResolver } from './model-chain'
import {
  createObservationReactionPromptContext,
  nextNoVisibleReactionCount,
} from './reaction-policy'
import { type ObservationTurnResult, ObservationTurnRunner } from './turn-runner'
import type { DesktopCaptureAdapter } from './types'

export { ObservationRuntimeError } from './errors'

export interface ObservationManagerOptions {
  capture: DesktopCaptureAdapter
  settings: () => DesktopObservationSettings
  providers: ProviderManager
  attachments?: AttachmentService
  chatService?: () => ChatService | undefined
  eventTarget?: () => ChatRunEventTarget | undefined
  resolveCatSessionId?: () => Promise<string | null> | string | null
  onChanged?: (event: ObservationChangedEvent) => void
  onReaction?: (event: ObservationReactionEvent) => void
  logger?: Logger
  random?: () => number
}

interface ActiveRunState {
  run: ObservationRun
  timer?: ReturnType<typeof setTimeout>
  abortController?: AbortController
  sourceId?: string
  busy: boolean
  queuedCapture: boolean
  consecutiveNoVisibleReactions: number
}

export class ObservationManager {
  private readonly capture: DesktopCaptureAdapter
  private readonly logger?: Logger
  private readonly random: () => number
  private readonly modelChain: ObservationModelChainResolver
  private readonly turnRunner: ObservationTurnRunner
  private active: ActiveRunState | undefined
  private lastRun: ObservationRun | undefined
  private lastVisionSessionId: string | undefined
  private captureCountDate = ''
  private captureCount = 0

  constructor(private readonly options: ObservationManagerOptions) {
    this.capture = options.capture
    this.logger = options.logger
    this.random = options.random ?? Math.random
    this.modelChain = new ObservationModelChainResolver(options.providers, options.settings)
    this.turnRunner = new ObservationTurnRunner({
      chatService: () => options.chatService?.(),
      eventTarget: () => options.eventTarget?.(),
      settings: options.settings,
    })
  }

  async permissionStatus(): Promise<ObservationPermissionStatus> {
    return await this.capture.permissionStatus()
  }

  async status(visionSessionId?: string): Promise<ObservationState> {
    return this.snapshotState(await this.permissionStatus(), visionSessionId)
  }

  async start(request: StartObservationRequest = {}): Promise<ObservationState> {
    if (hasLegacyTargetSessionPayload(request as Record<string, unknown>)) {
      throw this.observationError(
        'invalid_request',
        '主动视觉已迁移为独立 vision session，请通过 observation.start({ visionSessionId? }) 启动。',
        true
      )
    }

    const permission = await this.permissionStatusForStart()
    if (permission.screen !== 'granted' && permission.screen !== 'unknown') {
      throw this.observationError(
        'permission_denied',
        permission.message || '屏幕录制权限不可用，请在系统设置中允许屏幕捕获。',
        true
      )
    }

    await this.modelChain.assertPolicyBeforeCapture()
    const session = await this.getOrCreateVisionSession(request.visionSessionId)
    if (this.active) {
      this.stopRun(this.active.run.id, 'user', false)
    }

    const settings = this.options.settings()
    const retention = normalizeScreenshotRetention(
      request.screenshotRetention,
      settings.screenshotRetention
    )
    const run: ObservationRun = {
      id: crypto.randomUUID(),
      visionSessionId: session.id,
      status: 'active',
      startedAt: Date.now(),
      scope: normalizeScope(request.scope, settings.defaultScope),
      screenshotRetention: retention,
      rule: {
        evaluationIntervalMs: settings.evaluationIntervalMs,
        captureProbability: settings.captureProbability,
        minCaptureIntervalMs: settings.minCaptureIntervalMs,
        dailyCaptureLimit: settings.dailyCaptureLimit,
        consecutiveFailureLimit: settings.consecutiveFailureLimit,
        notificationCooldownMs: settings.notificationCooldownMs,
        capturesToday: this.captureCountForToday(),
      },
      notification: {
        cooldownMs: settings.notificationCooldownMs,
      },
      failureCount: 0,
    }

    const resolved = await this.modelChain.resolve(run)
    run.visionModelRef = resolved.chain.visionModelRef
    run.reactionModelRef = resolved.chain.reactionModelRef
    run.modelChainMode = resolved.chain.mode

    const state: ActiveRunState = {
      run,
      sourceId: request.sourceId,
      busy: false,
      queuedCapture: false,
      consecutiveNoVisibleReactions: 0,
    }
    this.active = state
    this.lastRun = undefined
    this.lastVisionSessionId = session.id
    this.scheduleNextEvaluation(state, run.rule.evaluationIntervalMs)
    this.logger?.info('Observation vision runtime started.', {
      runId: run.id,
      visionSessionId: run.visionSessionId,
      evaluationIntervalMs: run.rule.evaluationIntervalMs,
      captureProbability: run.rule.captureProbability,
      minCaptureIntervalMs: run.rule.minCaptureIntervalMs,
      scope: run.scope,
      screenshotRetention: run.screenshotRetention,
      modelChainMode: run.modelChainMode,
    })
    await this.emitChanged('started', run)
    return this.status()
  }

  private async permissionStatusForStart(): Promise<ObservationPermissionStatus> {
    const permission = await this.permissionStatus()
    if (!shouldProbeScreenPermission(permission) || !this.capture.probeScreenPermission) {
      return permission
    }

    try {
      return await this.capture.probeScreenPermission()
    } catch (error) {
      this.logger?.warn('Observation screen permission probe failed.', {
        platform: permission.platform,
        screen: permission.screen,
        error,
      })
      return permission
    }
  }

  async stop(request: StopObservationRequest = {}): Promise<ObservationState> {
    const reason = request.reason ?? 'user'
    if (request.runId) {
      this.stopRun(request.runId, reason, true)
    } else if (request.visionSessionId) {
      this.stopIfSessionActive(request.visionSessionId, reason)
    } else if (this.active) {
      this.stopRun(this.active.run.id, reason, true)
    }
    return this.status()
  }

  async trigger(request: TriggerObservationRequest = {}): Promise<ObservationState> {
    const state = this.findRunState(request)
    if (!state) {
      throw this.observationError('run_not_found', '没有正在运行的主动视觉。', true)
    }
    await this.executeCapture(state, 'manual', {
      forceReaction: request.forceReaction === true,
    })
    return this.status()
  }

  async captureForTool(sessionId: string): Promise<ScreenObserveToolResult> {
    const state = this.active
    if (
      !state ||
      state.run.status !== 'active' ||
      state.run.visionSessionId !== sessionId ||
      state.busy
    ) {
      throw this.observationError(
        'run_not_found',
        'screen_observe 只能在当前 active vision runtime 的会话中使用。',
        true
      )
    }
    const frame = await this.captureFrame(state)
    try {
      return {
        ok: true,
        captureId: frame.captureId,
        mimeType: frame.mimeType,
        width: frame.width,
        height: frame.height,
        createdAt: frame.createdAt,
        retention: frame.retention,
      }
    } finally {
      await this.cleanupFrame(frame.captureId)
    }
  }

  stopIfSessionActive(
    visionSessionId: string,
    reason: NonNullable<StopObservationRequest['reason']> = 'session_deleted'
  ): boolean {
    if (this.active?.run.visionSessionId !== visionSessionId) {
      return false
    }
    this.stopRun(this.active.run.id, reason, true)
    return true
  }

  dispose(reason: StopObservationRequest['reason'] = 'app_exit'): void {
    if (this.active) {
      this.stopRun(this.active.run.id, reason, false)
    }
    void this.capture.cleanupAll?.()
    this.capture.dispose?.()
  }

  private async evaluateTick(state: ActiveRunState): Promise<void> {
    const run = state.run
    if (run.status !== 'active') {
      return
    }
    run.rule.lastEvaluationAt = Date.now()
    const skipReason = this.skipReasonForEvaluation(state, false)
    if (skipReason) {
      run.rule.skippedReason = skipReason
      await this.emitChanged('evaluated', run)
      this.scheduleNextEvaluation(state, run.rule.evaluationIntervalMs)
      return
    }
    await this.executeCapture(state, 'timer')
  }

  private skipReasonForEvaluation(
    state: ActiveRunState,
    manual: boolean,
    options: { forceReaction?: boolean } = {}
  ): ObservationRun['rule']['skippedReason'] | undefined {
    const run = state.run
    if (state.busy) {
      state.queuedCapture = true
      return 'busy'
    }
    if (this.captureCountForToday() >= this.options.settings().dailyCaptureLimit) {
      return 'daily_limit'
    }
    if (
      !options.forceReaction &&
      run.rule.lastAcceptedAt &&
      Date.now() - run.rule.lastAcceptedAt < this.options.settings().minCaptureIntervalMs
    ) {
      return 'min_capture_interval'
    }
    if (!manual && this.random() > this.options.settings().captureProbability) {
      return 'probability_miss'
    }
    return undefined
  }

  private async executeCapture(
    state: ActiveRunState,
    source: 'timer' | 'manual',
    options: { forceReaction?: boolean } = {}
  ): Promise<void> {
    const run = state.run
    if (run.status !== 'active') {
      return
    }
    if (state.busy) {
      if (source === 'timer') {
        state.queuedCapture = true
        return
      }
      throw this.observationError('run_busy', '观察正在执行中，请稍后再试。', true)
    }

    const skipReason = this.skipReasonForEvaluation(state, source === 'manual', options)
    if (skipReason) {
      run.rule.skippedReason = skipReason
      await this.emitChanged(source === 'manual' ? 'updated' : 'evaluated', run)
      if (source === 'manual') {
        throw this.observationError(
          skipReason === 'daily_limit'
            ? 'daily_limit'
            : skipReason === 'min_capture_interval'
              ? 'min_capture_interval'
              : 'run_busy',
          '当前策略暂不允许立即观察。',
          true
        )
      }
      this.scheduleNextEvaluation(state, run.rule.evaluationIntervalMs)
      return
    }

    state.busy = true
    state.abortController = new AbortController()
    run.rule.skippedReason = undefined
    try {
      const result = await this.performObservation(state, state.abortController.signal, options)
      run.lastCapture = result.frame.metadata
      run.lastDecision = result.decision
      run.lastRunId = result.terminal.runId
      run.lastAssistantMessageId = result.terminal.assistantMessageId
      run.lastUserMessageId =
        result.terminal.type === 'final' ? result.terminal.message.id : undefined
      if (
        result.decision.decision !== 'silent' &&
        !result.decision.notificationSuppressed &&
        result.decision.text
      ) {
        run.notification.lastNotificationAt = result.decision.createdAt
      }
      if (result.decision.notificationSuppressed) {
        run.notification.lastSuppressedAt = result.decision.createdAt
      }
      run.rule.lastAcceptedAt = result.frame.metadata.createdAt
      run.rule.capturesToday = this.captureCountForToday()
      run.failureCount = 0
      run.error = undefined
      await this.dispatchDecision(run, result)
      state.consecutiveNoVisibleReactions = nextNoVisibleReactionCount(
        state.consecutiveNoVisibleReactions,
        result.decision
      )
      await this.emitChanged(source === 'timer' ? 'tick' : 'updated', run)
    } catch (error) {
      if (isAbortError(error)) {
        run.error = toObservationErrorInfo('aborted', '观察已停止。', false)
      } else {
        run.failureCount += 1
        run.error = normalizeObservationError(error)
        this.logger?.warn('Observation capture failed.', {
          runId: run.id,
          visionSessionId: run.visionSessionId,
          errorCode: run.error.code,
          recoverable: run.error.recoverable,
        })
        if (run.failureCount >= this.options.settings().consecutiveFailureLimit) {
          this.stopRun(run.id, 'failed', true, run.error)
          if (source === 'manual') {
            throw new ObservationRuntimeError(run.error)
          }
          return
        }
        await this.emitChanged('failed', run, run.error)
        if (source === 'manual') {
          throw new ObservationRuntimeError(run.error)
        }
      }
    } finally {
      state.busy = false
      state.abortController = undefined
      if (run.status === 'active') {
        const shouldRunQueued = state.queuedCapture
        state.queuedCapture = false
        if (shouldRunQueued && source === 'timer') {
          void this.executeCapture(state, 'timer')
        } else {
          this.scheduleNextEvaluation(state, run.rule.evaluationIntervalMs)
        }
      }
    }
  }

  private async performObservation(
    state: ActiveRunState,
    signal: AbortSignal,
    options: { forceReaction?: boolean } = {}
  ): Promise<ObservationTurnResult> {
    await this.modelChain.assertPolicyBeforeCapture(state.run)
    const resolved = await this.modelChain.resolve(state.run)
    const frame = await this.captureFrame(state)
    const reactionContext = createObservationReactionPromptContext({
      settings: this.options.settings(),
      consecutiveNoVisibleReactions: state.consecutiveNoVisibleReactions,
      forceReaction: options.forceReaction,
      random: this.random,
    })
    try {
      return await this.turnRunner.execute({
        run: state.run,
        resolved,
        frame,
        signal,
        reactionContext,
      })
    } finally {
      if (state.run.screenshotRetention === 'ephemeral') {
        await this.cleanupFrame(frame.captureId)
      }
    }
  }
  private async captureFrame(state: ActiveRunState) {
    let frame: Awaited<ReturnType<DesktopCaptureAdapter['capture']>>
    try {
      frame = await this.capture.capture({
        runId: state.run.id,
        visionSessionId: state.run.visionSessionId,
        scope: state.run.scope,
        sourceId: state.sourceId,
        retention: state.run.screenshotRetention,
      })
    } catch (error) {
      this.logger?.error('Desktop capture failed.', {
        runId: state.run.id,
        visionSessionId: state.run.visionSessionId,
        scope: state.run.scope,
        retention: state.run.screenshotRetention,
        error,
      })
      throw this.observationError('capture_failed', '屏幕截图失败，请检查权限或截图源。', true)
    }
    frame.retention = state.run.screenshotRetention
    if (state.run.screenshotRetention === 'persist') {
      const attachment = await this.persistFrameAttachment(frame)
      frame.attachmentId = attachment
    }
    this.captureCount += 1
    state.run.lastCapture = captureMetadata(frame)
    return frame
  }

  private async persistFrameAttachment(
    frame: Awaited<ReturnType<DesktopCaptureAdapter['capture']>>
  ): Promise<string | undefined> {
    const attachments = this.options.attachments
    if (!attachments) {
      throw this.observationError('capture_failed', '截图保留需要附件服务可用。', true)
    }
    const base64 = frame.dataUrl.split(',')[1]
    if (!base64) {
      throw this.observationError('capture_failed', '截图数据格式无效。', true)
    }
    const bytes = Uint8Array.from(Buffer.from(base64, 'base64'))
    const uploaded = await attachments.upload({
      name: `vision-capture-${frame.captureId}.png`,
      mimeType: frame.mimeType,
      bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    })
    return uploaded.attachment.id
  }

  private async dispatchDecision(
    run: ObservationRun,
    result: ObservationTurnResult
  ): Promise<void> {
    const decision = result.decision
    if (decision.decision === 'silent' || !decision.text || decision.notificationSuppressed) {
      return
    }
    const catSessionId = await this.options.resolveCatSessionId?.()
    if (!catSessionId) {
      return
    }
    const event: ObservationReactionEvent = {
      id: crypto.randomUUID(),
      observationRunId: run.id,
      visionSessionId: run.visionSessionId,
      catSessionId,
      sourceRunId: decision.runId,
      sourceMessageId: decision.messageId,
      decision: decision.decision,
      text: decision.text,
      captureId: decision.captureId,
      createdAt: decision.createdAt,
    }
    this.options.onReaction?.(event)
  }

  private async getOrCreateVisionSession(preferredId?: string) {
    try {
      return await this.requireChatService().getOrCreateSession({
        kind: 'vision',
        preferredId,
      })
    } catch (error) {
      if (error instanceof ChatSessionKindMismatchError) {
        throw this.observationError('invalid_request', '主动视觉只能绑定 vision session。', true)
      }
      throw error
    }
  }

  private requireChatService(): ChatService {
    const chat = this.options.chatService?.()
    if (!chat) {
      throw this.observationError('provider_failed', '主动视觉聊天执行入口尚未初始化。', true)
    }
    return chat
  }

  private captureCountForToday(): number {
    const date = new Date().toISOString().slice(0, 10)
    if (this.captureCountDate !== date) {
      this.captureCountDate = date
      this.captureCount = 0
    }
    return this.captureCount
  }

  private scheduleNextEvaluation(state: ActiveRunState, delayMs: number): void {
    if (state.timer) {
      clearTimeout(state.timer)
    }
    state.timer = setTimeout(
      () => {
        void this.evaluateTick(state)
      },
      Math.max(0, delayMs)
    )
  }

  private stopRun(
    runId: string,
    reason: NonNullable<StopObservationRequest['reason']>,
    emit: boolean,
    error?: ObservationErrorInfo
  ): void {
    const state = this.active?.run.id === runId ? this.active : undefined
    if (!state) return
    if (state.timer) clearTimeout(state.timer)
    state.abortController?.abort(reason)
    const stoppedAt = Date.now()
    state.run.status = reason === 'failed' ? 'failed' : 'stopped'
    state.run.stopReason = reason
    state.run.stoppedAt = stoppedAt
    state.run.error = error ?? state.run.error
    this.active = undefined
    this.lastRun = cloneRun(state.run)
    void this.capture.cleanupAll?.()
    this.logger?.info('Observation vision runtime stopped.', {
      runId,
      visionSessionId: state.run.visionSessionId,
      reason,
      status: state.run.status,
      errorCode: state.run.error?.code,
    })
    if (emit) {
      void this.emitChanged(state.run.status === 'failed' ? 'failed' : 'stopped', state.run, error)
    }
  }

  private findRunState(request: TriggerObservationRequest): ActiveRunState | undefined {
    if (!this.active) {
      return undefined
    }
    if (request.runId && request.runId !== this.active.run.id) {
      return undefined
    }
    if (request.visionSessionId && request.visionSessionId !== this.active.run.visionSessionId) {
      return undefined
    }
    return this.active
  }

  private async cleanupFrame(captureId: string): Promise<void> {
    try {
      await this.capture.cleanupCapture?.(captureId)
    } catch (error) {
      this.logger?.warn('Observation capture cleanup failed.', { captureId, error })
    }
  }

  private async emitChanged(
    reason: ObservationChangedEvent['reason'],
    run?: ObservationRun,
    error?: ObservationErrorInfo
  ): Promise<void> {
    const event: ObservationChangedEvent = {
      reason,
      run: run ? cloneRun(run) : undefined,
      activeRuns: this.active ? [cloneRun(this.active.run)] : [],
      runtime: this.runtimeState(run),
      error,
      updatedAt: Date.now(),
    }
    this.options.onChanged?.(event)
  }

  private async snapshotState(
    permission: ObservationPermissionStatus,
    visionSessionId?: string
  ): Promise<ObservationState> {
    const activeRuns = this.active ? [this.active.run] : []
    const filtered = activeRuns
      .filter((run) => !visionSessionId || run.visionSessionId === visionSessionId)
      .map(cloneRun)
    const runtimeRun =
      filtered[0] ??
      (!this.active && (!visionSessionId || this.lastRun?.visionSessionId === visionSessionId)
        ? this.lastRun
        : undefined)
    return {
      activeRuns: filtered,
      runtime: this.runtimeState(runtimeRun),
      visionSessionId:
        this.active?.run.visionSessionId ??
        this.lastRun?.visionSessionId ??
        this.lastVisionSessionId,
      permission,
      updatedAt: Date.now(),
    }
  }

  private runtimeState(
    run: ObservationRun | undefined = this.active?.run
  ): ObservationRuntimeState {
    if (!run || run.status !== 'active') {
      return {
        active: false,
        status: run?.status ?? 'inactive',
        visionSessionId: run?.visionSessionId ?? this.lastVisionSessionId,
        runId: run?.id,
        updatedAt: Date.now(),
      }
    }
    return {
      active: true,
      status: run.status,
      visionSessionId: run.visionSessionId,
      runId: run.id,
      startedAt: run.startedAt,
      busy: this.active?.busy,
      updatedAt: Date.now(),
    }
  }

  private observationError(
    code: ObservationErrorCode,
    message: string,
    recoverable = false
  ): ObservationRuntimeError {
    return createObservationError(code, message, recoverable)
  }
}

function captureMetadata(frame: ObservationCaptureMetadata): ObservationCaptureMetadata {
  return {
    captureId: frame.captureId,
    scope: frame.scope,
    sourceId: frame.sourceId,
    sourceType: frame.sourceType,
    mimeType: frame.mimeType,
    width: frame.width,
    height: frame.height,
    createdAt: frame.createdAt,
    retention: frame.retention,
  }
}

function shouldProbeScreenPermission(permission: ObservationPermissionStatus): boolean {
  return (
    permission.platform === 'darwin' &&
    (permission.screen === 'not-determined' || permission.screen === 'denied')
  )
}

function normalizeScope(
  value: ObservationScope | undefined,
  fallback: ObservationScope
): ObservationScope {
  return value === 'primary_display' || value === 'selected_display' || value === 'selected_window'
    ? value
    : fallback
}

function normalizeScreenshotRetention(
  value: ObservationScreenshotRetention | undefined,
  fallback: ObservationScreenshotRetention
): ObservationScreenshotRetention {
  return value === 'ephemeral' || value === 'persist' ? value : fallback
}

function cloneRun(run: ObservationRun): ObservationRun {
  return structuredClone(run)
}

function hasLegacyTargetSessionPayload(request: Record<string, unknown>): boolean {
  return 'targetSessionId' in request || 'targetSessionKind' in request
}

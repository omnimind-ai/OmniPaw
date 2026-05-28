import type { AttachmentService } from '@core/chat/attachment-service'
import type { ChatService } from '@core/chat/chat-service'
import type { ChatRunEventTarget, ChatRunTerminalEvent } from '@core/chat/run-manager'
import type { ChatSessionRepo } from '@core/db/repos'
import type { Logger } from '@core/logging'
import { OBSERVATION_PROMPTS } from '@core/prompts'
import type { ProviderManager, ProviderModelRecord, ProviderRecord } from '@core/provider/manager'
import type { ChatMessagePart, ChatSession } from '@shared/types/chat'
import type {
  ObservationCaptureMetadata,
  ObservationChangedEvent,
  ObservationDecision,
  ObservationErrorCode,
  ObservationErrorInfo,
  ObservationModelChain,
  ObservationPermissionStatus,
  ObservationReactionCandidate,
  ObservationReactionDecision,
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
import type { ProviderModelRef } from '@shared/types/provider'
import type { DesktopObservationSettings } from '@shared/types/settings'
import type { DesktopCaptureAdapter } from './types'

export interface ObservationManagerOptions {
  capture: DesktopCaptureAdapter
  settings: () => DesktopObservationSettings
  providers: ProviderManager
  sessions: ChatSessionRepo
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
  expirationTimer?: ReturnType<typeof setTimeout>
  abortController?: AbortController
  sourceId?: string
  busy: boolean
  queuedCapture: boolean
}

interface ResolvedModel {
  provider: ProviderRecord
  model: ProviderModelRecord
}

interface ResolvedChain {
  chain: ObservationModelChain
  vision: ResolvedModel
  reaction?: ResolvedModel
}

interface ObservationTickResult {
  frame: {
    metadata: ObservationCaptureMetadata
    dataUrl: string
  }
  terminal: ChatRunTerminalEvent
  summary?: string
  candidate: ObservationReactionCandidate
  decision: ObservationReactionDecision
}

const visionTitle = '主动视觉'
const captureMarkerText =
  '[Vision capture: screenshot was used only for the current run and was not retained.]'

export class ObservationManager {
  private readonly capture: DesktopCaptureAdapter
  private readonly providers: ProviderManager
  private readonly sessions: ChatSessionRepo
  private readonly logger?: Logger
  private readonly random: () => number
  private active: ActiveRunState | undefined
  private lastRun: ObservationRun | undefined
  private lastVisionSessionId: string | undefined
  private captureCountDate = ''
  private captureCount = 0

  constructor(private readonly options: ObservationManagerOptions) {
    this.capture = options.capture
    this.providers = options.providers
    this.sessions = options.sessions
    this.logger = options.logger
    this.random = options.random ?? Math.random
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

    const permission = await this.permissionStatus()
    if (permission.screen !== 'granted' && permission.screen !== 'unknown') {
      throw this.observationError(
        'permission_denied',
        permission.message || '屏幕录制权限不可用，请在系统设置中允许屏幕捕获。',
        true
      )
    }

    await this.assertModelPolicyBeforeCapture()
    const session = await this.getOrCreateVisionSession(request.visionSessionId)
    if (this.active) {
      this.stopRun(this.active.run.id, 'user', false)
    }

    const settings = this.options.settings()
    const durationMs = this.normalizeDuration(request.durationMs, settings)
    const retention = normalizeScreenshotRetention(
      request.screenshotRetention,
      settings.screenshotRetention
    )
    const run: ObservationRun = {
      id: crypto.randomUUID(),
      visionSessionId: session.id,
      status: 'active',
      startedAt: Date.now(),
      expiresAt: Date.now() + durationMs,
      durationMs,
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

    const resolved = await this.resolveModelChain(run)
    run.visionModelRef = resolved.chain.visionModelRef
    run.reactionModelRef = resolved.chain.reactionModelRef
    run.modelChainMode = resolved.chain.mode

    const state: ActiveRunState = {
      run,
      sourceId: request.sourceId,
      busy: false,
      queuedCapture: false,
    }
    this.active = state
    this.lastRun = undefined
    this.lastVisionSessionId = session.id
    this.scheduleExpiration(state)
    this.scheduleNextEvaluation(state, run.rule.evaluationIntervalMs)
    this.logger?.info('Observation vision runtime started.', {
      runId: run.id,
      visionSessionId: run.visionSessionId,
      evaluationIntervalMs: run.rule.evaluationIntervalMs,
      captureProbability: run.rule.captureProbability,
      minCaptureIntervalMs: run.rule.minCaptureIntervalMs,
      durationMs: run.durationMs,
      scope: run.scope,
      screenshotRetention: run.screenshotRetention,
      modelChainMode: run.modelChainMode,
    })
    await this.emitChanged('started', run)
    return this.status()
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
    await this.executeCapture(state, 'manual')
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
  }

  private async evaluateTick(state: ActiveRunState): Promise<void> {
    const run = state.run
    if (run.status !== 'active') {
      return
    }
    run.rule.lastEvaluationAt = Date.now()
    if (Date.now() >= run.expiresAt) {
      this.stopRun(run.id, 'expired', true)
      return
    }
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
    manual: boolean
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

  private async executeCapture(state: ActiveRunState, source: 'timer' | 'manual'): Promise<void> {
    const run = state.run
    if (run.status !== 'active') {
      return
    }
    if (Date.now() >= run.expiresAt) {
      this.stopRun(run.id, 'expired', true)
      return
    }
    if (state.busy) {
      if (source === 'timer') {
        state.queuedCapture = true
        return
      }
      throw this.observationError('run_busy', '观察正在执行中，请稍后再试。', true)
    }

    const skipReason = this.skipReasonForEvaluation(state, source === 'manual')
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
      const result = await this.performObservation(state, state.abortController.signal)
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
      await this.emitChanged(source === 'timer' ? 'tick' : 'updated', run)
    } catch (error) {
      if (isAbortError(error)) {
        run.error = this.toErrorInfo('aborted', '观察已停止。', false)
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
    signal: AbortSignal
  ): Promise<ObservationTickResult> {
    await this.assertModelPolicyBeforeCapture()
    const resolved = await this.resolveModelChain(state.run)
    const frame = await this.captureFrame(state)
    try {
      const result =
        resolved.chain.mode === 'split'
          ? await this.performSplitObservation(state.run, resolved, frame, signal)
          : await this.performSingleObservation(state.run, resolved, frame, signal)
      return result
    } finally {
      if (state.run.screenshotRetention === 'ephemeral') {
        await this.cleanupFrame(frame.captureId)
      }
    }
  }

  private async performSingleObservation(
    run: ObservationRun,
    resolved: ResolvedChain,
    frame: Awaited<ReturnType<DesktopCaptureAdapter['capture']>>,
    signal: AbortSignal
  ): Promise<ObservationTickResult> {
    const parts = this.captureParts(frame, run.screenshotRetention, {
      prompt: OBSERVATION_PROMPTS.singleModelReactionUser({
        sessionKind: 'vision',
        sessionTitle: visionTitle,
      }),
    })
    const terminal = await this.sendVisionTurn({
      run,
      frame,
      providerId: resolved.vision.provider.id,
      modelId: resolved.vision.model.id,
      parts,
      signal,
      metadata: {
        source: 'observation',
        observationRunId: run.id,
        captureId: frame.captureId,
        phase: 'single_multimodal',
        screenshotRetention: run.screenshotRetention,
      },
    })
    const text = terminal.type === 'final' ? textFromParts(terminal.message.parts) : ''
    const candidate = parseCandidate(text)
    const decision = this.gateDecision(run, candidate, frame, terminal)
    return {
      frame: {
        metadata: captureMetadata(frame),
        dataUrl: frame.dataUrl,
      },
      terminal,
      candidate,
      decision,
    }
  }

  private async performSplitObservation(
    run: ObservationRun,
    resolved: ResolvedChain,
    frame: Awaited<ReturnType<DesktopCaptureAdapter['capture']>>,
    signal: AbortSignal
  ): Promise<ObservationTickResult> {
    const visionTerminal = await this.sendVisionTurn({
      run,
      frame,
      providerId: resolved.vision.provider.id,
      modelId: resolved.vision.model.id,
      parts: this.captureParts(frame, run.screenshotRetention, {
        prompt: OBSERVATION_PROMPTS.visionSummaryUser,
      }),
      signal,
      metadata: {
        source: 'observation',
        observationRunId: run.id,
        captureId: frame.captureId,
        phase: 'vision_summary',
        screenshotRetention: run.screenshotRetention,
      },
    })
    const summary =
      visionTerminal.type === 'final' ? textFromParts(visionTerminal.message.parts) : ''
    const reaction = resolved.reaction ?? resolved.vision
    const reactionTerminal = await this.sendVisionTurn({
      run,
      providerId: reaction.provider.id,
      modelId: reaction.model.id,
      parts: [
        {
          type: 'plain',
          text: OBSERVATION_PROMPTS.splitReactionUser({
            sessionKind: 'vision',
            sessionTitle: visionTitle,
            summary,
          }),
        },
      ],
      signal,
      metadata: {
        source: 'observation',
        observationRunId: run.id,
        captureId: frame.captureId,
        phase: 'reaction_decision',
        summaryMessageId: visionTerminal.type === 'final' ? visionTerminal.message.id : undefined,
      },
    })
    const text =
      reactionTerminal.type === 'final' ? textFromParts(reactionTerminal.message.parts) : ''
    const candidate = {
      ...parseCandidate(text),
      summary,
    }
    const decision = this.gateDecision(run, candidate, frame, reactionTerminal)
    return {
      frame: {
        metadata: captureMetadata(frame),
        dataUrl: frame.dataUrl,
      },
      terminal: reactionTerminal,
      summary,
      candidate,
      decision,
    }
  }

  private async sendVisionTurn(input: {
    run: ObservationRun
    frame?: Awaited<ReturnType<DesktopCaptureAdapter['capture']>>
    providerId: string
    modelId: string
    parts: ChatMessagePart[]
    signal: AbortSignal
    metadata: Record<string, unknown>
  }): Promise<ChatRunTerminalEvent> {
    const chat = this.options.chatService?.()
    if (!chat) {
      throw this.observationError('provider_failed', '主动视觉聊天执行入口尚未初始化。', true)
    }
    const target = this.options.eventTarget?.()
    if (!target) {
      throw this.observationError('provider_failed', '主动视觉事件广播入口不可用。', true)
    }
    const response = await chat.sendInternalMessage(
      {
        sessionId: input.run.visionSessionId,
        parts: input.parts,
        providerId: input.providerId,
        modelId: input.modelId,
        mode: 'fast_chat',
        toolProfile: 'minimal',
        maxSteps: 1,
        metadata: input.metadata,
        transientImageInputs:
          input.frame && input.run.screenshotRetention === 'ephemeral'
            ? [
                {
                  captureId: input.frame.captureId,
                  dataUrl: input.frame.dataUrl,
                  mimeType: input.frame.mimeType,
                  width: input.frame.width,
                  height: input.frame.height,
                  createdAt: input.frame.createdAt,
                },
              ]
            : undefined,
      },
      target,
      input.signal
    )
    const terminal = await response.terminalEvent
    if (terminal.type === 'error') {
      throw this.observationError(
        terminal.error.code === 'aborted' ? 'aborted' : 'provider_failed',
        terminal.error.message,
        terminal.error.retryable
      )
    }
    return terminal
  }

  private captureParts(
    frame: Awaited<ReturnType<DesktopCaptureAdapter['capture']>>,
    retention: ObservationScreenshotRetention,
    options: { prompt: string }
  ): ChatMessagePart[] {
    const parts: ChatMessagePart[] = [
      { type: 'plain', text: options.prompt },
      {
        type: 'vision_capture',
        captureId: frame.captureId,
        scope: frame.scope,
        sourceId: frame.sourceId,
        sourceType: frame.sourceType,
        mimeType: frame.mimeType,
        width: frame.width,
        height: frame.height,
        retention,
        createdAt: frame.createdAt,
        marker: retention === 'ephemeral' ? captureMarkerText : undefined,
      },
    ]
    if (retention === 'persist') {
      const attachmentId = frame.attachmentId
      if (attachmentId) {
        parts.push({
          type: 'image',
          attachmentId,
          attachment_id: attachmentId,
          filename: `vision-capture-${frame.captureId}.png`,
        })
      }
    }
    return parts
  }

  private async captureFrame(state: ActiveRunState) {
    let frame: Awaited<ReturnType<DesktopCaptureAdapter['capture']>>
    try {
      frame = await this.capture.capture({
        runId: state.run.id,
        visionSessionId: state.run.visionSessionId,
        scope: state.run.scope,
        sourceId: state.sourceId,
      })
    } catch {
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

  private gateDecision(
    run: ObservationRun,
    candidate: ObservationReactionCandidate,
    frame: ObservationCaptureMetadata,
    terminal: ChatRunTerminalEvent
  ): ObservationReactionDecision {
    const now = Date.now()
    const text = sanitizeReactionText(candidate.text)
    let decision = normalizeDecision(candidate.decision)
    let suppressionReason: ObservationReactionDecision['suppressionReason']
    if (!text && decision !== 'silent') {
      decision = 'silent'
      suppressionReason = 'empty_text'
    }
    const cooldownMs = this.options.settings().notificationCooldownMs
    if (
      decision !== 'silent' &&
      run.notification.lastNotificationAt &&
      now - run.notification.lastNotificationAt < cooldownMs
    ) {
      suppressionReason = 'cooldown'
    }
    return {
      decision: suppressionReason ? 'silent' : decision,
      text: suppressionReason || decision === 'silent' ? undefined : text,
      reason: truncate(candidate.reason, 180),
      summary: truncate(candidate.summary, 2_000),
      captureId: frame.captureId,
      runId: terminal.runId,
      messageId: terminal.assistantMessageId,
      notificationSuppressed: Boolean(suppressionReason),
      suppressionReason,
      createdAt: now,
    }
  }

  private async dispatchDecision(
    run: ObservationRun,
    result: ObservationTickResult
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

  private async resolveModelChain(run: ObservationRun): Promise<ResolvedChain> {
    const registry = this.providers.loadRegistry().registry
    const settings = registry.settings
    const visionRef = run.visionModelRef ?? settings.observationVisionModelRef
    const reactionRef = run.reactionModelRef ?? settings.observationReactionModelRef

    const vision = visionRef ? await this.resolveEnabledModel(visionRef) : undefined
    const reaction = reactionRef ? await this.resolveEnabledModel(reactionRef) : undefined

    if (vision && !modelSupports(vision.model, 'image')) {
      throw this.observationError('model_capability', '视觉观察模型需要支持图片输入。', true)
    }
    if (reaction && !modelSupports(reaction.model, 'text')) {
      throw this.observationError(
        'model_capability',
        'Observation reaction 模型需要支持文本输入。',
        true
      )
    }
    if (vision && reaction) {
      return this.toChain(vision, reaction, 'split')
    }
    if (vision) {
      return this.toChain(vision, undefined, 'single_multimodal')
    }
    if (reaction?.model && modelSupports(reaction.model, 'image')) {
      return this.toChain(reaction, undefined, 'single_multimodal')
    }

    const fallbackVision = await this.findVisionFallback()
    if (!fallbackVision) {
      throw this.observationError('no_vision_model', '需要配置支持图片输入的视觉模型。', true)
    }
    return reaction
      ? this.toChain(fallbackVision, reaction, 'split')
      : this.toChain(fallbackVision, undefined, 'single_multimodal')
  }

  private async findVisionFallback(): Promise<ResolvedModel | undefined> {
    const registry = this.providers.loadRegistry().registry
    const candidates: ProviderModelRef[] = []
    if (registry.settings.defaultProviderId && registry.settings.defaultModelId) {
      candidates.push({
        providerId: registry.settings.defaultProviderId,
        modelId: registry.settings.defaultModelId,
      })
    }
    candidates.push(...registry.settings.fallbackModelRefs)
    for (const source of registry.sources) {
      for (const model of registry.models.filter((item) => item.providerId === source.id)) {
        candidates.push({ providerId: source.id, modelId: model.id })
      }
    }
    const seen = new Set<string>()
    for (const ref of candidates) {
      const key = `${ref.providerId}:${ref.modelId}`
      if (seen.has(key)) continue
      seen.add(key)
      const resolved = await this.resolveEnabledModel(ref).catch(() => undefined)
      if (resolved && modelSupports(resolved.model, 'image')) {
        return resolved
      }
    }
    return undefined
  }

  private async resolveEnabledModel(ref: ProviderModelRef): Promise<ResolvedModel> {
    const provider = await this.providers.get(ref.providerId)
    const model = provider?.models.find((item) => item.id === ref.modelId && item.enabled !== false)
    if (!provider || provider.enabled === false || !model) {
      throw this.observationError(
        'model_capability',
        `观察模型不可用：${ref.providerId}/${ref.modelId}`,
        true
      )
    }
    return {
      provider: provider as ProviderRecord,
      model: model as ProviderModelRecord,
    }
  }

  private toChain(
    vision: ResolvedModel,
    reaction: ResolvedModel | undefined,
    mode: ObservationModelChain['mode']
  ): ResolvedChain {
    const chain: ObservationModelChain = {
      visionModelRef: { providerId: vision.provider.id, modelId: vision.model.id },
      reactionModelRef: reaction
        ? { providerId: reaction.provider.id, modelId: reaction.model.id }
        : undefined,
      mode,
    }
    return { chain, vision, reaction }
  }

  private async assertModelPolicyBeforeCapture(): Promise<void> {
    const settings = this.options.settings()
    const resolved = await this.resolveModelChain({
      id: 'policy-check',
      visionSessionId: 'policy-check',
      status: 'active',
      startedAt: Date.now(),
      expiresAt: Date.now(),
      durationMs: 0,
      scope: settings.defaultScope,
      screenshotRetention: settings.screenshotRetention,
      rule: {
        evaluationIntervalMs: settings.evaluationIntervalMs,
        captureProbability: settings.captureProbability,
        minCaptureIntervalMs: settings.minCaptureIntervalMs,
        dailyCaptureLimit: settings.dailyCaptureLimit,
        consecutiveFailureLimit: settings.consecutiveFailureLimit,
        notificationCooldownMs: settings.notificationCooldownMs,
        capturesToday: this.captureCountForToday(),
      },
      notification: { cooldownMs: settings.notificationCooldownMs },
      failureCount: 0,
    })
    const models = [resolved.vision, resolved.reaction].filter(Boolean) as ResolvedModel[]
    const external = models.some((item) => isExternalProvider(item.provider))
    if ((settings.localOnly || !settings.allowRemoteProviders) && external) {
      throw this.observationError('privacy_policy', '当前主动视觉策略禁止使用外部 Provider。', true)
    }
  }

  private async getOrCreateVisionSession(preferredId?: string): Promise<ChatSession> {
    const preferred = preferredId ? this.sessions.get(preferredId) : undefined
    if (preferred && preferred.status !== 'deleted' && preferred.kind === 'vision') {
      return preferred
    }
    if (preferredId && preferred?.kind !== 'vision') {
      throw this.observationError('invalid_request', '主动视觉只能绑定 vision session。', true)
    }
    const existing = this.sessions
      .list({ kind: 'vision' })
      .find((session) => session.status === 'active')
    if (existing) {
      return existing
    }
    const now = Date.now()
    const session: ChatSession = {
      id: crypto.randomUUID(),
      title: visionTitle,
      kind: 'vision',
      status: 'active',
      messageCount: 0,
      contextPolicy: {
        mode: 'summary-plus-recent',
        keepRecentTurns: 6,
        includeAttachments: 'current-only',
      },
      metadata: {
        system: 'observation',
      },
      createdAt: now,
      updatedAt: now,
    }
    this.sessions.save(session)
    return this.sessions.get(session.id) ?? session
  }

  private normalizeDuration(value: number | undefined, settings: DesktopObservationSettings) {
    const duration = Number.isFinite(value) ? Math.floor(Number(value)) : settings.defaultDurationMs
    if (duration < 10_000 || duration > 24 * 60 * 60_000) {
      throw this.observationError(
        'invalid_request',
        '观察时长需在 10000ms 到 86400000ms 之间。',
        true
      )
    }
    return duration
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

  private scheduleExpiration(state: ActiveRunState): void {
    if (state.expirationTimer) {
      clearTimeout(state.expirationTimer)
    }
    state.expirationTimer = setTimeout(
      () => {
        this.stopRun(state.run.id, 'expired', true)
      },
      Math.max(0, state.run.expiresAt - Date.now())
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
    if (state.expirationTimer) clearTimeout(state.expirationTimer)
    state.abortController?.abort(reason)
    const stoppedAt = Date.now()
    state.run.status = reason === 'expired' ? 'expired' : reason === 'failed' ? 'failed' : 'stopped'
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
      void this.emitChanged(
        state.run.status === 'expired'
          ? 'expired'
          : state.run.status === 'failed'
            ? 'failed'
            : 'stopped',
        state.run,
        error
      )
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
      expiresAt: run.expiresAt,
      remainingMs: Math.max(0, run.expiresAt - Date.now()),
      busy: this.active?.busy,
      updatedAt: Date.now(),
    }
  }

  private observationError(
    code: ObservationErrorCode,
    message: string,
    recoverable = false
  ): ObservationRuntimeError {
    return new ObservationRuntimeError(this.toErrorInfo(code, message, recoverable))
  }

  private toErrorInfo(
    code: ObservationErrorCode,
    message: string,
    recoverable = false
  ): ObservationErrorInfo {
    return { code, message, recoverable }
  }
}

export class ObservationRuntimeError extends Error {
  readonly details: ObservationErrorInfo

  constructor(details: ObservationErrorInfo) {
    super(details.message)
    this.name = 'ObservationRuntimeError'
    this.details = details
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

function normalizeObservationError(error: unknown): ObservationErrorInfo {
  if (error instanceof ObservationRuntimeError) {
    return error.details
  }
  if (isAbortError(error)) {
    return { code: 'aborted', message: '观察已停止。', recoverable: false }
  }
  return {
    code: 'unknown',
    message: error instanceof Error ? error.message : '主动视觉观察失败。',
    recoverable: true,
  }
}

function modelSupports(model: ProviderModelRecord, input: 'text' | 'image'): boolean {
  const inputs = model.input?.length ? model.input : ['text']
  return inputs.includes(input)
}

function isExternalProvider(provider: ProviderRecord): boolean {
  const baseUrl = provider.baseUrl || ''
  if (!baseUrl) return false
  try {
    const host = new URL(baseUrl).hostname.toLowerCase()
    return host !== 'localhost' && host !== '127.0.0.1' && host !== '::1'
  } catch {
    return true
  }
}

function parseCandidate(raw: string): ObservationReactionCandidate {
  const json = extractJson(raw)
  if (json) {
    try {
      const parsed = JSON.parse(json) as Record<string, unknown>
      const mode = parsed.mode ?? parsed.decision
      return {
        text: sanitizeReactionText(parsed.text),
        decision: normalizeDecision(mode),
        reason: typeof parsed.reason === 'string' ? parsed.reason : undefined,
        summary: typeof parsed.summary === 'string' ? parsed.summary : undefined,
      }
    } catch {
      // Fall through to plain text.
    }
  }
  return { text: sanitizeReactionText(raw), decision: 'notify' }
}

function extractJson(value: string): string | undefined {
  const trimmed = value.trim()
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed
  }
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  return start >= 0 && end > start ? trimmed.slice(start, end + 1) : undefined
}

function sanitizeReactionText(value: unknown): string {
  if (typeof value !== 'string') return ''
  return (
    truncate(
      value
        .replace(/\p{Cc}/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
      240
    ) ?? ''
  )
}

function truncate(value: string | undefined, maxLength: number): string | undefined {
  if (!value) return undefined
  return value.length > maxLength ? value.slice(0, maxLength).trimEnd() : value
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

function normalizeDecision(value: unknown): ObservationDecision {
  if (value === 'ask') return 'ask'
  if (value === 'notify' || value === 'ambient' || value === 'chat') return 'notify'
  return 'silent'
}

function cloneRun(run: ObservationRun): ObservationRun {
  return structuredClone(run)
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  )
}

function textFromParts(parts: ChatMessagePart[]): string {
  return parts
    .map((part) => {
      const record = part as Record<string, unknown>
      return part.type === 'plain' && typeof record.text === 'string' ? record.text : ''
    })
    .filter(Boolean)
    .join('\n')
    .trim()
}

function hasLegacyTargetSessionPayload(request: Record<string, unknown>): boolean {
  return 'targetSessionId' in request || 'targetSessionKind' in request
}

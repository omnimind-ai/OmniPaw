import type { ChatMessageRepo, ChatSessionRepo } from '@core/db/repos'
import type { Logger } from '@core/logging'
import type { BaseProvider, ProviderMessage } from '@core/provider/base-provider'
import type { ProviderManager, ProviderModelRecord, ProviderRecord } from '@core/provider/manager'
import type { ChatMessage, ChatMessagePart, ChatSession, ID, UnixMs } from '@shared/types/chat'
import type {
  ObservationCaptureMetadata,
  ObservationChangedEvent,
  ObservationErrorCode,
  ObservationErrorInfo,
  ObservationModelChain,
  ObservationOutputMode,
  ObservationPermissionStatus,
  ObservationReactionCandidate,
  ObservationReactionDecision,
  ObservationReactionEvent,
  ObservationRetention,
  ObservationRun,
  ObservationScope,
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
  messages: ChatMessageRepo
  onChanged?: (event: ObservationChangedEvent) => void
  onReaction?: (event: ObservationReactionEvent) => void
  logger?: Logger
}

interface ActiveRunState {
  run: ObservationRun
  timer?: ReturnType<typeof setTimeout>
  expirationTimer?: ReturnType<typeof setTimeout>
  abortController?: AbortController
  sourceId?: string
  busy: boolean
  lastTriggeredAt?: UnixMs
}

interface ResolvedModel {
  provider: ProviderRecord
  model: ProviderModelRecord
}

interface ResolvedChain {
  chain: ObservationModelChain
  vision: ResolvedModel
  reaction: ResolvedModel
}

interface ObservationTickResult {
  frame: {
    metadata: ObservationCaptureMetadata
    dataUrl: string
  }
  summary: string
  candidate: ObservationReactionCandidate
  decision: ObservationReactionDecision
}

const localHostnames = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0'])

export class ObservationManager {
  private readonly capture: DesktopCaptureAdapter
  private readonly providers: ProviderManager
  private readonly sessions: ChatSessionRepo
  private readonly messages: ChatMessageRepo
  private readonly logger?: Logger
  private readonly runs = new Map<string, ActiveRunState>()
  private captureCountDate = ''
  private captureCount = 0

  constructor(private readonly options: ObservationManagerOptions) {
    this.capture = options.capture
    this.providers = options.providers
    this.sessions = options.sessions
    this.messages = options.messages
    this.logger = options.logger
  }

  async permissionStatus(): Promise<ObservationPermissionStatus> {
    return await this.capture.permissionStatus()
  }

  async status(targetSessionId?: string): Promise<ObservationState> {
    return this.snapshotState(await this.permissionStatus(), targetSessionId)
  }

  async start(request: StartObservationRequest): Promise<ObservationState> {
    const settings = this.options.settings()
    if (!settings.enabled) {
      throw this.observationError('disabled', '请先在设置中启用主动视觉观察。', true)
    }

    const session = this.requireSession(request.targetSessionId, request.targetSessionKind)
    const permission = await this.permissionStatus()
    if (permission.screen !== 'granted' && permission.screen !== 'unknown') {
      throw this.observationError(
        'permission_denied',
        permission.message || '屏幕录制权限不可用，请在系统设置中允许屏幕捕获。',
        true
      )
    }

    this.stopBySession(session.id, 'user', false)

    const durationMs = this.normalizeDuration(request.durationMs, settings)
    const intervalMs = this.normalizeInterval(request.intervalMs, settings)
    const outputMode = normalizeOutputMode(request.outputMode, settings.outputMode)
    const retention = normalizeRetention(request.retention, settings.retention)
    const allowRemoteProviders = request.allowRemoteProviders ?? settings.allowRemoteProviders
    const localOnly = request.localOnly ?? settings.localOnly
    const run: ObservationRun = {
      id: crypto.randomUUID(),
      targetSessionId: session.id,
      targetSessionKind: session.kind === 'cat' ? 'cat' : 'chat',
      surface:
        request.surface ?? (session.kind === 'cat' || outputMode === 'ambient' ? 'cat' : 'chat'),
      status: 'active',
      startedAt: Date.now(),
      expiresAt: Date.now() + durationMs,
      durationMs,
      intervalMs,
      scope: normalizeScope(request.scope, settings.defaultScope),
      outputMode,
      retention,
      allowRemoteProviders,
      localOnly,
      remoteRiskAccepted: request.remoteRiskAccepted,
      failureCount: 0,
    }

    const resolved = await this.resolveModelChain(session, run)
    this.assertRemoteRisk(run, resolved)
    run.visionModelRef = resolved.chain.visionModelRef
    run.reactionModelRef = resolved.chain.reactionModelRef
    run.modelChainMode = resolved.chain.mode

    const state: ActiveRunState = {
      run,
      sourceId: request.sourceId,
      busy: false,
    }
    this.runs.set(run.id, state)
    this.scheduleExpiration(state)
    this.scheduleNextTick(state, 0)
    this.logger?.info('Observation run started.', {
      runId: run.id,
      sessionId: run.targetSessionId,
      kind: run.targetSessionKind,
      intervalMs: run.intervalMs,
      durationMs: run.durationMs,
      scope: run.scope,
      outputMode: run.outputMode,
      localOnly: run.localOnly,
      modelChainMode: run.modelChainMode,
      remoteVision: resolved.chain.remoteVision,
      remoteReaction: resolved.chain.remoteReaction,
    })
    await this.emitChanged('started', run)
    return this.status()
  }

  async stop(request: StopObservationRequest = {}): Promise<ObservationState> {
    const reason = request.reason ?? 'user'
    if (request.runId) {
      this.stopRun(request.runId, reason, true)
    } else if (request.targetSessionId) {
      this.stopBySession(request.targetSessionId, reason, true)
    } else {
      for (const runId of [...this.runs.keys()]) {
        this.stopRun(runId, reason, true)
      }
    }
    return this.status()
  }

  async trigger(request: TriggerObservationRequest = {}): Promise<ObservationState> {
    const state = this.findRunState(request)
    if (!state) {
      throw this.observationError('run_not_found', '没有正在运行的主动视觉观察。', true)
    }
    await this.executeTick(state, 'manual')
    return this.status()
  }

  async captureForTool(sessionId: string): Promise<ScreenObserveToolResult> {
    const state = [...this.runs.values()].find(
      (item) => item.run.targetSessionId === sessionId && item.run.status === 'active'
    )
    if (!state) {
      throw this.observationError(
        'run_not_found',
        '需要先在当前会话中启动限时观察，才能调用 screen_observe。',
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

  dispose(reason: StopObservationRequest['reason'] = 'app_exit'): void {
    for (const runId of [...this.runs.keys()]) {
      this.stopRun(runId, reason, false)
    }
    void this.capture.cleanupAll?.()
  }

  private async executeTick(state: ActiveRunState, source: 'timer' | 'manual'): Promise<void> {
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
        return
      }
      throw this.observationError('run_busy', '观察正在执行中，请稍后再试。', true)
    }

    state.busy = true
    state.abortController = new AbortController()
    state.lastTriggeredAt = Date.now()
    try {
      const result = await this.performObservation(state, state.abortController.signal)
      run.lastCapture = result.frame.metadata
      run.lastDecision = result.decision
      if (result.decision.mode !== 'silent') {
        run.lastReactionAt = result.decision.createdAt
      }
      run.failureCount = 0
      await this.dispatchDecision(run, result)
      await this.emitChanged(source === 'timer' ? 'tick' : 'updated', run)
    } catch (error) {
      if (isAbortError(error)) {
        run.error = this.toErrorInfo('aborted', '观察已停止。', false)
      } else {
        run.failureCount += 1
        run.error = normalizeObservationError(error)
        this.logger?.warn('Observation tick failed.', {
          runId: run.id,
          sessionId: run.targetSessionId,
          errorCode: run.error.code,
          recoverable: run.error.recoverable,
        })
        if (run.failureCount >= this.options.settings().consecutiveFailureLimit) {
          this.stopRun(run.id, 'failed', true, run.error)
          return
        }
        await this.emitChanged('failed', run, run.error)
      }
    } finally {
      state.busy = false
      state.abortController = undefined
      if (run.status === 'active') {
        this.scheduleNextTick(state, run.intervalMs)
      }
    }
  }

  private async performObservation(
    state: ActiveRunState,
    signal: AbortSignal
  ): Promise<ObservationTickResult> {
    this.assertDailyLimit()
    const session = this.requireSession(state.run.targetSessionId, state.run.targetSessionKind)
    const resolved = await this.resolveModelChain(session, state.run)
    this.assertRemoteRisk(state.run, resolved)
    const frame = await this.captureFrame(state)
    try {
      const summary =
        resolved.chain.mode === 'split'
          ? await this.generateVisionSummary(resolved, frame.dataUrl, signal)
          : ''
      const candidate =
        resolved.chain.mode === 'split'
          ? await this.generateReaction(resolved, session, summary, signal)
          : await this.generateSingleModelReaction(resolved, session, frame.dataUrl, signal)
      const decision = this.gateReaction(state.run, candidate, frame)
      return {
        frame: {
          metadata: frame,
          dataUrl: frame.dataUrl,
        },
        summary,
        candidate,
        decision,
      }
    } finally {
      if (state.run.retention === 'ephemeral') {
        await this.cleanupFrame(frame.captureId)
      }
    }
  }

  private async captureFrame(state: ActiveRunState) {
    let frame: Awaited<ReturnType<DesktopCaptureAdapter['capture']>>
    try {
      frame = await this.capture.capture({
        runId: state.run.id,
        scope: state.run.scope,
        sourceId: state.sourceId,
      })
    } catch {
      throw this.observationError('capture_failed', '屏幕截图失败，请检查权限或截图源。', true)
    }
    frame.retention = state.run.retention
    this.captureCount += 1
    const { dataUrl: _dataUrl, ...metadata } = frame
    state.run.lastCapture = metadata
    return frame
  }

  private async generateVisionSummary(
    resolved: ResolvedChain,
    dataUrl: string,
    signal: AbortSignal
  ): Promise<string> {
    const text = await this.callProviderText({
      resolved: resolved.vision,
      signal,
      messages: [
        {
          role: 'system',
          content:
            'You describe a user-authorized desktop screenshot. Return a concise factual summary. Do not include secrets or credentials verbatim.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Summarize the visible screen state in 3 short bullet points. Treat OCR text as sensitive and avoid full transcription.',
            },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
      maxOutputTokens: 220,
    })
    return text.trim()
  }

  private async generateReaction(
    resolved: ResolvedChain,
    session: ChatSession,
    summary: string,
    signal: AbortSignal
  ): Promise<ObservationReactionCandidate> {
    const text = await this.callProviderText({
      resolved: resolved.reaction,
      signal,
      messages: [
        {
          role: 'system',
          content:
            'You are a quiet desktop companion. Based on a sensitive screen summary, produce a short helpful reaction. Return JSON with text and optional mode.',
        },
        {
          role: 'user',
          content: `Target session: ${session.kind ?? 'chat'} / ${session.title}\nObservation summary:\n${summary}\n\nReturn {"text":"...","mode":"ambient|chat|ask|silent","reason":"..."}. Keep text under 80 Chinese characters or 30 English words.`,
        },
      ],
      maxOutputTokens: 180,
    })
    return parseCandidate(text)
  }

  private async generateSingleModelReaction(
    resolved: ResolvedChain,
    session: ChatSession,
    dataUrl: string,
    signal: AbortSignal
  ): Promise<ObservationReactionCandidate> {
    const text = await this.callProviderText({
      resolved: resolved.vision,
      signal,
      messages: [
        {
          role: 'system',
          content:
            'You are a quiet desktop companion. The user explicitly authorized a screenshot observation. Produce one short helpful reaction and avoid copying sensitive text.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Target session: ${session.kind ?? 'chat'} / ${session.title}. Return {"text":"...","mode":"ambient|chat|ask|silent","reason":"..."}. Keep text brief.`,
            },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
      maxOutputTokens: 180,
    })
    return parseCandidate(text)
  }

  private async callProviderText(input: {
    resolved: ResolvedModel
    messages: ProviderMessage[]
    signal: AbortSignal
    maxOutputTokens: number
  }): Promise<string> {
    const client: BaseProvider = await this.providers.createProviderClient(
      input.resolved.provider.id
    )
    let result = ''
    for await (const chunk of client.streamChat({
      modelId: input.resolved.model.remoteId ?? input.resolved.model.id,
      messages: input.messages,
      temperature: 0.3,
      maxOutputTokens: input.maxOutputTokens,
      abortSignal: input.signal,
    })) {
      if (chunk.type === 'delta' && chunk.content) {
        result += chunk.content
      }
    }
    if (!result.trim()) {
      throw this.observationError('provider_failed', '观察模型没有返回有效内容。', true)
    }
    return result
  }

  private gateReaction(
    run: ObservationRun,
    candidate: ObservationReactionCandidate,
    frame: ObservationCaptureMetadata
  ): ObservationReactionDecision {
    const now = Date.now()
    const text = sanitizeReactionText(candidate.text)
    let mode: ObservationOutputMode = normalizeOutputMode(candidate.mode, run.outputMode)
    if (run.outputMode === 'silent' || !text) {
      mode = 'silent'
    }
    const cooldownMs = this.options.settings().reactionCooldownMs
    if (mode !== 'silent' && run.lastReactionAt && now - run.lastReactionAt < cooldownMs) {
      mode = 'silent'
    }
    if (mode === 'chat' && run.outputMode !== 'chat' && run.outputMode !== 'ask') {
      mode = run.outputMode === 'ambient' ? 'ambient' : 'silent'
    }
    if (mode === 'ask' && run.outputMode !== 'ask') {
      mode = run.outputMode === 'chat' ? 'chat' : run.outputMode
    }
    return {
      mode,
      text: mode === 'silent' ? undefined : text,
      reason: truncate(candidate.reason, 180),
      captureId: frame.captureId,
      createdAt: now,
    }
  }

  private async dispatchDecision(
    run: ObservationRun,
    result: ObservationTickResult
  ): Promise<void> {
    const decision = result.decision
    if (decision.mode === 'silent' || !decision.text) {
      return
    }
    if (decision.mode === 'chat') {
      this.appendChatMessage(run, decision)
      return
    }
    const event: ObservationReactionEvent = {
      id: crypto.randomUUID(),
      observationRunId: run.id,
      targetSessionId: run.targetSessionId,
      targetSessionKind: run.targetSessionKind,
      surface: run.surface,
      decision: decision.mode,
      text: decision.text,
      captureId: decision.captureId,
      createdAt: decision.createdAt,
    }
    this.options.onReaction?.(event)
  }

  private appendChatMessage(run: ObservationRun, decision: ObservationReactionDecision): void {
    if (!decision.text) return
    const now = Date.now()
    const message: ChatMessage = {
      id: crypto.randomUUID(),
      sessionId: run.targetSessionId,
      role: 'assistant',
      status: 'complete',
      parts: [{ type: 'plain', text: decision.text } satisfies ChatMessagePart],
      providerId: run.reactionModelRef?.providerId ?? run.visionModelRef?.providerId,
      modelId: run.reactionModelRef?.modelId ?? run.visionModelRef?.modelId,
      metadata: {
        source: 'observation',
        observationRunId: run.id,
        captureId: decision.captureId,
        retention: run.retention,
        decision: decision.mode,
      },
      createdAt: now,
      updatedAt: now,
    }
    this.messages.save(message)
    const messages = this.messages.listBySession(run.targetSessionId)
    this.sessions.updateMessageSummary(run.targetSessionId, {
      messageCount: messages.length,
      lastMessagePreview: decision.text,
      lastMessageAt: now,
    })
  }

  private async resolveModelChain(
    session: ChatSession,
    run: ObservationRun
  ): Promise<ResolvedChain> {
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
      return this.toChain(vision, vision, 'single_multimodal')
    }
    if (reaction?.model && modelSupports(reaction.model, 'image')) {
      return this.toChain(reaction, reaction, 'single_multimodal')
    }

    const fallbackVision = await this.findVisionFallback(session)
    if (!fallbackVision) {
      throw this.observationError('no_vision_model', '需要配置支持图片输入的视觉模型。', true)
    }
    return reaction
      ? this.toChain(fallbackVision, reaction, 'split')
      : this.toChain(fallbackVision, fallbackVision, 'single_multimodal')
  }

  private async findVisionFallback(session: ChatSession): Promise<ResolvedModel | undefined> {
    const candidates: ProviderModelRef[] = []
    if (session.defaultProviderId && session.defaultModelId) {
      candidates.push({ providerId: session.defaultProviderId, modelId: session.defaultModelId })
    }
    const registry = this.providers.loadRegistry().registry
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
    reaction: ResolvedModel,
    mode: ObservationModelChain['mode']
  ): ResolvedChain {
    const chain: ObservationModelChain = {
      visionModelRef: { providerId: vision.provider.id, modelId: vision.model.id },
      reactionModelRef: { providerId: reaction.provider.id, modelId: reaction.model.id },
      mode,
      remoteVision: !isLocalProvider(vision.provider),
      remoteReaction: !isLocalProvider(reaction.provider),
    }
    return { chain, vision, reaction }
  }

  private assertRemoteRisk(run: ObservationRun, resolved: ResolvedChain): void {
    if (run.localOnly && (resolved.chain.remoteVision || resolved.chain.remoteReaction)) {
      throw this.observationError(
        'remote_provider_blocked',
        'localOnly 已开启，请切换到本地视觉和 reaction 模型。',
        true
      )
    }
    if (
      !run.allowRemoteProviders &&
      (resolved.chain.remoteVision || resolved.chain.remoteReaction)
    ) {
      throw this.observationError(
        'remote_provider_blocked',
        '当前观察设置不允许使用外部 Provider。',
        true
      )
    }
    if (resolved.chain.remoteVision && run.remoteRiskAccepted?.vision !== true) {
      throw this.observationError(
        'remote_vision_confirmation_required',
        '截图会发送给外部视觉模型，需要先确认风险。',
        true
      )
    }
    if (resolved.chain.remoteReaction && run.remoteRiskAccepted?.reaction !== true) {
      throw this.observationError(
        'remote_reaction_confirmation_required',
        '视觉摘要可能发送给外部 reaction 模型，需要先确认风险。',
        true
      )
    }
  }

  private normalizeDuration(value: number | undefined, settings: DesktopObservationSettings) {
    const duration = Number.isFinite(value) ? Math.floor(Number(value)) : settings.defaultDurationMs
    if (duration < settings.minDurationMs || duration > settings.maxDurationMs) {
      throw this.observationError(
        'invalid_request',
        `观察时长需在 ${settings.minDurationMs}ms 到 ${settings.maxDurationMs}ms 之间。`,
        true
      )
    }
    return duration
  }

  private normalizeInterval(value: number | undefined, settings: DesktopObservationSettings) {
    const interval = Number.isFinite(value) ? Math.floor(Number(value)) : settings.defaultIntervalMs
    if (interval < settings.minIntervalMs) {
      throw this.observationError(
        'invalid_request',
        `观察间隔不能低于 ${settings.minIntervalMs}ms。`,
        true
      )
    }
    return interval
  }

  private assertDailyLimit(): void {
    const date = new Date().toISOString().slice(0, 10)
    if (this.captureCountDate !== date) {
      this.captureCountDate = date
      this.captureCount = 0
    }
    const limit = this.options.settings().dailyCaptureLimit
    if (this.captureCount >= limit) {
      throw this.observationError('invalid_request', '今日主动观察截图次数已达到上限。', true)
    }
  }

  private scheduleNextTick(state: ActiveRunState, delayMs: number): void {
    if (state.timer) {
      clearTimeout(state.timer)
    }
    state.timer = setTimeout(
      () => {
        void this.executeTick(state, 'timer')
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
    const state = this.runs.get(runId)
    if (!state) return
    if (state.timer) clearTimeout(state.timer)
    if (state.expirationTimer) clearTimeout(state.expirationTimer)
    state.abortController?.abort(reason)
    const stoppedAt = Date.now()
    state.run.status = reason === 'expired' ? 'expired' : reason === 'failed' ? 'failed' : 'stopped'
    state.run.stopReason = reason
    state.run.stoppedAt = stoppedAt
    state.run.error = error ?? state.run.error
    this.runs.delete(runId)
    void this.capture.cleanupAll?.()
    this.logger?.info('Observation run stopped.', {
      runId,
      sessionId: state.run.targetSessionId,
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

  private stopBySession(
    sessionId: string,
    reason: NonNullable<StopObservationRequest['reason']>,
    emit: boolean
  ): void {
    for (const [runId, state] of this.runs.entries()) {
      if (state.run.targetSessionId === sessionId) {
        this.stopRun(runId, reason, emit)
      }
    }
  }

  private findRunState(request: TriggerObservationRequest): ActiveRunState | undefined {
    if (request.runId) {
      return this.runs.get(request.runId)
    }
    if (request.targetSessionId) {
      return [...this.runs.values()].find(
        (item) => item.run.targetSessionId === request.targetSessionId
      )
    }
    return [...this.runs.values()][0]
  }

  private requireSession(targetSessionId: string, kind?: string): ChatSession {
    const session = this.sessions.get(targetSessionId)
    if (!session || session.status === 'deleted') {
      throw this.observationError('session_not_found', '目标会话不存在。', true)
    }
    const sessionKind = session.kind ?? 'chat'
    if (sessionKind !== 'chat' && sessionKind !== 'cat') {
      throw this.observationError('invalid_request', '主动观察只能绑定 chat 或 cat 会话。', true)
    }
    if (kind && kind !== sessionKind) {
      throw this.observationError('invalid_request', '观察请求的会话类型与目标会话不一致。', true)
    }
    return session
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
      activeRuns: [...this.runs.values()].map((item) => cloneRun(item.run)),
      error,
      updatedAt: Date.now(),
    }
    this.options.onChanged?.(event)
  }

  private async snapshotState(
    permission: ObservationPermissionStatus,
    targetSessionId?: string
  ): Promise<ObservationState> {
    const activeRuns = [...this.runs.values()]
      .map((item) => item.run)
      .filter((run) => !targetSessionId || run.targetSessionId === targetSessionId)
      .map(cloneRun)
    return {
      activeRuns,
      permission,
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

function isLocalProvider(provider: ProviderRecord): boolean {
  if (provider.type === 'ollama' || provider.type === 'omniinfer') {
    return true
  }
  try {
    const url = new URL(provider.baseUrl)
    return localHostnames.has(url.hostname)
  } catch {
    return false
  }
}

function parseCandidate(raw: string): ObservationReactionCandidate {
  const json = extractJson(raw)
  if (json) {
    try {
      const parsed = JSON.parse(json) as Record<string, unknown>
      return {
        text: sanitizeReactionText(parsed.text),
        mode: isOutputMode(parsed.mode) ? parsed.mode : undefined,
        reason: typeof parsed.reason === 'string' ? parsed.reason : undefined,
      }
    } catch {
      // Fall through to plain text.
    }
  }
  return { text: sanitizeReactionText(raw) }
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

function normalizeOutputMode(
  value: ObservationOutputMode | undefined,
  fallback: ObservationOutputMode
): ObservationOutputMode {
  return isOutputMode(value) ? value : fallback
}

function normalizeRetention(
  value: ObservationRetention | undefined,
  fallback: ObservationRetention
): ObservationRetention {
  return value === 'ephemeral' || value === 'save_to_chat' ? value : fallback
}

function isOutputMode(value: unknown): value is ObservationOutputMode {
  return value === 'silent' || value === 'ambient' || value === 'chat' || value === 'ask'
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

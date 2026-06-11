import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

import { ChatSessionKindMismatchError } from '../../core/chat/chat-service'
import type { ChatRunEventTarget } from '../../core/chat/run-manager'
import {
  createDefaultSessionRecord,
  createVisionSessionRecord,
} from '../../core/chat/session-defaults'
import {
  type DesktopCaptureAdapter,
  ObservationManager,
  ObservationRuntimeError,
} from '../../core/observation'
import { OBSERVATION_PROMPTS } from '../../core/prompts'
import { cloneDefaultProviderRegistry } from '../../core/provider/registry-schema'
import type { ChatMessage, ChatMessagePart, ChatSession } from '../../shared/types/chat'
import type {
  ObservationCapturedFrame,
  ObservationPermissionStatus,
  ObservationReactionEvent,
} from '../../shared/types/observation'
import type { ProviderConfig, ProviderRegistry } from '../../shared/types/provider'
import type { DesktopObservationSettings } from '../../shared/types/settings'

const tempDir = mkdtempSync(join(tmpdir(), 'openomniclaw-observation-smoke-'))

const providerRecords: ProviderConfig[] = [
  {
    id: 'local-vision',
    name: 'Local Vision',
    type: 'ollama',
    api: 'openai-chat-completions',
    baseUrl: 'http://localhost:11434/v1',
    enabled: true,
    models: [
      {
        id: 'vision',
        providerId: 'local-vision',
        name: 'Vision',
        enabled: true,
        input: ['text', 'image'],
      },
    ],
  },
  {
    id: 'local-text',
    name: 'Local Text',
    type: 'ollama',
    api: 'openai-chat-completions',
    baseUrl: 'http://localhost:11434/v1',
    enabled: true,
    models: [
      {
        id: 'reaction',
        providerId: 'local-text',
        name: 'Reaction',
        enabled: true,
        input: ['text'],
      },
    ],
  },
  {
    id: 'remote-vision',
    name: 'Remote Vision',
    type: 'openai-compatible',
    api: 'openai-chat-completions',
    baseUrl: 'https://api.example.test/v1',
    enabled: true,
    models: [
      {
        id: 'vision',
        providerId: 'remote-vision',
        name: 'Remote Vision',
        enabled: true,
        input: ['text', 'image'],
      },
    ],
  },
]

const baseSettings: DesktopObservationSettings = {
  evaluationIntervalMs: 25,
  captureProbability: 0,
  reactionNudgeAfterSilentCaptures: 3,
  reactionNudgeProbability: 0.35,
  minCaptureIntervalMs: 5_000,
  defaultScope: 'primary_display',
  screenshotRetention: 'ephemeral',
  allowRemoteProviders: false,
  localOnly: true,
  dailyCaptureLimit: 20,
  consecutiveFailureLimit: 2,
  notificationCooldownMs: 1_000,
}

let permission: ObservationPermissionStatus = {
  platform: 'smoke',
  screen: 'granted',
  canPrompt: false,
}

const sessions = createMemorySessionRepo()
const messages = createMemoryMessageRepo()
const eventTarget = createMemoryEventTarget()
const chatService = createFakeChatService(sessions, messages, eventTarget)

let settings = { ...baseSettings }
let registry = registryWithRefs()
let captureCount = 0
let cleanupCount = 0
let permissionProbeCount = 0
let captureShouldFail = false
let changedCount = 0
const reactions: ObservationReactionEvent[] = []

const capture: DesktopCaptureAdapter = {
  permissionStatus: () => permission,
  probeScreenPermission: () => {
    permissionProbeCount += 1
    return permission
  },
  capture: async (request): Promise<ObservationCapturedFrame> => {
    if (captureShouldFail) {
      throw new Error('capture unavailable')
    }
    captureCount += 1
    return {
      captureId: `capture-${captureCount}`,
      scope: request.scope,
      sourceId: request.sourceId,
      sourceType: 'screen',
      mimeType: 'image/png',
      width: 2,
      height: 2,
      createdAt: Date.now(),
      retention: 'ephemeral',
      dataUrl:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mP8z8AARQAFAAH7AhnwAAAAAElFTkSuQmCC',
    }
  },
  cleanupCapture: () => {
    cleanupCount += 1
  },
  cleanupAll: () => {
    cleanupCount += 1
  },
}

const manager = new ObservationManager({
  capture,
  settings: () => settings,
  providers: {
    loadRegistry: () => ({
      registry,
      status: {
        path: '',
        backupPath: '',
        exists: true,
        backupExists: false,
        loaded: true,
        recoverable: false,
      },
    }),
    get: async (providerId: string) =>
      providerRecords.find((provider) => provider.id === providerId),
  } as never,
  chatService: () => chatService as never,
  eventTarget: () => eventTarget,
  resolveCatSessionId: () => 'cat-session-smoke',
  onChanged: () => {
    changedCount += 1
  },
  onReaction: (event) => {
    reactions.push(event)
  },
  devMode: true,
  random: () => 0.99,
})

try {
  permission = {
    platform: 'darwin',
    screen: 'not-determined',
    canPrompt: false,
    message: 'macOS 需要在系统设置中为 OpenOmniClaw 开启屏幕录制权限。',
  }
  capture.probeScreenPermission = () => {
    permissionProbeCount += 1
    permission = {
      platform: 'darwin',
      screen: 'granted',
      canPrompt: false,
    }
    return permission
  }
  await manager.start()
  assert.equal(permissionProbeCount, 1)
  assert.equal((await manager.status()).runtime.active, true)
  assert.equal(captureCount, 0)
  await manager.stop()
  permission = {
    platform: 'darwin',
    screen: 'denied',
    canPrompt: false,
    message: 'macOS 需要在系统设置中开启屏幕录制权限。',
  }
  capture.probeScreenPermission = () => {
    permissionProbeCount += 1
    return permission
  }
  await assert.rejects(
    () => manager.start(),
    (error) =>
      error instanceof ObservationRuntimeError && error.details.code === 'permission_denied'
  )
  assert.equal(permissionProbeCount, 2)
  assert.equal(captureCount, 0)
  permission = {
    platform: 'smoke',
    screen: 'granted',
    canPrompt: false,
  }
  capture.probeScreenPermission = () => {
    permissionProbeCount += 1
    return permission
  }

  await assert.rejects(
    () =>
      manager.start({
        targetSessionId: 'legacy-session',
        targetSessionKind: 'chat',
      } as never),
    (error) => error instanceof ObservationRuntimeError && error.details.code === 'invalid_request'
  )

  await manager.start()
  const started = await manager.status()
  const visionSessionId = started.runtime.visionSessionId
  assert.ok(visionSessionId)
  assert.equal(started.runtime.active, true)
  assert.equal(started.activeRuns[0]?.visionSessionId, visionSessionId)
  assert.equal(sessions.get(visionSessionId)?.kind, 'vision')

  await delay(80)
  assert.equal(captureCount, 0)
  assert.equal((await manager.status()).activeRuns[0]?.rule.skippedReason, 'probability_miss')

  await manager.trigger({ visionSessionId })
  await waitFor(() => messages.listBySession(visionSessionId).length === 4)
  assert.equal(captureCount, 1)
  assert.equal(chatService.calls.length, 2)
  assert.equal(chatService.calls[0]?.providerId, 'local-vision')
  assert.equal(chatService.calls[0]?.transientImageInputs?.length, 1)
  assert.equal(chatService.calls[0]?.parts[0]?.type, 'vision_capture')
  assert.equal(
    chatService.calls[0]?.transientCurrentMessageParts?.[0]?.text,
    OBSERVATION_PROMPTS.visionSummaryUser
  )
  assert.equal(
    (chatService.calls[0]?.transientSystemInstructions?.[0] as { refId?: string } | undefined)
      ?.refId,
    'persona-active'
  )
  assert.equal(
    (chatService.calls[0]?.transientSystemInstructions?.[1] as { text?: string } | undefined)?.text,
    OBSERVATION_PROMPTS.visionSummarySystem
  )
  assert.equal(chatService.calls[1]?.providerId, 'local-text')
  assert.equal(chatService.calls[1]?.transientImageInputs, undefined)
  assert.equal(messages.listBySession(visionSessionId)[0]?.parts[0]?.type, 'vision_capture')
  assert.equal(
    messages.listBySession(visionSessionId)[2]?.parts[0]?.text,
    '[主动视觉 reaction 决策]'
  )
  assert.equal(
    JSON.stringify(messages.listBySession(visionSessionId)).includes(
      OBSERVATION_PROMPTS.visionSummaryUser
    ),
    false
  )
  assert.equal(
    JSON.stringify(messages.listBySession(visionSessionId)).includes(
      'Use the active persona voice.'
    ),
    false
  )
  assert.equal(reactions.length, 1)
  assert.equal(reactions[0]?.catSessionId, 'cat-session-smoke')
  assert.equal(reactions[0]?.visionSessionId, visionSessionId)
  assert.equal(reactions[0]?.decision, 'notify')

  await assert.rejects(
    () => manager.trigger({ visionSessionId }),
    (error) =>
      error instanceof ObservationRuntimeError && error.details.code === 'min_capture_interval'
  )

  const toolResult = await manager.captureForTool(visionSessionId)
  assert.equal(toolResult.ok, true)
  assert.equal(toolResult.retention, 'ephemeral')
  await assert.rejects(
    () => manager.captureForTool('ordinary-chat-session'),
    (error) => error instanceof ObservationRuntimeError && error.details.code === 'run_not_found'
  )

  await manager.stop({ visionSessionId })
  assert.equal((await manager.status()).runtime.active, false)
  assert.ok(cleanupCount > 0)

  settings = {
    ...baseSettings,
    captureProbability: 1,
    minCaptureIntervalMs: 0,
    notificationCooldownMs: 60_000,
  }
  chatService.reset('{"decision":"ask","text":"Need your attention.","summary":"attention"}')
  await manager.start({ visionSessionId })
  await manager.trigger({ visionSessionId })
  await waitFor(() => messages.listBySession(visionSessionId).length >= 8)
  assert.equal(reactions.length, 2)
  await manager.trigger({ visionSessionId })
  await waitFor(() => messages.listBySession(visionSessionId).length >= 12)
  assert.equal(reactions.length, 2)
  const cooldownRun = (await manager.status(visionSessionId)).activeRuns[0]
  assert.equal(cooldownRun?.lastDecision?.notificationSuppressed, true)
  assert.equal(cooldownRun?.lastDecision?.suppressionReason, 'cooldown')
  await manager.stop({ visionSessionId })

  settings = {
    ...baseSettings,
    captureProbability: 1,
    minCaptureIntervalMs: 0,
    reactionNudgeAfterSilentCaptures: 2,
    reactionNudgeProbability: 1,
    notificationCooldownMs: 0,
  }
  chatService.reset('{"mode":"silent","text":"","reason":"not useful"}')
  await manager.start({ visionSessionId })
  await manager.trigger({ visionSessionId })
  await manager.trigger({ visionSessionId })
  await manager.trigger({ visionSessionId })
  const thirdReactionPrompt = chatService.calls[5]?.transientCurrentMessageParts?.[0]
  assert.equal(thirdReactionPrompt?.type, 'plain')
  assert.match((thirdReactionPrompt as { text?: string }).text ?? '', /本次倾向：已启用/)
  assert.equal(reactions.length, 2)
  await manager.stop({ visionSessionId })

  settings = {
    ...baseSettings,
    captureProbability: 1,
    minCaptureIntervalMs: 0,
    notificationCooldownMs: 60_000,
  }
  chatService.reset('{"mode":"ambient","text":"Dev bubble test.","reason":"dev"}')
  await manager.start({ visionSessionId })
  await manager.trigger({ visionSessionId, devForceReaction: true })
  const devReactionPrompt = chatService.calls[1]?.transientCurrentMessageParts?.[0]
  assert.equal(devReactionPrompt?.type, 'plain')
  assert.match((devReactionPrompt as { text?: string }).text ?? '', /开发验证已启用/)
  assert.equal(reactions.length, 3)
  await manager.trigger({ visionSessionId, devForceReaction: true })
  assert.equal(reactions.length, 4)
  const devRun = (await manager.status(visionSessionId)).activeRuns[0]
  assert.equal(devRun?.lastDecision?.notificationSuppressed, false)
  await manager.stop({ visionSessionId })

  settings = { ...baseSettings, captureProbability: 1, minCaptureIntervalMs: 5_000 }
  captureShouldFail = true
  await manager.start({ visionSessionId })
  await assert.rejects(
    () => manager.trigger({ visionSessionId }),
    (error) => error instanceof ObservationRuntimeError && error.details.code === 'capture_failed'
  )
  await assert.rejects(
    () => manager.trigger({ visionSessionId }),
    (error) => error instanceof ObservationRuntimeError && error.details.code === 'capture_failed'
  )
  assert.equal((await manager.status()).runtime.status, 'failed')
  captureShouldFail = false

  registry = registryWithRefs({ visionProviderId: 'remote-vision' })
  settings = {
    ...baseSettings,
    captureProbability: 1,
    allowRemoteProviders: false,
    localOnly: true,
  }
  const beforeRemotePolicyCaptureCount = captureCount
  await assert.rejects(
    () => manager.start({ visionSessionId }),
    (error) => error instanceof ObservationRuntimeError && error.details.code === 'privacy_policy'
  )
  assert.equal(captureCount, beforeRemotePolicyCaptureCount)

  registry = registryWithRefs({ reactionProviderId: undefined })
  settings = {
    ...baseSettings,
    captureProbability: 1,
    allowRemoteProviders: true,
    localOnly: false,
  }
  const singleState = await manager.start({ visionSessionId })
  assert.equal(singleState.activeRuns[0]?.modelChainMode, 'single_multimodal')
  await manager.stop({ visionSessionId })

  const restarted = new ObservationManager({
    capture,
    settings: () => settings,
    providers: {
      loadRegistry: () => ({
        registry,
        status: {
          path: '',
          backupPath: '',
          exists: true,
          backupExists: false,
          loaded: true,
          recoverable: false,
        },
      }),
      get: async (providerId: string) =>
        providerRecords.find((provider) => provider.id === providerId),
    } as never,
    chatService: () => chatService as never,
    eventTarget: () => eventTarget,
    resolveCatSessionId: () => 'cat-session-smoke',
  })
  assert.equal((await restarted.status(visionSessionId)).runtime.active, false)
  restarted.dispose('app_exit')

  assert.ok(changedCount > 0)
  console.log('Observation manager smoke check passed')
} finally {
  manager.dispose('app_exit')
  rmSync(tempDir, { recursive: true, force: true })
}

function registryWithRefs(
  input: { visionProviderId?: string; reactionProviderId?: string } = {}
): ProviderRegistry {
  const visionProviderId = input.visionProviderId ?? 'local-vision'
  const reactionProviderId = 'reactionProviderId' in input ? input.reactionProviderId : 'local-text'
  return {
    ...cloneDefaultProviderRegistry(),
    sources: providerRecords.map((provider) => ({
      id: provider.id,
      name: provider.name,
      type: provider.type,
      api: provider.api,
      baseUrl: provider.baseUrl,
      enabled: provider.enabled,
      createdAt: 1,
      updatedAt: 1,
    })),
    models: providerRecords.flatMap((provider) =>
      (provider.models ?? []).map((model) => ({
        id: model.id,
        providerId: provider.id,
        name: model.name,
        enabled: model.enabled !== false,
        input: model.input,
        createdAt: 1,
        updatedAt: 1,
      }))
    ),
    settings: {
      fallbackModelRefs: [],
      streaming: true,
      observationVisionModelRef: {
        providerId: visionProviderId,
        modelId: 'vision',
      },
      observationReactionModelRef: reactionProviderId
        ? {
            providerId: reactionProviderId,
            modelId: reactionProviderId === 'local-text' ? 'reaction' : 'vision',
          }
        : undefined,
    },
  }
}

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const startedAt = Date.now()
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('Timed out waiting for observation smoke condition.')
    }
    await delay(10)
  }
}

function createFakeChatService(
  sessions: ReturnType<typeof createMemorySessionRepo>,
  messages: ReturnType<typeof createMemoryMessageRepo>,
  eventTarget: ReturnType<typeof createMemoryEventTarget>
) {
  let responseText =
    '{"decision":"notify","text":"Observation reaction.","summary":"screen summary"}'
  const calls: Array<{
    providerId?: string
    modelId?: string
    parts: ChatMessagePart[]
    transientSystemInstructions?: unknown[]
    transientCurrentMessageParts?: ChatMessagePart[]
    transientImageInputs?: unknown[]
  }> = []

  function responseFor(providerId: string | undefined): string {
    if (providerId === 'local-vision') {
      return 'screen summary'
    }
    return responseText
  }

  return {
    calls,
    buildDefaultSystemContext: () => ({
      persona: {
        refId: 'persona-active',
        label: 'Active Persona',
        text: 'Use the active persona voice.',
      },
    }),
    reset(nextResponseText: string): void {
      responseText = nextResponseText
      calls.length = 0
      eventTarget.events.length = 0
    },
    async getOrCreateSession(request: {
      kind: 'cat' | 'vision'
      preferredId?: string | null
      preferredIds?: Array<string | null | undefined>
      preferredMismatch?: 'throw' | 'ignore'
    }): Promise<ChatSession> {
      const preferredIds = normalizePreferredSessionIds(request.preferredId, request.preferredIds)
      for (const requestedId of preferredIds) {
        const preferred = sessions.get(requestedId)
        if (preferred && preferred.status !== 'deleted' && preferred.kind === request.kind) {
          return preferred
        }
        if (preferred && preferred.kind !== request.kind) {
          if (request.preferredMismatch !== 'ignore') {
            throw new ChatSessionKindMismatchError(
              requestedId,
              request.kind,
              preferred.kind ?? 'chat'
            )
          }
        }
      }

      const existing = sessions
        .list({ kind: request.kind })
        .find((session) => session.status === 'active')
      if (existing) {
        return existing
      }

      const session =
        request.kind === 'vision'
          ? createVisionSessionRecord()
          : createDefaultSessionRecord({ kind: 'cat' })
      sessions.save(session)
      return sessions.get(session.id) ?? session
    },
    async sendInternalMessage(
      request: {
        sessionId: string
        parts?: ChatMessagePart[]
        providerId?: string
        modelId?: string
        transientImageInputs?: unknown[]
        transientSystemInstructions?: unknown[]
        transientCurrentMessageParts?: ChatMessagePart[]
        metadata?: Record<string, unknown>
      },
      target: ChatRunEventTarget
    ) {
      const now = Date.now()
      const runId = crypto.randomUUID()
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        sessionId: request.sessionId,
        role: 'user',
        status: 'complete',
        parts: request.parts ?? [],
        metadata: request.metadata,
        createdAt: now,
        updatedAt: now,
      }
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        sessionId: request.sessionId,
        role: 'assistant',
        status: 'complete',
        parts: [{ type: 'plain', text: responseFor(request.providerId) }],
        runId,
        providerId: request.providerId,
        modelId: request.modelId,
        createdAt: now + 1,
        updatedAt: now + 1,
      }
      calls.push({
        providerId: request.providerId,
        modelId: request.modelId,
        parts: userMessage.parts,
        transientSystemInstructions: request.transientSystemInstructions,
        transientCurrentMessageParts: request.transientCurrentMessageParts,
        transientImageInputs: request.transientImageInputs,
      })
      messages.save(userMessage)
      messages.save(assistantMessage)
      target.send('chat:stream-event', {
        type: 'started',
        runId,
        sessionId: request.sessionId,
        assistantMessageId: assistantMessage.id,
        seq: 1,
      })
      target.send('chat:stream-event', {
        type: 'final',
        runId,
        sessionId: request.sessionId,
        assistantMessageId: assistantMessage.id,
        seq: 2,
        message: assistantMessage,
      })
      return {
        runId,
        userMessageId: userMessage.id,
        assistantMessageId: assistantMessage.id,
        accepted: true,
        terminalEvent: Promise.resolve({
          type: 'final' as const,
          runId,
          sessionId: request.sessionId,
          assistantMessageId: assistantMessage.id,
          seq: 2,
          message: assistantMessage,
        }),
      }
    },
  }
}

function normalizePreferredSessionIds(
  preferredId?: string | null,
  preferredIds: Array<string | null | undefined> = []
): string[] {
  const seen = new Set<string>()
  const normalized: string[] = []
  for (const value of [preferredId, ...preferredIds]) {
    const id = value?.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    normalized.push(id)
  }
  return normalized
}

function createMemorySessionRepo() {
  const sessions = new Map<string, ChatSession>()

  return {
    get(id: string): ChatSession | undefined {
      const session = sessions.get(id)
      return session ? structuredClone(session) : undefined
    },
    save(session: ChatSession): void {
      sessions.set(session.id, structuredClone(session))
    },
    list(options: { kind?: string; includeDeleted?: boolean } = {}): ChatSession[] {
      return [...sessions.values()]
        .filter((session) => options.includeDeleted || session.status !== 'deleted')
        .filter(
          (session) => !options.kind || options.kind === 'all' || session.kind === options.kind
        )
        .map((session) => structuredClone(session))
    },
  }
}

function createMemoryMessageRepo() {
  const messages: ChatMessage[] = []

  return {
    save(message: ChatMessage): void {
      messages.push(structuredClone(message))
    },
    listBySession(sessionId: string): ChatMessage[] {
      return messages
        .filter((message) => message.sessionId === sessionId && message.status !== 'deleted')
        .map((message) => structuredClone(message))
    },
  }
}

function createMemoryEventTarget(): ChatRunEventTarget & {
  events: Array<{ channel: string; event: unknown }>
} {
  return {
    events: [],
    send(channel: string, event: unknown): void {
      this.events.push({ channel, event })
    },
  }
}

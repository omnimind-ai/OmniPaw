import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
import type { DesktopCaptureAdapter } from '../core/observation'
import { ObservationManager, ObservationRuntimeError } from '../core/observation'
import type { ChatMessage, ChatSession } from '../shared/types/chat'
import type {
  ObservationCapturedFrame,
  ObservationPermissionStatus,
} from '../shared/types/observation'
import type { ProviderRegistrySettings } from '../shared/types/provider'
import type { DesktopObservationSettings } from '../shared/types/settings'

const baseSettings: DesktopObservationSettings = {
  enabled: true,
  defaultIntervalMs: 10 * 60_000,
  defaultDurationMs: 60_000,
  defaultScope: 'primary_display',
  outputMode: 'chat',
  retention: 'ephemeral',
  allowRemoteProviders: false,
  localOnly: true,
  minIntervalMs: 1_000,
  minDurationMs: 1_000,
  maxDurationMs: 10 * 60_000,
  dailyCaptureLimit: 20,
  consecutiveFailureLimit: 2,
  reactionCooldownMs: 0,
}

const session: ChatSession = {
  id: 'session-chat',
  title: 'Smoke chat',
  kind: 'chat',
  status: 'active',
  defaultProviderId: 'local-vision',
  defaultModelId: 'vision',
  messageCount: 0,
  createdAt: Date.now(),
  updatedAt: Date.now(),
}

const permission: ObservationPermissionStatus = {
  platform: 'smoke',
  screen: 'granted',
  canPrompt: false,
}

const messages: ChatMessage[] = []
let captureCount = 0
let cleanupCount = 0
let changedCount = 0
let reactionCount = 0
let settings = { ...baseSettings }

const capture: DesktopCaptureAdapter = {
  permissionStatus: () => permission,
  capture: (): ObservationCapturedFrame => {
    captureCount += 1
    return {
      captureId: `capture-${captureCount}`,
      scope: 'primary_display',
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

const sessionRepo = {
  get: (id: string) => (id === session.id ? session : undefined),
  updateMessageSummary: (
    _id: string,
    summary: Pick<ChatSession, 'messageCount' | 'lastMessagePreview' | 'lastMessageAt'>
  ) => {
    session.messageCount = summary.messageCount
    session.lastMessagePreview = summary.lastMessagePreview
    session.lastMessageAt = summary.lastMessageAt
    return true
  },
}

const messageRepo = {
  save: (message: ChatMessage) => {
    messages.push(message)
  },
  listBySession: (sessionId: string) =>
    messages.filter((message) => message.sessionId === sessionId),
}

const providerRecords = {
  'local-vision': {
    id: 'local-vision',
    name: 'Local Vision',
    type: 'ollama',
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
  'local-text': {
    id: 'local-text',
    name: 'Local Text',
    type: 'ollama',
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
  remote: {
    id: 'remote',
    name: 'Remote',
    type: 'openai-compatible',
    baseUrl: 'https://api.example.test/v1',
    enabled: true,
    models: [
      {
        id: 'vision',
        providerId: 'remote',
        name: 'Remote Vision',
        enabled: true,
        input: ['text', 'image'],
      },
    ],
  },
}

let registrySettings: ProviderRegistrySettings = {
  fallbackModelRefs: [],
  streaming: true,
  observationVisionModelRef: { providerId: 'local-vision', modelId: 'vision' },
  observationReactionModelRef: { providerId: 'local-text', modelId: 'reaction' },
}

const providerManager = {
  loadRegistry: () => ({
    registry: {
      version: 1,
      sources: Object.values(providerRecords),
      models: Object.values(providerRecords).flatMap((provider) => provider.models),
      settings: registrySettings,
    },
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
    providerRecords[providerId as keyof typeof providerRecords] ?? null,
  createProviderClient: async (providerId: string) => ({
    id: providerId,
    async *streamChat() {
      if (providerId === 'local-text') {
        yield {
          type: 'delta' as const,
          content: '{"text":"观察到当前屏幕可继续处理。","mode":"chat","reason":"smoke"}',
          done: false as const,
        }
      } else {
        yield {
          type: 'delta' as const,
          content: 'screen summary',
          done: false as const,
        }
      }
      yield { type: 'final' as const, done: true as const }
    },
  }),
}

const manager = new ObservationManager({
  capture,
  settings: () => settings,
  providers: providerManager as never,
  sessions: sessionRepo as never,
  messages: messageRepo as never,
  onChanged: () => {
    changedCount += 1
  },
  onReaction: () => {
    reactionCount += 1
  },
})

try {
  await assert.rejects(
    () => manager.captureForTool(session.id),
    (error) => error instanceof ObservationRuntimeError && error.details.code === 'run_not_found'
  )

  await manager.start({
    targetSessionId: session.id,
    targetSessionKind: 'chat',
    surface: 'chat',
    outputMode: 'chat',
    durationMs: 60_000,
    intervalMs: 10 * 60_000,
  })
  await waitFor(() => messages.length === 1)
  assert.equal(messages[0]?.metadata?.source, 'observation')
  assert.equal(messages[0]?.metadata?.captureId, 'capture-1')
  assert.equal(reactionCount, 0)
  assert.ok(changedCount >= 1)

  await manager.trigger({ targetSessionId: session.id })
  await waitFor(() => messages.length === 2)
  assert.equal(session.messageCount, 2)

  const toolResult = await manager.captureForTool(session.id)
  assert.equal(toolResult.ok, true)
  assert.equal(toolResult.mimeType, 'image/png')
  assert.equal('dataUrl' in toolResult, false)

  await manager.stop({ targetSessionId: session.id })
  assert.equal((await manager.status()).activeRuns.length, 0)
  assert.ok(cleanupCount > 0)

  registrySettings = {
    fallbackModelRefs: [],
    streaming: true,
    observationVisionModelRef: { providerId: 'remote', modelId: 'vision' },
    observationReactionModelRef: undefined,
  }
  settings = { ...baseSettings, localOnly: false, allowRemoteProviders: true }
  const remoteSingleState = await manager.start({
    targetSessionId: session.id,
    targetSessionKind: 'chat',
    durationMs: 60_000,
    intervalMs: 10 * 60_000,
    remoteRiskAccepted: { vision: true },
  })
  assert.equal(remoteSingleState.activeRuns[0]?.modelChainMode, 'single_multimodal')
  await manager.stop({ targetSessionId: session.id })

  registrySettings = {
    fallbackModelRefs: [],
    streaming: true,
    observationVisionModelRef: { providerId: 'remote', modelId: 'vision' },
    observationReactionModelRef: { providerId: 'remote', modelId: 'vision' },
  }
  settings = { ...baseSettings, localOnly: false, allowRemoteProviders: true }
  await assert.rejects(
    () =>
      manager.start({
        targetSessionId: session.id,
        targetSessionKind: 'chat',
        durationMs: 60_000,
        intervalMs: 10 * 60_000,
        remoteRiskAccepted: { vision: true },
      }),
    (error) =>
      error instanceof ObservationRuntimeError &&
      error.details.code === 'remote_reaction_confirmation_required'
  )

  registrySettings = {
    fallbackModelRefs: [],
    streaming: true,
    observationVisionModelRef: { providerId: 'remote', modelId: 'vision' },
    observationReactionModelRef: undefined,
  }
  settings = { ...baseSettings, localOnly: true, allowRemoteProviders: false }
  await assert.rejects(
    () =>
      manager.start({
        targetSessionId: session.id,
        targetSessionKind: 'chat',
        durationMs: 60_000,
        intervalMs: 10 * 60_000,
      }),
    (error) =>
      error instanceof ObservationRuntimeError && error.details.code === 'remote_provider_blocked'
  )

  registrySettings = {
    fallbackModelRefs: [],
    streaming: true,
    observationVisionModelRef: undefined,
    observationReactionModelRef: { providerId: 'local-text', modelId: 'reaction' },
  }
  settings = { ...baseSettings, localOnly: true, allowRemoteProviders: false }
  session.defaultProviderId = 'local-text'
  session.defaultModelId = 'reaction'
  providerRecords['local-vision'].models[0]!.input = ['text']
  providerRecords.remote.models[0]!.input = ['text']
  await assert.rejects(
    () =>
      manager.start({
        targetSessionId: session.id,
        targetSessionKind: 'chat',
        durationMs: 60_000,
        intervalMs: 10 * 60_000,
      }),
    (error) => error instanceof ObservationRuntimeError && error.details.code === 'no_vision_model'
  )

  settings = { ...baseSettings, enabled: false }
  await assert.rejects(
    () =>
      manager.start({
        targetSessionId: session.id,
        targetSessionKind: 'chat',
      }),
    (error) => error instanceof ObservationRuntimeError && error.details.code === 'disabled'
  )

  console.log('Observation manager smoke check passed')
} finally {
  manager.dispose('app_exit')
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

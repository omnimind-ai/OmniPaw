import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { AttachmentService } from '../core/chat/attachment-service'
import { ChatService } from '../core/chat/chat-service'
import { ContextBuilder } from '../core/chat/context-manager'
import { RunManager } from '../core/chat/run-manager'
import { DatabaseClient, type DatabaseConnection } from '../core/db/client'
import {
  AttachmentRepo,
  ChatContextSummaryRepo,
  ChatMessageRepo,
  ChatRunRepo,
  ChatSessionRepo,
} from '../core/db/repos'
import { seedDefaultChatData } from '../core/db/seed'
import { PersonaManager } from '../core/persona/manager'
import { PersonaRegistryStore } from '../core/persona/registry-store'
import { TavernContextService } from '../core/tavern/context-service'
import { TavernManager } from '../core/tavern/manager'
import { TavernRegistryValidationError } from '../core/tavern/registry-schema'
import { TavernRegistryStore } from '../core/tavern/registry-store'
import { IPC_CHANNELS } from '../shared/constants'
import type { ChatMessage, ChatSession } from '../shared/types/chat'
import type { ProviderConfig, ProviderModel } from '../shared/types/provider'

const tempDir = mkdtempSync(join(tmpdir(), 'openomniclaw-tavern-smoke-'))
const client = new DatabaseClient({ path: join(tempDir, 'smoke.sqlite3') })

const characterJson = JSON.stringify({
  spec: 'chara_card_v2',
  data: {
    name: 'Aria',
    description: '{{char}} is an archivist.',
    personality: 'Curious and careful with {{user}}.',
    scenario: 'A quiet archive below the city.',
    first_mes: 'Welcome, {{user}}.',
    alternate_greetings: ['The stacks are open, {{user}}.'],
    mes_example: '<START>{{user}}: Hello\n{{char}}: Welcome to the archive.',
    system_prompt: 'Stay in character.',
    post_history_instructions: 'Keep responses concise.',
    character_book: {
      name: 'Aria book',
      entries: [
        {
          keys: ['Moon Gate'],
          content: 'The Moon Gate opens only at midnight.',
          priority: 4,
          insertion_order: 1,
        },
        {
          keys: ['never'],
          content: 'Disabled text must not appear.',
          enabled: false,
          priority: 99,
        },
        {
          keys: [],
          content: 'The archive smells like rain.',
          constant: true,
          priority: 2,
        },
      ],
    },
  },
})

try {
  const db = client.connect()
  seedDefaultChatData(db)

  const attachmentRepo = new AttachmentRepo(db)
  const attachments = new AttachmentService({
    repo: attachmentRepo,
    rootDir: join(tempDir, 'attachments'),
  })
  const sessionRepo = new ChatSessionRepo(db)
  const messageRepo = new ChatMessageRepo(db)
  const runRepo = new ChatRunRepo(db)
  const contextSummaryRepo = new ChatContextSummaryRepo(db)
  const runManager = new RunManager(runRepo)

  const personaManager = new PersonaManager({
    registryStore: new PersonaRegistryStore({ dataRootPath: tempDir }),
  })
  const tavernStore = new TavernRegistryStore({ dataRootPath: tempDir })
  const tavernManager = new TavernManager({
    registryStore: tavernStore,
    personaManager,
  })

  const initial = tavernStore.load()
  assert.equal(initial.version, 2)
  assert.equal(initial.characters.length, 0)
  assert.equal(initial.lorebooks.length, 0)
  assert.equal(initial.promptPresets.length, 0)
  assert.equal(initial.userProfiles.length, 0)
  assert.equal(existsSync(tavernStore.registryPath), true)

  assert.throws(
    () => tavernManager.importCharacter({ content: '{not-json' }),
    TavernRegistryValidationError
  )
  writeFileSync(
    tavernStore.registryPath,
    JSON.stringify({ version: 99, characters: [], lorebooks: [], updatedAt: 0 }),
    'utf8'
  )
  const brokenStore = new TavernRegistryStore({ dataRootPath: tempDir })
  assert.throws(() => brokenStore.load(), TavernRegistryValidationError)
  assert.equal(readFileSync(tavernStore.registryPath, 'utf8').includes('"version":99'), true)
  tavernStore.save(initial)

  const imported = tavernManager.importCharacter({
    content: characterJson,
    sourceName: 'aria.json',
  })
  assert.equal(imported.registry.characters.length, 1)
  assert.equal(imported.registry.lorebooks.length, 1)
  assert.equal(imported.character.alternateGreetings.length, 1)
  assert.equal(imported.character.messageExamples.length, 1)
  assert.equal(imported.character.systemPrompt, 'Stay in character.')
  assert.equal(imported.character.postHistoryInstructions, 'Keep responses concise.')
  assert.equal(imported.character.defaultLorebookIds.length, 1)

  const pngImported = tavernManager.importCharacter({
    dataBase64: pngCharacterCard(characterJson).toString('base64'),
    sourceKind: 'png',
    mimeType: 'image/png',
    sourceName: 'aria.png',
  })
  assert.equal(pngImported.character.source?.kind, 'sillytavern-png')
  assert.equal(pngImported.character.source?.sourceName, 'aria.png')
  assert.equal(
    JSON.stringify(pngImported.registry).includes(
      pngCharacterCard(characterJson).toString('base64')
    ),
    false
  )

  const webpImported = tavernManager.importCharacter({
    dataBase64: webpCharacterCard(characterJson).toString('base64'),
    sourceKind: 'webp',
    mimeType: 'image/webp',
    sourceName: 'aria.webp',
  })
  assert.equal(webpImported.character.source?.kind, 'sillytavern-webp')

  const beforeInvalidImportCount = tavernManager.list().registry.characters.length
  assert.throws(
    () =>
      tavernManager.importCharacter({
        dataBase64: pngCharacterCard('{}', 'other').toString('base64'),
        sourceKind: 'png',
        mimeType: 'image/png',
        sourceName: 'empty.png',
      }),
    TavernRegistryValidationError
  )
  assert.equal(tavernManager.list().registry.characters.length, beforeInvalidImportCount)

  const preset = tavernManager.createPromptPreset({
    preset: {
      name: 'Roleplay preset',
      slots: [
        {
          placement: 'main',
          text: 'Main prompt for {{char}} and {{user}}. Persona: {{persona}}.',
          order: 0,
        },
        {
          placement: 'final',
          text: 'Final prompt for {{char}} near the latest turn.',
          order: 1,
        },
        {
          placement: 'main',
          text: '',
          enabled: false,
          order: 2,
        },
      ],
    },
  }).promptPreset
  assert.ok(preset)
  assert.equal(preset.slots.length, 3)
  assert.equal(preset.slots[1]?.placement, 'final')
  assert.equal(preset.slots[2]?.enabled, false)

  const temporaryPreset = tavernManager.createPromptPreset({
    preset: {
      name: 'Temporary preset',
      slots: [{ placement: 'main', text: 'Temporary', order: 0 }],
    },
  }).promptPreset
  assert.ok(temporaryPreset)
  tavernManager.setPromptPresetEnabled({ id: temporaryPreset.id, enabled: false })
  assert.equal(tavernManager.getPromptPreset(temporaryPreset.id)?.enabled, false)
  tavernManager.deletePromptPreset(temporaryPreset.id)
  assert.equal(tavernManager.getPromptPreset(temporaryPreset.id), undefined)

  const persona = personaManager.create({
    profile: {
      name: 'Luna persona',
      prompt: 'Luna is a cartographer.',
    },
  }).profile
  assert.ok(persona)
  const userProfile = tavernManager.copyPersonaToUserProfile({
    personaId: persona.id,
    name: 'Luna profile',
  }).userProfile
  assert.ok(userProfile)
  assert.equal(userProfile.description, 'Luna is a cartographer.')
  personaManager.update({
    id: persona.id,
    profile: {
      name: 'Luna persona changed',
      prompt: 'Changed ordinary persona prompt.',
    },
  })
  assert.equal(tavernManager.getUserProfile(userProfile.id)?.description, 'Luna is a cartographer.')

  const temporaryProfile = tavernManager.createUserProfile({
    profile: {
      name: 'Temporary profile',
      description: 'Temporary profile text.',
    },
  }).userProfile
  assert.ok(temporaryProfile)
  tavernManager.setUserProfileEnabled({ id: temporaryProfile.id, enabled: false })
  assert.equal(tavernManager.getUserProfile(temporaryProfile.id)?.enabled, false)
  tavernManager.deleteUserProfile(temporaryProfile.id)
  assert.equal(tavernManager.getUserProfile(temporaryProfile.id), undefined)

  const exported = tavernManager.exportCharacterAsPersona({
    characterId: imported.character.id,
  })
  assert.ok(exported.persona)
  assert.equal(exported.persona?.prompt.includes('Stay in character.'), true)
  assert.equal(exported.persona?.prompt.includes('Welcome,'), false)
  assert.equal(exported.persona?.prompt.includes('Moon Gate opens'), false)

  const lorebook = imported.lorebooks[0]
  assert.ok(lorebook)
  tavernManager.updateLorebook({
    id: lorebook.id,
    lorebook: {
      ...lorebook,
      entries: [
        ...lorebook.entries,
        {
          keys: ['moon'],
          secondaryKeys: ['gate'],
          content: 'Selective lore is active.',
          selective: true,
          priority: 6,
          order: 0,
          position: 'before-history',
        },
        {
          keys: ['Moon Gate'],
          content: 'This entry is over budget and should be dropped.',
          priority: -1,
          order: 9,
          position: 'after-character',
        },
        {
          keys: ['Moon Gate'],
          content: 'After history lore is visible near the latest turn.',
          priority: 5,
          order: 2,
          position: 'after-history',
          tokenBudget: 3,
        },
      ],
    },
  })

  const tavernContextService = new TavernContextService({
    tavernManager,
    loreTokenBudget: 32,
  })
  const contextBuilder = new ContextBuilder(attachments, {
    summaries: contextSummaryRepo,
  })
  const now = Date.now()
  const session: ChatSession = {
    id: 'tavern-session',
    title: 'Aria',
    kind: 'tavern',
    status: 'active',
    messageCount: 0,
    metadata: {
      tavern: {
        enabled: true,
        version: 1,
        characterId: imported.character.id,
        characterName: imported.character.name,
        lorebookIds: imported.character.defaultLorebookIds,
        promptPresetId: preset.id,
        userProfileId: userProfile.id,
        userName: 'Luna',
        selectedGreetingIndex: 0,
        contextPreset: 'default',
        loreSettings: {
          scanDepth: 1,
          loreBudget: 32,
        },
      },
    },
    createdAt: now,
    updatedAt: now,
  }
  const currentUserMessage: ChatMessage = {
    id: 'user-current',
    sessionId: session.id,
    role: 'user',
    status: 'complete',
    parts: [{ type: 'plain', text: 'Tell me about the Moon Gate.' }],
    createdAt: now + 1,
    updatedAt: now + 1,
  }
  const plan = tavernContextService.buildPlan({
    session,
    messages: [currentUserMessage],
    currentUserMessageId: currentUserMessage.id,
  })
  assert.ok(plan)
  assert.equal(
    plan?.selectedUnits.some((unit) => unit.kind === 'character'),
    true
  )
  assert.equal(
    plan?.selectedUnits.some((unit) => unit.kind === 'example'),
    true
  )
  assert.equal(
    plan?.selectedUnits.some((unit) => unit.kind === 'post-history'),
    true
  )
  assert.equal(
    plan?.selectedUnits.some((unit) => unit.kind === 'lore'),
    true
  )
  assert.equal(
    plan?.selectedUnits.some(
      (unit) => unit.kind === 'prompt-preset' && unit.text.includes('Luna is a cartographer.')
    ),
    true
  )
  assert.equal(
    plan?.selectedUnits.some(
      (unit) => unit.kind === 'post-history' && unit.promptPresetId === preset.id
    ),
    true
  )
  assert.equal(
    plan?.selectedUnits.some((unit) => unit.kind === 'lore' && unit.position === 'after-history'),
    true
  )
  assert.equal(
    plan?.selectedUnits.some((unit) => unit.text.includes('Disabled text')),
    false
  )
  assert.equal(
    plan?.droppedUnits.some((unit) => unit.droppedReason === 'tavern_lore_budget'),
    true
  )
  assert.equal(JSON.stringify(plan?.snapshot).includes('Moon Gate opens'), false)
  assert.equal(JSON.stringify(plan?.snapshot).includes('Luna is a cartographer.'), false)
  assert.equal(plan?.snapshot.promptPresetId, preset.id)
  assert.equal(plan?.snapshot.userProfileId, userProfile.id)
  assert.deepEqual(plan?.snapshot.loreSettings, { scanDepth: 1, loreBudget: 32 })

  const provider: ProviderConfig = {
    id: 'provider',
    name: 'Provider',
    api: 'openai-chat-completions',
    baseUrl: 'https://provider.test/v1',
    enabled: true,
    models: [],
  }
  const model: ProviderModel = {
    id: 'model',
    providerId: provider.id,
    name: 'Model',
    remoteId: 'model',
    enabled: true,
    supportsTools: true,
    supportsStreaming: true,
    contextWindow: 4096,
    compat: {
      supportsSystemRole: false,
    },
  }
  const fallbackContext = await contextBuilder.build({
    session,
    messages: [currentUserMessage],
    currentUserMessageId: currentUserMessage.id,
    provider,
    model,
    skillPrompt: {
      enabledSkillIds: [],
      injected: false,
      omittedReason: 'tavern_run_profile',
    },
    tavernContext: plan,
  })
  assert.equal(fallbackContext.messages[0]?.role, 'user')
  assert.equal(JSON.stringify(fallbackContext.messages).includes('Aria is an archivist.'), true)
  assert.equal(JSON.stringify(fallbackContext.snapshot).includes('Aria is an archivist.'), false)
  assert.ok((fallbackContext.snapshot.tavern?.selectedLoreCount ?? 0) >= 1)
  const fallbackSerialized = JSON.stringify(fallbackContext.messages)
  assert.ok(
    fallbackSerialized.indexOf('Tell me about the Moon Gate.') <
      fallbackSerialized.indexOf('Final prompt for Aria')
  )

  const providerRequests: Array<{ messages: unknown[]; tools?: unknown[] }> = []
  const chatService = new ChatService({
    sessions: sessionRepo,
    messages: messageRepo,
    runs: runRepo,
    attachments,
    attachmentRepo,
    providers: {
      get: async () => ({ ...provider, models: [model] }),
      resolveDefaultProvider: async () => ({
        provider: { ...provider, models: [model] },
        modelId: model.id,
      }),
      createProviderClient: async () => ({
        id: provider.id,
        streamChat: async function* (request) {
          providerRequests.push({
            messages: request.messages,
            tools: request.tools,
          })
          yield { type: 'delta' as const, content: 'hello', done: false as const }
          yield {
            type: 'final' as const,
            done: true as const,
            finishReason: 'stop',
            usage: { input: 4, output: 2, total: 6 },
          }
        },
      }),
    } as never,
    contextBuilder,
    runManager,
    tavernManager,
    tavernContextService,
    contextDefaults: () => ({
      recentMessages: 20,
      maxInputBudgetPercent: 75,
      includeAttachments: 'current-only',
      autoCompact: false,
      compactThresholdPercent: 70,
    }),
    agentToolProfile: () => 'power',
  })

  const createdSession = await chatService.createTavernSession({
    characterId: imported.character.id,
    userName: 'Luna',
    selectedGreetingIndex: 1,
    promptPresetId: preset.id,
    userProfileId: userProfile.id,
    loreSettings: {
      scanDepth: 2,
      loreBudget: 24,
    },
  })
  assert.equal(createdSession.session.kind, 'tavern')
  assert.equal(createdSession.session.metadata?.tavern?.enabled, true)
  assert.equal(createdSession.session.metadata?.tavern?.promptPresetId, preset.id)
  assert.equal(createdSession.session.metadata?.tavern?.userProfileId, userProfile.id)
  assert.equal(
    createdSession.session.metadata?.tavern?.userDescriptionSnapshot,
    'Luna is a cartographer.'
  )
  assert.deepEqual(createdSession.session.metadata?.tavern?.loreSettings, {
    scanDepth: 2,
    loreBudget: 24,
  })
  assert.equal(createdSession.session.systemContext?.persona, undefined)
  assert.equal(
    sessionRepo.list({ kind: 'tavern' }).some((item) => item.id === createdSession.session.id),
    true
  )
  assert.equal(
    sessionRepo.list({ kind: 'chat' }).some((item) => item.id === createdSession.session.id),
    false
  )
  const seededMessages = messageRepo.listBySession(createdSession.session.id)
  assert.equal(seededMessages.length, 1)
  assert.equal(seededMessages[0]?.runId, undefined)
  assert.equal(seededMessages[0]?.metadata?.tavern?.greeting, true)
  assert.equal(JSON.stringify(seededMessages).includes('The stacks are open, Luna.'), true)

  const switched = chatService.updateTavernSessionBinding({
    sessionId: createdSession.session.id,
    selectedGreetingIndex: 0,
    loreSettings: {
      scanDepth: 1,
      loreBudget: 20,
    },
  })
  assert.equal(switched.greetingReplaced, true)
  assert.deepEqual(switched.session.metadata?.tavern?.loreSettings, {
    scanDepth: 1,
    loreBudget: 20,
  })
  assert.equal(
    JSON.stringify(messageRepo.listBySession(createdSession.session.id)).includes('Welcome, Luna.'),
    true
  )

  const beforePreviewMessageCount = messageRepo.listBySession(createdSession.session.id).length
  const beforePreviewRunCount = runCountBySession(db, createdSession.session.id)
  const preview = chatService.previewTavernPrompt({
    sessionId: createdSession.session.id,
    currentInput: 'Preview the Moon Gate.',
  })
  assert.equal(preview.ok, true)
  assert.equal(preview.promptPresetId, preset.id)
  assert.equal(preview.userProfileId, userProfile.id)
  assert.equal(
    preview.sections.some((section) => section.text.includes('Luna is a cartographer.')),
    true
  )
  assert.equal(JSON.stringify(preview.snapshot).includes('Luna is a cartographer.'), false)
  assert.equal(
    messageRepo.listBySession(createdSession.session.id).length,
    beforePreviewMessageCount
  )
  assert.equal(runCountBySession(db, createdSession.session.id), beforePreviewRunCount)

  const send = await chatService.sendInternalMessage(
    {
      sessionId: createdSession.session.id,
      parts: [{ type: 'plain', text: 'The Moon Gate is mentioned.' }],
      providerId: provider.id,
      modelId: model.id,
    },
    {
      send() {},
    }
  )
  await send.terminalEvent
  assert.equal(providerRequests.at(-1)?.tools, undefined)
  const run = runRepo.get(send.runId)
  assert.equal(run?.requestSnapshot?.mode, 'fast_chat')
  assert.equal(run?.requestSnapshot?.toolProfile, 'minimal')
  assert.deepEqual(run?.requestSnapshot?.availableTools, [])
  assert.equal(run?.requestSnapshot?.skills?.omittedReason, 'tavern_run_profile')
  assert.equal(run?.requestSnapshot?.tavern?.runProfile, 'low-noise')
  assert.equal(JSON.stringify(run?.requestSnapshot).includes('Moon Gate opens'), false)
  assert.equal(JSON.stringify(run?.requestSnapshot).includes('Luna is a cartographer.'), false)
  assert.equal(run?.requestSnapshot?.tavern?.promptPresetId, preset.id)
  assert.equal(run?.requestSnapshot?.tavern?.userProfileId, userProfile.id)

  const explicitProfileSend = await chatService.sendInternalMessage(
    {
      sessionId: createdSession.session.id,
      parts: [{ type: 'plain', text: 'Keep this low-noise.' }],
      providerId: provider.id,
      modelId: model.id,
      toolProfile: 'power',
    },
    {
      send() {},
    }
  )
  await explicitProfileSend.terminalEvent
  assert.equal(providerRequests.at(-1)?.tools, undefined)
  const explicitProfileRun = runRepo.get(explicitProfileSend.runId)
  assert.equal(explicitProfileRun?.requestSnapshot?.mode, 'fast_chat')
  assert.equal(explicitProfileRun?.requestSnapshot?.toolProfile, 'minimal')
  assert.deepEqual(explicitProfileRun?.requestSnapshot?.availableTools, [])
  assert.equal(explicitProfileRun?.requestSnapshot?.skills?.omittedReason, 'tavern_run_profile')

  await assert.rejects(
    () =>
      chatService.regenerateMessage(
        {
          sessionId: createdSession.session.id,
          messageId: seededMessages[0]?.id ?? '',
        },
        { send() {} } as never
      ),
    /cannot be regenerated/
  )

  assert.equal(IPC_CHANNELS.tavern.importCharacter, 'tavern:import-character')
  assert.equal(IPC_CHANNELS.tavern.createSession, 'tavern:create-session')
  assert.equal(IPC_CHANNELS.tavern.previewPrompt, 'tavern:preview-prompt')
  assert.equal(IPC_CHANNELS.tavern.createPromptPreset, 'tavern:create-prompt-preset')
  assert.equal(IPC_CHANNELS.tavern.copyPersonaToUserProfile, 'tavern:copy-persona-user-profile')

  console.log('tavern smoke ok')
} finally {
  client.close()
  rmSync(tempDir, { recursive: true, force: true })
}

function pngCharacterCard(content: string, keyword = 'chara'): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const encoded = Buffer.from(content, 'utf8').toString('base64')
  const payload = Buffer.concat([
    Buffer.from(keyword, 'latin1'),
    Buffer.from([0]),
    Buffer.from(encoded, 'utf8'),
  ])
  return Buffer.concat([signature, pngChunk('tEXt', payload)])
}

function pngChunk(type: string, payload: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(payload.length, 0)
  return Buffer.concat([length, Buffer.from(type, 'ascii'), payload, Buffer.alloc(4)])
}

function webpCharacterCard(content: string): Buffer {
  const encoded = Buffer.from(content, 'utf8').toString('base64')
  const payload = Buffer.from(`chara=${encoded}`, 'utf8')
  const padding = payload.length % 2 ? Buffer.from([0]) : Buffer.alloc(0)
  const riffSize = Buffer.alloc(4)
  riffSize.writeUInt32LE(4 + 8 + payload.length + padding.length, 0)
  const chunkSize = Buffer.alloc(4)
  chunkSize.writeUInt32LE(payload.length, 0)
  return Buffer.concat([
    Buffer.from('RIFF', 'ascii'),
    riffSize,
    Buffer.from('WEBP', 'ascii'),
    Buffer.from('EXIF', 'ascii'),
    chunkSize,
    payload,
    padding,
  ])
}

function runCountBySession(db: DatabaseConnection, sessionId: string): number {
  return (
    db.prepare('SELECT COUNT(*) AS count FROM chat_runs WHERE session_id = ?').get(sessionId) as {
      count: number
    }
  ).count
}

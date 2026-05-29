import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { AttachmentService } from '../core/chat/attachment-service'
import { ChatService } from '../core/chat/chat-service'
import { ContextBuilder } from '../core/chat/context-manager'
import { RunManager } from '../core/chat/run-manager'
import { DatabaseClient } from '../core/db/client'
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
  assert.equal(initial.version, 1)
  assert.equal(initial.characters.length, 0)
  assert.equal(initial.lorebooks.length, 0)
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
    kind: 'chat',
    status: 'active',
    messageCount: 0,
    metadata: {
      tavern: {
        enabled: true,
        version: 1,
        characterId: imported.character.id,
        characterName: imported.character.name,
        lorebookIds: imported.character.defaultLorebookIds,
        userName: 'Luna',
        selectedGreetingIndex: 0,
        contextPreset: 'default',
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
    plan?.selectedUnits.some((unit) => unit.text.includes('Disabled text')),
    false
  )
  assert.equal(
    plan?.droppedUnits.some((unit) => unit.droppedReason === 'tavern_lore_budget'),
    true
  )
  assert.equal(JSON.stringify(plan?.snapshot).includes('Moon Gate opens'), false)

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
  })
  assert.equal(createdSession.session.metadata?.tavern?.enabled, true)
  const seededMessages = messageRepo.listBySession(createdSession.session.id)
  assert.equal(seededMessages.length, 1)
  assert.equal(seededMessages[0]?.runId, undefined)
  assert.equal(seededMessages[0]?.metadata?.tavern?.greeting, true)
  assert.equal(JSON.stringify(seededMessages).includes('The stacks are open, Luna.'), true)

  const switched = chatService.updateTavernSessionBinding({
    sessionId: createdSession.session.id,
    selectedGreetingIndex: 0,
  })
  assert.equal(switched.greetingReplaced, true)
  assert.equal(
    JSON.stringify(messageRepo.listBySession(createdSession.session.id)).includes('Welcome, Luna.'),
    true
  )

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

  console.log('tavern smoke ok')
} finally {
  client.close()
  rmSync(tempDir, { recursive: true, force: true })
}

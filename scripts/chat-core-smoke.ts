import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { evaluateComplexDocumentAttachmentAdmission } from '../core/agent/run/document-attachments'
import { toolFallbackReasonForProviderError } from '../core/agent/run/helpers'
import { ToolRegistry } from '../core/agent/tools/registry'
import type { AgentTool } from '../core/agent/tools/types'
import { AgentWorkspaceService } from '../core/agent/workspace'
import { AttachmentService } from '../core/chat/attachment-service'
import { ChatService } from '../core/chat/chat-service'
import { ContextCompactionService } from '../core/chat/context-compaction'
import { ContextBuilder } from '../core/chat/context-manager'
import { RunManager } from '../core/chat/run-manager'
import {
  stageWorkspaceDocumentAttachments,
  withWorkspaceDocumentAttachmentsMetadata,
} from '../core/chat/workspace-document-attachments'
import { cloneDefaultConfig } from '../core/config/schema'
import { ScheduledTaskAgentExecutor } from '../core/cron/scheduled-task-executor'
import { DatabaseClient } from '../core/db/client'
import {
  AttachmentRepo,
  ChatContextSummaryRepo,
  ChatMessageRepo,
  ChatRunRepo,
  ChatSessionRepo,
} from '../core/db/repos'
import { seedDefaultChatData } from '../core/db/seed'
import { errorFromResponse, normalizeProviderError } from '../core/provider/errors'
import { parseSseStream } from '../core/provider/providers/openai'
import type { ChatMessage } from '../shared/types/chat'
import type { ProviderConfig, ProviderModel } from '../shared/types/provider'

const tempDir = mkdtempSync(join(tmpdir(), 'openomniclaw-chat-core-smoke-'))
const client = new DatabaseClient({ path: join(tempDir, 'smoke.sqlite3') })

try {
  const db = client.connect()
  seedDefaultChatData(db, 1000)

  const attachmentRepo = new AttachmentRepo(db)
  const attachments = new AttachmentService({
    repo: attachmentRepo,
    rootDir: join(tempDir, 'attachments'),
  })
  const sessionRepo = new ChatSessionRepo(db)
  const messageRepo = new ChatMessageRepo(db)
  const textUpload = await attachments.upload({
    name: 'note.txt',
    mimeType: 'text/plain',
    bytes: new TextEncoder().encode('hello from file').buffer,
  })
  assert.equal(textUpload.attachment.extractedTextStatus, 'complete')

  const imageUpload = await attachments.upload({
    name: 'pixel.png',
    mimeType: 'image/png',
    bytes: Uint8Array.from([137, 80, 78, 71]).buffer,
  })
  const docBytes = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0, 1, 2, 3])
  const docUpload = await attachments.upload({
    name: 'Report Q1.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    bytes: docBytes.buffer,
  })
  assert.equal(docUpload.attachment.kind, 'file')
  assert.equal(docUpload.attachment.extractedTextStatus, 'none')

  const provider: ProviderConfig = {
    id: 'openai-compatible',
    name: 'OpenAI Compatible',
    api: 'openai-chat-completions',
    baseUrl: 'https://api.openai.com/v1',
    enabled: true,
    models: [],
  }
  const model: ProviderModel = {
    id: 'vision',
    providerId: provider.id,
    name: 'Vision',
    remoteId: 'vision',
    enabled: true,
    input: ['text', 'image'],
    supportsStreaming: true,
    supportsTools: false,
  }
  const mimoProvider: ProviderConfig = {
    ...provider,
    id: 'mimo-provider',
    name: 'Mimo',
    models: [{ ...model, id: 'mimo', providerId: 'mimo-provider', remoteId: 'mimo' }],
  }
  const kimiProvider: ProviderConfig = {
    ...provider,
    id: 'kimi-provider',
    name: 'Kimi',
    models: [{ ...model, id: 'kimi', providerId: 'kimi-provider', remoteId: 'kimi' }],
  }
  const runRepo = new ChatRunRepo(db)
  const runManager = new RunManager(runRepo)
  const providerRequests: Array<{ providerId: string; messages: unknown[] }> = []
  const sessionModelService = new ChatService({
    sessions: sessionRepo,
    messages: messageRepo,
    runs: runRepo,
    attachments,
    attachmentRepo,
    providers: {
      get: async (providerId: string) =>
        providerId === kimiProvider.id
          ? kimiProvider
          : providerId === mimoProvider.id
            ? mimoProvider
            : undefined,
      resolveDefaultProvider: async () => ({
        provider: mimoProvider,
        modelId: 'mimo',
      }),
      createProviderClient: async (providerId: string) => ({
        id: providerId,
        streamChat: async function* (request) {
          providerRequests.push({
            providerId,
            messages: request.messages,
          })
          yield { type: 'delta' as const, content: 'internal vision result', done: false as const }
          yield {
            type: 'final' as const,
            done: true as const,
            finishReason: 'stop',
            usage: { input: 7, output: 3, total: 10 },
          }
        },
      }),
    } as never,
    contextBuilder: new ContextBuilder(attachments, {
      summaries: new ChatContextSummaryRepo(db),
    }),
    contextCompaction: new ContextCompactionService(new ChatContextSummaryRepo(db)),
    runManager,
    contextDefaults: () => ({
      recentMessages: 20,
      maxInputBudgetPercent: 75,
      includeAttachments: 'current-only',
      autoCompact: true,
      compactThresholdPercent: 0,
    }),
  })
  const selectedSession = await sessionModelService.createSession({
    providerId: kimiProvider.id,
    modelId: 'kimi',
  })
  assert.equal(selectedSession.defaultProviderId, kimiProvider.id)
  assert.equal(selectedSession.defaultModelId, 'kimi')
  const visionSession = await sessionModelService.createSession({
    kind: 'vision',
    providerId: kimiProvider.id,
    modelId: 'kimi',
  })
  assert.equal(visionSession.kind, 'vision')
  assert.equal(
    sessionModelService.listSessions().some((item) => item.id === visionSession.id),
    false
  )
  assert.equal(
    sessionModelService
      .listSessions({ kind: 'vision' })
      .some((item) => item.id === visionSession.id),
    true
  )
  const internalEvents: string[] = []
  const internalSend = await sessionModelService.sendInternalMessage(
    {
      sessionId: visionSession.id,
      parts: [
        {
          type: 'plain',
          text: 'describe the current screen',
        },
        {
          type: 'vision_capture',
          captureId: 'capture-smoke',
          scope: 'primary_display',
          mimeType: 'image/png',
          width: 1,
          height: 1,
          retention: 'ephemeral',
          createdAt: Date.now(),
          marker: '[capture marker only]',
        },
      ],
      providerId: kimiProvider.id,
      modelId: 'kimi',
      mode: 'fast_chat',
      toolProfile: 'minimal',
      maxSteps: 1,
      metadata: {
        source: 'observation',
        captureId: 'capture-smoke',
      },
      transientImageInputs: [
        {
          captureId: 'capture-smoke',
          dataUrl:
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mP8z8AARQAFAAH7AhnwAAAAAElFTkSuQmCC',
          mimeType: 'image/png',
          width: 1,
          height: 1,
          createdAt: Date.now(),
        },
      ],
    },
    {
      send(channel, event) {
        internalEvents.push(`${channel}:${(event as { type?: string }).type ?? 'unknown'}`)
      },
    }
  )
  const terminal = await internalSend.terminalEvent
  assert.equal(terminal.type, 'final')
  assert.equal(
    internalEvents.some((event) => event.includes(':started')),
    true
  )
  assert.equal(
    internalEvents.some((event) => event.includes(':delta')),
    true
  )
  assert.equal(
    internalEvents.some((event) => event.includes(':final')),
    true
  )
  const internalMessages = messageRepo.listBySession(visionSession.id)
  assert.equal(internalMessages.length, 2)
  const internalUserMessage = internalMessages[0]
  assert.ok(internalUserMessage)
  assert.equal(internalMessages[0]?.metadata?.source, 'observation')
  assert.equal(
    internalMessages[0]?.parts.some((part) => part.type === 'vision_capture'),
    true
  )
  assert.equal(messageRepo.listAttachmentLinks(internalUserMessage.id).length, 0)
  assert.equal(runRepo.get(internalSend.runId)?.requestSnapshot?.imageInputCount, 1)
  assert.equal(
    JSON.stringify(runRepo.get(internalSend.runId)?.requestSnapshot).includes('base64'),
    false
  )
  assert.equal(
    JSON.stringify(providerRequests.at(-1)?.messages).includes('data:image/png;base64'),
    true
  )
  for (let index = 0; index < 8; index += 1) {
    messageRepo.save({
      id: `vision-history-${index}`,
      sessionId: visionSession.id,
      role: index % 2 === 0 ? 'user' : 'assistant',
      status: 'complete',
      parts: [{ type: 'plain', text: `vision history ${index}` }],
      createdAt: Date.now() + index + 10,
      updatedAt: Date.now() + index + 10,
    })
  }
  await sessionModelService
    .sendInternalMessage(
      {
        sessionId: visionSession.id,
        content: 'continue observing',
        providerId: kimiProvider.id,
        modelId: 'kimi',
        mode: 'fast_chat',
        toolProfile: 'minimal',
        maxSteps: 1,
      },
      {
        send() {},
      }
    )
    .then((response) => response.terminalEvent)
  assert.equal(
    new ChatContextSummaryRepo(db).latestUsable(visionSession.id)?.sessionId,
    visionSession.id
  )

  const messages: ChatMessage[] = [
    {
      id: 'user-1',
      sessionId: 'session-1',
      role: 'user',
      status: 'complete',
      parts: [
        { type: 'plain', text: 'summarize' },
        { type: 'file', attachmentId: textUpload.attachment.id, filename: 'note.txt' },
        { type: 'image', attachmentId: imageUpload.attachment.id, filename: 'pixel.png' },
      ],
      createdAt: 1,
      updatedAt: 1,
    },
  ]
  const context = await new ContextBuilder(attachments).build({
    session: {
      id: 'session-1',
      title: 'Smoke',
      status: 'active',
      systemPrompt: 'Be concise.',
      contextPolicy: {
        mode: 'recent-turns',
        maxMessages: 10,
        includeAttachments: 'current-only',
      },
      createdAt: 1,
      updatedAt: 1,
    },
    messages,
    currentUserMessageId: 'user-1',
    provider,
    model,
  })
  assert.equal(context.messages[0]?.role, 'system')
  assert.equal(context.snapshot.attachmentCount, 2)
  assert.equal(context.snapshot.imageInputCount, 1)
  assert.match(JSON.stringify(context.messages), /image_url/)
  assert.match(JSON.stringify(context.messages), /hello from file/)

  const config = cloneDefaultConfig()
  const workspace = new AgentWorkspaceService({
    userDataPath: tempDir,
    settings: () => config.tools.workspace,
  })
  const docMessage: ChatMessage = {
    id: 'user-doc',
    sessionId: 'session-doc',
    role: 'user',
    status: 'complete',
    parts: [
      { type: 'plain', text: 'read this document' },
      { type: 'file', attachmentId: docUpload.attachment.id, filename: 'Report Q1.docx' },
    ],
    createdAt: 2,
    updatedAt: 2,
  }
  const staged = await stageWorkspaceDocumentAttachments({
    sessionId: 'session-doc',
    messageId: docMessage.id,
    parts: docMessage.parts,
    attachmentIds: [docUpload.attachment.id],
    attachments,
    workspace,
    attachmentMaxFileBytes: attachments.getLimits().maxFileBytes,
    workspaceMaxFileBytes: config.tools.workspace.maxFileBytes,
  })
  const stagedAgain = await stageWorkspaceDocumentAttachments({
    sessionId: 'session-doc',
    messageId: docMessage.id,
    parts: docMessage.parts,
    attachmentIds: [docUpload.attachment.id],
    attachments,
    workspace,
    attachmentMaxFileBytes: attachments.getLimits().maxFileBytes,
    workspaceMaxFileBytes: config.tools.workspace.maxFileBytes,
  })
  assert.match(staged[0]?.workspaceRelativePath ?? '', /^attachments\/user-doc\/Report Q1\.docx$/)
  assert.notEqual(staged[0]?.workspaceRelativePath, stagedAgain[0]?.workspaceRelativePath)
  const stagedDocument = staged[0]
  assert.ok(stagedDocument)
  const workspaceStatus = await workspace.getStatus('session-doc')
  assert.deepEqual(
    await readFile(join(workspaceStatus.filesPath, stagedDocument.workspaceRelativePath)),
    Buffer.from(docBytes)
  )

  const docContext = await new ContextBuilder(attachments).build({
    session: {
      id: 'session-doc',
      title: 'Doc smoke',
      status: 'active',
      contextPolicy: {
        mode: 'recent-turns',
        maxMessages: 10,
        includeAttachments: 'current-only',
      },
      createdAt: 2,
      updatedAt: 2,
    },
    messages: [
      {
        ...docMessage,
        metadata: withWorkspaceDocumentAttachmentsMetadata(docMessage.metadata, staged),
      },
    ],
    currentUserMessageId: docMessage.id,
    provider,
    model: { ...model, supportsTools: true },
  })
  const docPrompt = JSON.stringify(docContext.messages)
  assert.match(docPrompt, /workspace_attachment/)
  assert.match(docPrompt, /attachments\/user-doc\/Report Q1\.docx/)
  assert.doesNotMatch(docPrompt, new RegExp(escapeRegExp(tempDir)))
  assert.doesNotMatch(docPrompt, /base64|UEsDB/)

  const metadataOnlyContext = await new ContextBuilder(attachments).build({
    session: {
      id: 'session-doc',
      title: 'Doc smoke',
      status: 'active',
      contextPolicy: {
        mode: 'recent-turns',
        maxMessages: 10,
        includeAttachments: 'current-only',
      },
      createdAt: 2,
      updatedAt: 2,
    },
    messages: [docMessage],
    currentUserMessageId: docMessage.id,
    provider,
    model,
  })
  const metadataOnlyPrompt = JSON.stringify(metadataOnlyContext.messages)
  assert.match(metadataOnlyPrompt, /has not been staged/)
  assert.doesNotMatch(metadataOnlyPrompt, /workspace_attachment/)

  const documentTools = [fakeAgentTool('workspace_file'), fakeAgentTool('terminal_exec')]
  const documentRecord = attachments.get(docUpload.attachment.id)
  assert.ok(documentRecord)
  assert.equal(
    evaluateComplexDocumentAttachmentAdmission({
      documents: [documentRecord],
      requestedMode: 'assistant',
      mode: 'assistant',
      supportsTools: true,
      toolProfile: 'minimal',
      agentTools: [],
      workspaceServiceAvailable: true,
      toolSettings: config.tools,
      attachmentMaxFileBytes: attachments.getLimits().maxFileBytes,
      workspaceMaxFileBytes: config.tools.workspace.maxFileBytes,
    }).some((item) => item.reason === 'minimal_profile'),
    true
  )
  assert.equal(
    evaluateComplexDocumentAttachmentAdmission({
      documents: [documentRecord],
      requestedMode: 'assistant',
      mode: 'fast_chat',
      supportsTools: false,
      toolProfile: 'assistant',
      agentTools: [],
      workspaceServiceAvailable: true,
      toolSettings: config.tools,
      attachmentMaxFileBytes: attachments.getLimits().maxFileBytes,
      workspaceMaxFileBytes: config.tools.workspace.maxFileBytes,
    }).some((item) => item.reason === 'model_does_not_support_tools'),
    true
  )
  const disabledWorkspaceConfig = cloneDefaultConfig()
  disabledWorkspaceConfig.tools.workspace.enabled = false
  assert.equal(
    evaluateComplexDocumentAttachmentAdmission({
      documents: [documentRecord],
      requestedMode: 'assistant',
      mode: 'assistant',
      supportsTools: true,
      toolProfile: 'assistant',
      agentTools: documentTools,
      workspaceServiceAvailable: true,
      toolSettings: disabledWorkspaceConfig.tools,
      attachmentMaxFileBytes: attachments.getLimits().maxFileBytes,
      workspaceMaxFileBytes: disabledWorkspaceConfig.tools.workspace.maxFileBytes,
    }).some((item) => item.reason === 'workspace_disabled'),
    true
  )
  const disabledTerminalConfig = cloneDefaultConfig()
  disabledTerminalConfig.tools.terminal.enabled = false
  assert.equal(
    evaluateComplexDocumentAttachmentAdmission({
      documents: [documentRecord],
      requestedMode: 'assistant',
      mode: 'assistant',
      supportsTools: true,
      toolProfile: 'assistant',
      agentTools: documentTools,
      workspaceServiceAvailable: true,
      toolSettings: disabledTerminalConfig.tools,
      attachmentMaxFileBytes: attachments.getLimits().maxFileBytes,
      workspaceMaxFileBytes: disabledTerminalConfig.tools.workspace.maxFileBytes,
    }).some((item) => item.reason === 'terminal_disabled'),
    true
  )
  const disabledToolReasons = evaluateComplexDocumentAttachmentAdmission({
    documents: [documentRecord],
    requestedMode: 'assistant',
    mode: 'assistant',
    supportsTools: true,
    toolProfile: 'assistant',
    agentTools: documentTools,
    workspaceServiceAvailable: true,
    toolSettings: config.tools,
    disabledToolNames: ['workspace_file', 'terminal_exec'],
    attachmentMaxFileBytes: attachments.getLimits().maxFileBytes,
    workspaceMaxFileBytes: config.tools.workspace.maxFileBytes,
  }).map((item) => item.reason)
  assert.equal(disabledToolReasons.includes('workspace_tool_disabled'), true)
  assert.equal(disabledToolReasons.includes('terminal_tool_disabled'), true)

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder()
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"hi"}}]}\n\n'))
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
  })
  const events: string[] = []
  for await (const event of parseSseStream(stream)) {
    events.push(event)
  }
  assert.equal(events.length, 2)
  assert.equal(events[1], '[DONE]')

  assert.equal(normalizeProviderError(new DOMException('stop', 'AbortError')).code, 'aborted')
  const imageInputError = await errorFromResponse(
    new Response(
      'data:{"error":{"code":"404","message":"No endpoints found that support image input","param":"","type":""}}',
      { status: 404, statusText: 'Not Found' }
    )
  )
  assert.equal(imageInputError.code, 'provider_bad_request')
  assert.match(imageInputError.message, /图片输入/)
  assert.equal(
    toolFallbackReasonForProviderError(imageInputError, [], [], false),
    'provider_rejected_multimodal_tools'
  )

  const scheduledProvider: ProviderConfig = {
    ...provider,
    models: [
      {
        id: 'gpt-4o-mini',
        name: 'GPT smoke',
        enabled: true,
        supportsTools: false,
      },
    ],
  }
  const scheduledExecutor = new ScheduledTaskAgentExecutor({
    sessions: sessionRepo,
    messages: messageRepo,
    providers: {
      get: async () => scheduledProvider,
      resolveDefaultProvider: async () => ({
        provider: scheduledProvider,
        modelId: 'gpt-4o-mini',
      }),
      createProviderClient: async () => ({
        id: 'scheduled-smoke',
        streamChat: async function* () {
          yield { type: 'delta' as const, content: 'scheduled result', done: false }
          yield { type: 'final' as const, done: true, finishReason: 'stop' }
        },
      }),
    } as never,
    contextBuilder: new ContextBuilder(attachments),
    toolRegistry: new ToolRegistry({
      messages: messageRepo,
      attachments,
    }),
  })
  const beforeScheduledMessages = messageRepo.listBySession('default').length
  const result = await scheduledExecutor.execute({
    task: {
      id: 'scheduled-task-smoke',
      name: 'Scheduled smoke',
      note: 'Produce a result.',
      sourceSessionId: 'default',
      targetSessionId: 'default',
      schedule: { kind: 'at', runAt: Date.now() + 60_000 },
      enabled: true,
      state: 'idle',
      failureCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    run: {
      id: 'scheduled-run-smoke',
      taskId: 'scheduled-task-smoke',
      reason: 'manual',
      status: 'running',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    signal: new AbortController().signal,
  })
  const afterScheduledMessages = messageRepo.listBySession('default')
  assert.equal(afterScheduledMessages.length, beforeScheduledMessages + 1)
  assert.equal(result.resultSummary, 'scheduled result')
  assert.equal(
    afterScheduledMessages.some((message) => message.id.startsWith('cron-instruction:')),
    false
  )
  assert.equal(afterScheduledMessages.at(-1)?.metadata?.source, 'cron')

  await assert.rejects(() =>
    scheduledExecutor.execute({
      task: {
        id: 'missing-task-smoke',
        name: 'Missing target',
        note: 'Do not append errors.',
        sourceSessionId: 'missing',
        targetSessionId: 'missing',
        schedule: { kind: 'at', runAt: Date.now() + 60_000 },
        enabled: true,
        state: 'idle',
        failureCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      run: {
        id: 'missing-run-smoke',
        taskId: 'missing-task-smoke',
        reason: 'manual',
        status: 'running',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      signal: new AbortController().signal,
    })
  )
  assert.equal(messageRepo.listBySession('default').length, afterScheduledMessages.length)

  console.log('Chat core smoke check passed')
} finally {
  client.close()
  rmSync(tempDir, { recursive: true, force: true })
}

function fakeAgentTool(name: 'workspace_file' | 'terminal_exec'): AgentTool {
  return {
    name,
    description: name,
    parameters: { type: 'object' },
    risk: name === 'terminal_exec' ? 'exec' : 'read',
    source: 'builtin',
    localCapability: {
      kind: name === 'terminal_exec' ? 'terminal' : 'workspace',
    },
    execute: async () => ({ content: [{ type: 'text', text: '{}' }] }),
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

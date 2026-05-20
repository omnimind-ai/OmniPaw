import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ToolRegistry } from '../core/agent/tools/registry'
import { AttachmentService } from '../core/chat/attachment-service'
import { ContextBuilder } from '../core/chat/context-manager'
import { ScheduledTaskAgentExecutor } from '../core/cron/scheduled-task-executor'
import { DatabaseClient } from '../core/db/client'
import { AttachmentRepo, ChatMessageRepo, ChatSessionRepo } from '../core/db/repos'
import { seedDefaultChatData } from '../core/db/seed'
import { normalizeProviderError } from '../core/provider/errors'
import { parseSseStream } from '../core/provider/providers/openai'
import type { ChatMessage } from '../shared/types/chat'
import type { ProviderConfig, ProviderModel } from '../shared/types/provider'

const tempDir = mkdtempSync(join(tmpdir(), 'openomniclaw-chat-core-smoke-'))
const client = new DatabaseClient({ path: join(tempDir, 'smoke.sqlite3') })

try {
  const db = client.connect()
  seedDefaultChatData(db, 1000)

  const attachments = new AttachmentService({
    repo: new AttachmentRepo(db),
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
  assert.match(JSON.stringify(context.messages), /image_url/)
  assert.match(JSON.stringify(context.messages), /hello from file/)

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

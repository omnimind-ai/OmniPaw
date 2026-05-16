import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

import { DatabaseClient } from '../core/db/client'
import { AttachmentRepo, ChatMessageRepo, ChatRunRepo, ChatSessionRepo } from '../core/db/repos'
import { seedDefaultChatData } from '../core/db/seed'
import type { ChatMessage, ChatRun, ChatSession, InternalAttachmentRecord } from '../core/db/types'

const tempDir = mkdtempSync(join(tmpdir(), 'openomniclaw-db-smoke-'))
const client = new DatabaseClient({ path: join(tempDir, 'smoke.sqlite3') })

try {
  const db = client.connect()
  seedDefaultChatData(db, 1000)

  const sessions = new ChatSessionRepo(db)
  const messages = new ChatMessageRepo(db)
  const attachments = new AttachmentRepo(db)
  const runs = new ChatRunRepo(db)

  assert.equal(sessions.list().length, 1)

  const session: ChatSession = {
    id: 'session-smoke',
    title: 'Smoke test',
    status: 'active',
    defaultProviderId: 'openai-compatible',
    defaultModelId: 'gpt-4o-mini',
    messageCount: 0,
    createdAt: 2000,
    updatedAt: 2000,
  }
  sessions.save(session)
  assert.equal(sessions.get(session.id)?.title, 'Smoke test')
  assert.equal(sessions.updateTitle(session.id, 'Renamed', 2001), true)
  assert.equal(sessions.get(session.id)?.title, 'Renamed')

  const attachment: InternalAttachmentRecord = {
    id: 'attachment-smoke',
    kind: 'text',
    originalName: 'note.txt',
    storedName: 'note-stored.txt',
    mimeType: 'text/plain',
    sizeBytes: 12,
    sha256: 'sha256-smoke',
    storagePath: join(tempDir, 'note-stored.txt'),
    extractedText: 'hello world',
    extractedTextStatus: 'complete',
    createdAt: 2002,
    updatedAt: 2002,
  }
  attachments.save(attachment)
  assert.equal(attachments.getBySha256('sha256-smoke')?.id, attachment.id)

  const userMessage: ChatMessage = {
    id: 'message-user',
    sessionId: session.id,
    role: 'user',
    status: 'complete',
    parts: [
      { type: 'plain', text: 'hello' },
      { type: 'file', attachmentId: attachment.id, filename: 'note.txt' },
    ],
    createdAt: 2003,
    updatedAt: 2003,
  }
  const assistantMessage: ChatMessage = {
    id: 'message-assistant',
    sessionId: session.id,
    role: 'assistant',
    status: 'streaming',
    parts: [],
    createdAt: 2004,
    updatedAt: 2004,
  }
  messages.save(userMessage)
  messages.save(assistantMessage)
  messages.replaceAttachmentLinks(userMessage.id, [
    {
      messageId: userMessage.id,
      attachmentId: attachment.id,
      partIndex: 1,
      role: 'input',
    },
  ])
  assert.equal(messages.listBySession(session.id).length, 2)
  assert.equal(messages.listAttachmentLinks(userMessage.id)[0]?.attachmentId, attachment.id)
  assert.equal(messages.updateParts(assistantMessage.id, [{ type: 'plain', text: 'hi' }], { status: 'complete' }, 2005), true)

  const run: ChatRun = {
    id: 'run-smoke',
    sessionId: session.id,
    userMessageId: userMessage.id,
    assistantMessageId: assistantMessage.id,
    providerId: 'openai-compatible',
    modelId: 'gpt-4o-mini',
    status: 'running',
    idempotencyKey: 'idem-smoke',
    startedAt: 2007,
    requestSnapshot: {
      api: 'openai-chat-completions',
      baseUrlHost: 'api.openai.com',
      model: 'gpt-4o-mini',
      messageCount: 1,
      attachmentCount: 1,
    },
    createdAt: 2007,
    updatedAt: 2007,
  }
  assert.equal(runs.save(run).id, run.id)
  assert.equal(runs.save({ ...run, id: 'run-duplicate' }).id, run.id)
  assert.equal(runs.updateStatus(run.id, 'complete', { finishedAt: 2008, usage: { total: 10 } }, 2008), true)
  assert.equal(runs.get(run.id)?.usage?.total, 10)

  console.log('DB smoke check passed')
} finally {
  client.close()
  rmSync(tempDir, { recursive: true, force: true })
}

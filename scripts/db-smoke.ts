import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { CronManager } from '../core/cron/cron-manager'
import { nextRunAt, validateCronExpression } from '../core/cron/schedule'
import { DatabaseClient } from '../core/db/client'
import {
  AttachmentRepo,
  ChatMessageRepo,
  ChatRunRepo,
  ChatSessionRepo,
  CronRunRepo,
  CronTaskRepo,
} from '../core/db/repos'
import { seedDefaultChatData } from '../core/db/seed'
import type { ChatMessage, ChatRun, ChatSession, InternalAttachmentRecord } from '../core/db/types'
import { SYSTEM_SESSION_IDS } from '../shared/constants'

const tempDir = mkdtempSync(join(tmpdir(), 'openomniclaw-db-smoke-'))
const client = new DatabaseClient({ path: join(tempDir, 'smoke.sqlite3') })

try {
  const db = client.connect()
  seedDefaultChatData(db, 1000)

  const sessions = new ChatSessionRepo(db)
  const messages = new ChatMessageRepo(db)
  const attachments = new AttachmentRepo(db)
  const runs = new ChatRunRepo(db)
  const cronTasks = new CronTaskRepo(db)
  const cronRuns = new CronRunRepo(db)

  assert.equal(sessions.list().length, 1)
  assert.equal(sessions.list({ kind: 'chat' }).length, 1)
  assert.equal(sessions.get('default')?.kind, 'chat')

  const session: ChatSession = {
    id: 'session-smoke',
    title: 'Smoke test',
    kind: 'chat',
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
  const catSession: ChatSession = {
    id: 'cat-session-smoke',
    title: 'Cat smoke',
    kind: 'cat',
    status: 'active',
    messageCount: 0,
    createdAt: 2001,
    updatedAt: 2001,
  }
  sessions.save(catSession)
  assert.equal(sessions.get(catSession.id)?.kind, 'cat')
  assert.equal(sessions.list({ kind: 'cat' }).length, 1)
  assert.equal(
    sessions.list({ kind: 'chat' }).some((item) => item.id === catSession.id),
    false
  )
  const cronSession = getOrCreateSmokeCronSession(sessions, 2002)
  assert.equal(cronSession.kind, 'cron')
  assert.equal(sessions.list({ kind: 'cron' }).length, 1)
  assert.equal(
    sessions.list({ kind: 'chat' }).some((item) => item.id === SYSTEM_SESSION_IDS.cron),
    false
  )

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
  assert.equal(
    messages.updateParts(
      assistantMessage.id,
      [{ type: 'plain', text: 'hi' }],
      { status: 'complete' },
      2005
    ),
    true
  )

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
  assert.equal(
    runs.updateStatus(run.id, 'complete', { finishedAt: 2008, usage: { total: 10 } }, 2008),
    true
  )
  assert.equal(runs.get(run.id)?.usage?.total, 10)

  assert.equal(validateCronExpression('*/5 * * * *').length, 0)
  assert.equal(validateCronExpression('* * *').length, 1)
  assert.equal(nextRunAt({ kind: 'at', runAt: 3000 }, 2000), 3000)
  assert.equal(nextRunAt({ kind: 'at', runAt: 1000 }, 2000), undefined)
  assert.equal(
    nextRunAt(
      { kind: 'cron', cronExpression: '*/15 * * * *' },
      new Date(2026, 0, 1, 0, 7).getTime()
    ),
    new Date(2026, 0, 1, 0, 15).getTime()
  )

  const cronTask = cronTasks.save({
    id: 'cron-task-smoke',
    name: 'Cron smoke',
    note: 'Return a smoke result.',
    sourceSessionId: session.id,
    targetSessionId: session.id,
    schedule: { kind: 'at', runAt: 1999 },
    enabled: true,
    state: 'idle',
    nextRunAt: 1999,
    failureCount: 0,
    createdAt: 1990,
    updatedAt: 1990,
  })
  assert.equal(cronTasks.get(cronTask.id)?.name, 'Cron smoke')
  assert.equal(cronTasks.list({ sessionId: session.id }).length, 1)
  assert.equal(cronTasks.findDue(2000).length, 1)
  assert.equal(cronTasks.tryMarkRunning(cronTask.id, 2001)?.runningAt, 2001)
  assert.equal(cronTasks.tryMarkRunning(cronTask.id, 2002), undefined)
  const cronRun = cronRuns.createRunning({
    taskId: cronTask.id,
    reason: 'scheduled',
    scheduledFor: 1999,
    startedAt: 2001,
  })
  assert.equal(
    cronRuns.finish(cronRun.id, {
      status: 'complete',
      completedAt: 2005,
      resultSummary: 'done',
    })?.durationMs,
    4
  )
  cronTasks.save({
    ...cronTask,
    runningAt: undefined,
    lastStatus: 'complete',
    lastCompletedAt: 2005,
    updatedAt: 2005,
  })
  assert.equal(cronRuns.list({ taskId: cronTask.id })[0]?.resultSummary, 'done')

  const manager = new CronManager({
    tasks: cronTasks,
    runs: cronRuns,
    sessions: {
      get: (id) => sessions.get(id),
      getOrCreateCronSession: () => getOrCreateSmokeCronSession(sessions),
    },
    settings: () => ({
      enabled: false,
      misfirePolicy: 'run_once',
      misfireGraceMs: 60_000,
      misfireStartupLimit: 2,
    }),
    executor: {
      async execute({ run }) {
        return { resultSummary: `ran:${run.reason}` }
      },
    },
    maxTimerMs: 5_000,
  })
  const recentPast = manager.create({
    name: 'Recent past',
    note: 'within grace',
    targetSessionId: session.id,
    runAt: Date.now() - 1_000,
  }).task
  assert.ok(recentPast.nextRunAt && recentPast.nextRunAt <= Date.now())
  const autoSessionTask = manager.create({
    name: 'Auto cron session',
    note: 'uses the cron session',
    runAt: Date.now() + 60_000,
  }).task
  assert.equal(autoSessionTask.targetSessionId, SYSTEM_SESSION_IDS.cron)
  assert.equal(autoSessionTask.sourceSessionId, SYSTEM_SESSION_IDS.cron)
  assert.equal((await manager.executeDue(2010)).length, 0)
  const manual = await manager.runNow({ taskId: cronTask.id })
  assert.equal(manual.run.reason, 'manual')
  assert.equal(manual.run.status, 'complete')

  cronTasks.save({
    id: 'cron-task-stale',
    name: 'Stale',
    note: 'stale',
    sourceSessionId: session.id,
    targetSessionId: session.id,
    schedule: { kind: 'cron', cronExpression: '* * * * *' },
    enabled: true,
    state: 'running',
    nextRunAt: 2100,
    runningAt: 2000,
    failureCount: 0,
    createdAt: 2000,
    updatedAt: 2000,
  })
  const staleRun = cronRuns.createRunning({
    taskId: 'cron-task-stale',
    reason: 'scheduled',
    startedAt: 2000,
  })
  manager.start()
  manager.stop()
  assert.equal(cronTasks.get('cron-task-stale')?.runningAt, undefined)
  assert.equal(cronRuns.get(staleRun.id)?.status, 'interrupted')

  console.log('DB smoke check passed')
} finally {
  client.close()
  rmSync(tempDir, { recursive: true, force: true })
}

function getOrCreateSmokeCronSession(sessions: ChatSessionRepo, now = Date.now()): ChatSession {
  const existing = sessions.get(SYSTEM_SESSION_IDS.cron)
  if (existing) {
    return existing
  }
  const session: ChatSession = {
    id: SYSTEM_SESSION_IDS.cron,
    title: '计划任务',
    kind: 'cron',
    status: 'active',
    pinned: false,
    messageCount: 0,
    contextPolicy: {
      mode: 'recent-turns',
      maxMessages: 40,
      includeAttachments: 'current-only',
    },
    metadata: {
      system: 'cron',
    },
    createdAt: now,
    updatedAt: now,
  }
  sessions.save(session)
  return sessions.get(session.id) ?? session
}

import assert from 'node:assert/strict'

import { createBuiltinTools } from '../core/agent/builtin-tools'
import { ContextBuilder } from '../core/chat/context-manager'
import type { AttachmentService } from '../core/chat/attachment-service'
import type { ChatMessageRepo } from '../core/db/repos'
import type { ChatMessage, InternalAttachmentRecord, MessageAttachment } from '../shared/types/chat'
import type { ProviderConfig, ProviderModel } from '../shared/types/provider'

const attachment: InternalAttachmentRecord = {
  id: 'att-1',
  kind: 'text',
  originalName: 'notes.txt',
  storedName: 'notes.txt',
  mimeType: 'text/plain',
  sizeBytes: 32,
  sha256: 'hash',
  storagePath: 'memory',
  extractedText: 'alpha beta gamma beta',
  extractedTextStatus: 'complete',
  createdAt: 1,
  updatedAt: 1,
}

const messages: ChatMessage[] = [
  {
    id: 'user-1',
    sessionId: 'session-1',
    role: 'user',
    status: 'complete',
    parts: [{ type: 'file', attachmentId: 'att-1', filename: 'notes.txt' }],
    createdAt: 1,
    updatedAt: 1,
  },
  {
    id: 'assistant-1',
    sessionId: 'session-1',
    role: 'assistant',
    status: 'complete',
    parts: [
      { type: 'think', think: 'Need current time before answering.' },
      {
        type: 'tool_call',
        tool_calls: [
          {
            id: 'call_time',
            name: 'system_time',
            arguments: {},
            result: '{"local":"today"}',
            status: 'complete',
          },
          {
            id: 'call_running',
            name: 'calculator',
            arguments: { expression: '1+1' },
            status: 'running',
          },
        ],
      },
    ],
    createdAt: 2,
    updatedAt: 2,
  },
]

const attachments = {
  get(id: string) {
    return id === attachment.id ? attachment : undefined
  },
  materializeImageDataUrl() {
    throw new Error('not used')
  },
} as unknown as AttachmentService

const messageRepo = {
  listBySession(sessionId: string) {
    return messages.filter((message) => message.sessionId === sessionId)
  },
  listAttachmentLinks(messageId: string): MessageAttachment[] {
    if (messageId !== 'user-1') return []
    return [{ messageId, attachmentId: 'att-1', partIndex: 0, role: 'input' }]
  },
} as unknown as ChatMessageRepo

await testContextBuilderToolHistory()
await testAttachmentToolsSessionBoundary()

console.log('Agent context smoke check passed')

async function testContextBuilderToolHistory(): Promise<void> {
  const context = await new ContextBuilder(attachments).build({
    session: {
      id: 'session-1',
      title: 'Session',
      status: 'active',
      contextPolicy: { mode: 'recent-turns', maxMessages: 10, includeAttachments: 'never' },
      createdAt: 1,
      updatedAt: 1,
    },
    messages,
    currentUserMessageId: 'user-1',
    provider: provider(),
    model: model(),
  })

  const assistantToolMessage = context.messages.find(
    (message) => message.role === 'assistant' && message.toolCalls?.length
  )
  assert.equal(assistantToolMessage?.reasoningContent, 'Need current time before answering.')
  assert.equal(assistantToolMessage?.toolCalls?.[0]?.id, 'call_time')
  assert.equal(assistantToolMessage?.toolCalls?.[0]?.function.name, 'system_time')
  assert.equal(assistantToolMessage?.toolCalls?.length, 1)
  assert.equal(
    context.messages.filter((message) => message.role === 'assistant' && message.toolCalls?.length)
      .length,
    1
  )
  assert.equal(
    context.messages.some(
      (message) => message.role === 'tool' && message.toolCallId === 'call_time'
    ),
    true
  )
  assert.equal(
    context.messages.some(
      (message) => message.role === 'tool' && message.toolCallId === 'call_running'
    ),
    false
  )
}

async function testAttachmentToolsSessionBoundary(): Promise<void> {
  const tools = createBuiltinTools({
    messages: messageRepo,
    attachments,
    sessionId: 'session-1',
    maxResultChars: 1000,
  })
  const read = tools.find((tool) => tool.name === 'attachment_text_read')
  const search = tools.find((tool) => tool.name === 'attachment_text_search')

  assert.ok(read)
  assert.ok(search)

  const readResult = await read.execute('call_read', { attachmentId: 'att-1' })
  assert.match(
    readResult.content[0]?.type === 'text' ? readResult.content[0].text : '',
    /alpha beta/
  )

  const searchResult = await search.execute('call_search', { query: 'beta' })
  assert.match(
    searchResult.content[0]?.type === 'text' ? searchResult.content[0].text : '',
    /matchCount/
  )

  await assert.rejects(
    () => read.execute('call_denied', { attachmentId: 'att-2' }),
    /not available in the current session/
  )
}

function provider(): ProviderConfig {
  return {
    id: 'provider',
    name: 'Provider',
    api: 'openai-chat-completions',
    baseUrl: 'https://example.test/v1',
    enabled: true,
    models: [],
  }
}

function model(): ProviderModel {
  return {
    id: 'model',
    name: 'Model',
    input: ['text'],
    supportsTools: true,
  }
}

import axios from 'axios'
import MockAdapter from 'axios-mock-adapter'

import type { ChatRecord, MessagePart } from '@/composables/useMessages'

interface MockSession {
  session_id: string
  display_name: string | null
  updated_at: string
  platform_id: string
  creator: string
  is_group: number
  created_at: string
}

const mock = new MockAdapter(axios, { delayResponse: 120, onNoMatch: 'passthrough' })
const sessions: MockSession[] = []
const histories = new Map<string, ChatRecord[]>()
const files = new Map<string, Blob>()

function now() {
  return new Date().toISOString()
}

function createSession(title: string | null = null): MockSession {
  const timestamp = now()
  const session: MockSession = {
    session_id: crypto.randomUUID(),
    display_name: title,
    updated_at: timestamp,
    platform_id: 'webchat',
    creator: 'local',
    is_group: 0,
    created_at: timestamp,
  }

  sessions.unshift(session)
  histories.set(session.session_id, [])
  return session
}

function ensureInitialData() {
  if (sessions.length) return

  const welcome = createSession('默认会话')
  histories.set(welcome.session_id, [
    {
      id: 'welcome-bot',
      created_at: now(),
      content: {
        type: 'bot',
        message: [
          {
            type: 'plain',
            text:
              '欢迎使用 OpenOmniClaw。这个页面正在复刻 AstrBot 的聊天界面：左侧是聊天历史，中间是消息流，底部是输入框。',
          },
        ],
      },
    },
  ])
}

function ok(data: unknown = null) {
  return [200, { status: 'ok', data }]
}

function getSessionIdFromUrl(url?: string) {
  if (!url) return ''
  const parsed = new URL(url, window.location.origin)
  return parsed.searchParams.get('session_id') || ''
}

function normalizeOutgoing(parts: MessagePart[]) {
  return parts.map((part) => {
    if (part.type === 'plain') return { type: 'plain', text: part.text || '' }
    return { ...part }
  })
}

function textFromParts(parts: MessagePart[]) {
  return parts
    .filter((part) => part.type === 'plain')
    .map((part) => part.text || '')
    .join('\n')
    .trim()
}

function sseResponse(events: Array<Record<string, unknown>>, signal?: AbortSignal) {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const event of events) {
        if (signal?.aborted) break
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        await new Promise((resolve) => window.setTimeout(resolve, 12))
      }
      controller.close()
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
    },
  })
}

function installFetchMock() {
  const originalFetch = window.fetch.bind(window)

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const pathname = new URL(url, window.location.origin).pathname

    if (pathname === '/api/chat/send') {
      const body = JSON.parse(String(init?.body || '{}'))
      const sessionId = body.session_id as string
      const parts = normalizeOutgoing(body.message || [])
      const history = histories.get(sessionId) || []
      const userId = crypto.randomUUID()
      const botId = crypto.randomUUID()
      const timestamp = now()
      const userText = textFromParts(parts)
      const reply = `已收到：${userText || '空消息'}\n\n当前是 AstrBot 聊天界面的 Electron 复刻占位流式响应。`

      const userRecord: ChatRecord = {
        id: userId,
        created_at: timestamp,
        content: {
          type: 'user',
          message: parts,
        },
      }
      const botRecord: ChatRecord = {
        id: botId,
        created_at: timestamp,
        content: {
          type: 'bot',
          message: [{ type: 'plain', text: reply }],
        },
      }

      history.push(userRecord, botRecord)
      histories.set(sessionId, history)
      const session = sessions.find((item) => item.session_id === sessionId)
      if (session) {
        session.updated_at = timestamp
        session.display_name ||= userText.slice(0, 40) || '新会话'
      }

      const chunks = reply.match(/.{1,2}/g) || [reply]
      return sseResponse(
        [
          { type: 'user_message_saved', data: userRecord },
          ...chunks.map((chunk) => ({ type: 'plain', data: chunk })),
          { type: 'message_saved', data: botRecord },
          { type: 'end', data: '' },
        ],
        init?.signal,
      )
    }

    if (pathname === '/api/chat/message/regenerate' || pathname === '/api/chat/thread/send') {
      return sseResponse(
        [
          { type: 'plain', data: '这是重新生成的占位回复。' },
          { type: 'end', data: '' },
        ],
        init?.signal,
      )
    }

    return originalFetch(input, init)
  }
}

ensureInitialData()
installFetchMock()

mock.onGet('/api/chat/sessions').reply(() => ok(sessions))
mock.onGet('/api/chat/new_session').reply(() => ok(createSession()))
mock.onGet(/\/api\/chat\/delete_session.*/).reply((config) => {
  const sessionId = getSessionIdFromUrl(config.url)
  const index = sessions.findIndex((session) => session.session_id === sessionId)
  if (index >= 0) sessions.splice(index, 1)
  histories.delete(sessionId)
  return ok()
})
mock.onGet('/api/chat/get_session').reply((config) => {
  const sessionId = String(config.params?.session_id || '')
  return ok({
    history: histories.get(sessionId) || [],
    threads: [],
    project: null,
  })
})
mock.onPost('/api/chat/update_session_display_name').reply((config) => {
  const payload = JSON.parse(config.data || '{}')
  const session = sessions.find((item) => item.session_id === payload.session_id)
  if (session) {
    session.display_name = payload.display_name || null
    session.updated_at = now()
  }
  return ok()
})
mock.onPost('/api/chat/batch_delete_sessions').reply((config) => {
  const payload = JSON.parse(config.data || '{}')
  const ids = new Set<string>(payload.session_ids || [])
  for (let index = sessions.length - 1; index >= 0; index -= 1) {
    if (ids.has(sessions[index].session_id)) {
      histories.delete(sessions[index].session_id)
      sessions.splice(index, 1)
    }
  }
  return ok({ deleted_count: ids.size, failed_count: 0, failed_items: [] })
})
mock.onPost('/api/chat/post_file').reply((config) => {
  const file = (config.data as FormData).get('file') as File | null
  const attachmentId = crypto.randomUUID()
  const filename = file?.name || attachmentId
  const type = file?.type.startsWith('image/') ? 'image' : 'file'
  if (file) files.set(filename, file)
  return ok({ attachment_id: attachmentId, filename, type })
})
mock.onGet('/api/chat/get_file').reply((config) => {
  const filename = String(config.params?.filename || '')
  return [200, files.get(filename) || new Blob([''], { type: 'application/octet-stream' })]
})
mock.onPost('/api/chat/stop').reply(() => ok())
mock.onPost('/api/chat/message/edit').reply((config) => {
  const payload = JSON.parse(config.data || '{}')
  const records = histories.get(payload.session_id) || []
  const record = records.find((item) => String(item.id) === String(payload.message_id))
  if (record) record.content = payload.content
  return ok({ message: record, needs_regenerate: false, truncated_after_message: false })
})
mock.onGet('/api/config/provider/list').reply(() =>
  ok([
    {
      id: 'omniinfer-local',
      model: 'local-small-model',
      enable: true,
      model_metadata: { modalities: { input: ['text', 'image'] }, tool_call: true },
    },
  ]),
)
mock.onGet('/api/config/abconfs').reply(() =>
  ok({ info_list: [{ id: 'default', name: '默认配置' }] }),
)
mock.onGet('/api/config/umo_abconf_routes').reply(() => ok({ routing: {} }))
mock.onGet('/api/config/abconf').reply(() =>
  ok({ config: { provider_settings: { agent_runner_type: 'local' } } }),
)
mock.onPost('/api/config/umo_abconf_route/update').reply(() => ok())
mock.onGet('/api/chatui_project/list').reply(() => ok([]))
mock.onPost('/api/chatui_project/create').reply(() => ok(null))
mock.onPost('/api/chatui_project/update').reply(() => ok(null))
mock.onGet('/api/chatui_project/delete').reply(() => ok(null))
mock.onPost('/api/chatui_project/add_session').reply(() => ok(true))
mock.onPost('/api/chatui_project/remove_session').reply(() => ok(true))
mock.onGet('/api/chatui_project/get_sessions').reply(() => ok([]))
mock.onPost('/api/chat/thread/create').reply(() => ok(null))
mock.onPost('/api/chat/thread/delete').reply(() => ok())
mock.onGet('/api/chat/thread/get').reply(() => ok({ history: [] }))

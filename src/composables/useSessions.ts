import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { appBridge, type BridgeChatSession } from '@/bridge/app'
import { buildWebchatUmoDetails, getStoredSelectedChatConfigId } from '@/utils/chatConfigBinding'
import { useToast } from '@/utils/toast'
import type { ChatSession } from '@shared/types/chat'

export interface Session extends ChatSession {
  /** Compatibility aliases for legacy callers during renderer migration. */
  session_id?: string
  display_name?: string | null
  updated_at?: string
  platform_id?: string
  creator?: string
  is_group?: number
  created_at?: string
}

export interface BatchDeleteFailedItem {
  session_id: string
  reason: string
}

export interface BatchDeleteResult {
  deleted_count: number
  failed_count: number
  failed_items: BatchDeleteFailedItem[]
  currentSessionDeleted: boolean
}

export interface NewSessionOptions {
  navigate?: boolean
}

export function useSessions(chatboxMode: boolean = false) {
  const router = useRouter()
  const toast = useToast()
  const sessions = ref<Session[]>([])
  const selectedSessions = ref<string[]>([])
  const currSessionId = ref('')
  const pendingSessionId = ref<string | null>(null)
  // 编辑标题相关
  const editTitleDialog = ref(false)
  const editingTitle = ref('')
  const editingSessionId = ref('')

  const getCurrentSession = computed(() => {
    if (!currSessionId.value) return null
    return sessions.value.find((s) => s.id === currSessionId.value)
  })

  async function getSessions() {
    try {
      const bridgeSessions = await appBridge.chat.listSessions()
      sessions.value = bridgeSessions.map(mapBridgeSession)
    } catch (err: any) {
      console.error(err)
      toast.error(err, { description: '会话列表加载失败' })
    }
  }

  async function newSession(options: NewSessionOptions = {}) {
    try {
      const { navigate = true } = options
      const selectedConfigId = getStoredSelectedChatConfigId()
      const session = await appBridge.chat.createSession()
      const sessionId = session.id
      const platformId = 'webchat'

      currSessionId.value = sessionId

      if (selectedConfigId && selectedConfigId !== 'default' && platformId === 'webchat') {
        try {
          const umoDetails = buildWebchatUmoDetails(sessionId, false)
          await appBridge.chat.updateSession?.(sessionId, {
            metadata: {
              umo: umoDetails.umo,
              configId: selectedConfigId,
            },
          } as Partial<BridgeChatSession>)
        } catch (err) {
          console.error('Failed to bind config to session', err)
          toast.error(err, { description: '会话配置绑定失败' })
        }
      }

      if (navigate) {
        const basePath = chatboxMode ? '/chatbox' : '/chat'
        await router.push(`${basePath}/${sessionId}`)
      }

      await getSessions()

      // 确保新创建的会话被选中高亮
      selectedSessions.value = [sessionId]

      return sessionId
    } catch (err) {
      console.error(err)
      toast.error(err, { description: '新建会话失败' })
      throw err
    }
  }

  async function deleteSession(sessionId: string) {
    try {
      const wasCurrent = sessionId === currSessionId.value
      await appBridge.chat.deleteSession?.(sessionId)
      await getSessions()
      if (wasCurrent) {
        currSessionId.value = ''
        selectedSessions.value = []
      }
      return true
    } catch (err) {
      console.error(err)
      toast.error(err, { description: '删除会话失败' })
      return false
    }
  }

  async function batchDeleteSessions(sessionIds: string[]): Promise<BatchDeleteResult> {
    try {
      const currentSessionId = currSessionId.value
      const failedItems: BatchDeleteFailedItem[] = []

      for (const sessionId of sessionIds) {
        try {
          await appBridge.chat.deleteSession?.(sessionId)
        } catch (err) {
          failedItems.push({
            session_id: sessionId,
            reason: err instanceof Error ? err.message : String(err),
          })
        }
      }

      const failedSessionIds = new Set(failedItems.map((item) => item.session_id))
      const currentSessionDeleted = Boolean(
        currentSessionId &&
          sessionIds.includes(currentSessionId) &&
          !failedSessionIds.has(currentSessionId)
      )

      if (currentSessionDeleted) {
        currSessionId.value = ''
        selectedSessions.value = []
      }
      await getSessions()

      return {
        deleted_count: sessionIds.length - failedItems.length,
        failed_count: failedItems.length,
        failed_items: failedItems,
        currentSessionDeleted,
      }
    } catch (err) {
      console.error(err)
      toast.error(err, { description: '批量删除会话失败' })
      throw err
    }
  }

  function showEditTitleDialog(sessionId: string, title: string) {
    editingSessionId.value = sessionId
    editingTitle.value = title || ''
    editTitleDialog.value = true
  }

  async function saveTitle() {
    if (!editingSessionId.value) return

    const trimmedTitle = editingTitle.value.trim()
    try {
      const updated = appBridge.chat.updateSessionTitle
        ? await appBridge.chat.updateSessionTitle(editingSessionId.value, trimmedTitle)
        : await appBridge.chat.updateSession?.(editingSessionId.value, { title: trimmedTitle })

      // 更新本地会话标题
      const session = sessions.value.find((s) => s.id === editingSessionId.value)
      if (session) {
        Object.assign(
          session,
          mapBridgeSession(
            updated || {
              id: editingSessionId.value,
              title: trimmedTitle,
              status: 'active',
              createdAt: Date.now(),
              updatedAt: Date.now(),
            }
          )
        )
      }
      editTitleDialog.value = false
    } catch (err) {
      console.error('重命名会话失败:', err)
      toast.error(err, { description: '重命名会话失败' })
    }
  }

  function applySessionTitle(sessionId: string, title: string) {
    const session = sessions.value.find((s) => s.id === sessionId)
    if (session) {
      session.title = title
      session.display_name = title
    }
  }

  async function updateSessionTitle(sessionId: string, title: string) {
    const trimmedTitle = title.trim()
    const updated = appBridge.chat.updateSessionTitle
      ? await appBridge.chat.updateSessionTitle(sessionId, trimmedTitle)
      : await appBridge.chat.updateSession?.(sessionId, { title: trimmedTitle })

    if (updated) {
      const session = sessions.value.find((s) => s.id === sessionId)
      if (session) {
        Object.assign(session, mapBridgeSession(updated))
      }
    } else {
      applySessionTitle(sessionId, trimmedTitle)
    }
  }

  function newChat(closeMobileSidebar?: () => void) {
    currSessionId.value = ''
    selectedSessions.value = []

    const basePath = chatboxMode ? '/chatbox' : '/'
    router.push(basePath)

    if (closeMobileSidebar) {
      closeMobileSidebar()
    }
  }

  return {
    sessions,
    selectedSessions,
    currSessionId,
    pendingSessionId,
    editTitleDialog,
    editingTitle,
    editingSessionId,
    getCurrentSession,
    getSessions,
    newSession,
    deleteSession,
    batchDeleteSessions,
    showEditTitleDialog,
    saveTitle,
    applySessionTitle,
    updateSessionTitle,
    newChat,
  }
}

function mapBridgeSession(session: BridgeChatSession): Session {
  const createdAt = new Date(session.createdAt || Date.now()).toISOString()
  const updatedAt = new Date(session.updatedAt || session.lastMessageAt || Date.now()).toISOString()

  return {
    ...session,
    id: session.id,
    title: session.title || '',
    status: session.status || 'active',
    createdAt: session.createdAt || Date.now(),
    updatedAt: session.updatedAt || session.lastMessageAt || Date.now(),
    session_id: session.id,
    display_name: session.title || null,
    updated_at: updatedAt,
    platform_id: 'webchat',
    creator: 'user',
    is_group: 0,
    created_at: createdAt,
  }
}

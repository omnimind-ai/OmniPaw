import type { Session, ToolProfile } from '@shared/types/chat'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { appBridge } from '@/bridge/app'

export interface PendingInitialMessagePart {
  type: string
  [key: string]: unknown
}

export interface PendingInitialMessage {
  sessionId: string
  messageId: string
  parts: PendingInitialMessagePart[]
  selectedProvider: string
  selectedModel: string
  toolProfile?: ToolProfile
}

const SIDEBAR_STATE_COOKIE = 'sidebar_state'

function getInitialSidebarOpen(): boolean {
  if (typeof document === 'undefined') return true
  return !document.cookie.includes(`${SIDEBAR_STATE_COOKIE}=false`)
}

export const useChatStore = defineStore('chat', () => {
  const sessions = ref<Session[]>([])
  const activeSessionId = ref<string>()
  const pendingInitialMessage = ref<PendingInitialMessage | null>(null)
  const draft = ref('')
  const streamingText = ref('')
  const isStreaming = ref(false)
  const sidebarOpen = ref(getInitialSidebarOpen())

  const activeSession = computed(() =>
    sessions.value.find((session) => session.id === activeSessionId.value)
  )

  async function loadSessions(): Promise<void> {
    sessions.value = await appBridge.chat.listSessions()
    activeSessionId.value ??= sessions.value[0]?.id
  }

  async function createSession(): Promise<void> {
    const session = await appBridge.chat.createSession()
    sessions.value.unshift(session)
    activeSessionId.value = session.id
  }

  async function sendDraft(): Promise<void> {
    const content = draft.value.trim()

    if (!content || !activeSessionId.value || isStreaming.value) {
      return
    }

    draft.value = ''
    streamingText.value = ''
    isStreaming.value = true

    await appBridge.chat.sendMessage({
      sessionId: activeSessionId.value,
      content,
    })
  }

  function appendToken(token: string): void {
    streamingText.value += token
  }

  function finishStream(): void {
    isStreaming.value = false
  }

  function setSidebarOpen(open: boolean): void {
    sidebarOpen.value = open
  }

  function setPendingInitialMessage(message: PendingInitialMessage): void {
    pendingInitialMessage.value = message
  }

  function consumePendingInitialMessage(sessionId: string): PendingInitialMessage | null {
    if (pendingInitialMessage.value?.sessionId !== sessionId) {
      return null
    }

    const message = pendingInitialMessage.value
    pendingInitialMessage.value = null
    return message
  }

  return {
    sessions,
    activeSessionId,
    pendingInitialMessage,
    activeSession,
    draft,
    streamingText,
    isStreaming,
    sidebarOpen,
    loadSessions,
    createSession,
    sendDraft,
    appendToken,
    finishStream,
    setSidebarOpen,
    setPendingInitialMessage,
    consumePendingInitialMessage,
  }
})

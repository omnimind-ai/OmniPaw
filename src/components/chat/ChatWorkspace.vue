<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { appBridge } from '@/bridge/app'
import ChatSidebar from '@/components/ChatSidebar.vue'
import { contentText } from '@/components/chat/chat-display'
import {
  chatWorkspaceContextKey,
  type MessageScrollAreaRef,
} from '@/components/chat/chat-workspace-context'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { useDelayedFlag } from '@/composables/useDelayedFlag'
import { ATTACHMENT_LIMITS, formatBytes, useMediaHandling } from '@/composables/useMediaHandling'
import {
  type ChatRecord,
  type MessagePart,
  messageBlocks,
  useMessages,
} from '@/composables/useMessages'
import { useSessions } from '@/composables/useSessions'
import { useChatStore } from '@/stores/chat'
import { type ProviderModelOption, useProviderStore } from '@/stores/provider'
import { copyToClipboard } from '@/utils/clipboard'
import { logger } from '@/utils/logger'
import { useToast } from '@/utils/toast'

const router = useRouter()
const route = useRoute()
const chatStore = useChatStore()
const providerStore = useProviderStore()
const toast = useToast()
const chatWorkspaceLogger = logger.child('chat.workspace')
const {
  defaultModelKey,
  enabledModelOptions,
  loading: providersLoading,
} = storeToRefs(providerStore)

const {
  sessions,
  selectedSessions,
  currSessionId,
  getCurrentSession,
  getSessions,
  newSession,
  deleteSession,
  updateSessionTitle,
} = useSessions(false)

const {
  stagedFiles,
  stagedUploadItems,
  uploadPending,
  uploadFiles,
  handlePaste,
  removeImage,
  removeFile,
  removeUploadItem,
  clearStaged,
  cleanupMediaCache,
} = useMediaHandling()

const {
  activeMessages,
  loadingMessages,
  sending,
  runningSessionIds,
  createLocalExchange,
  sendMessageStream,
  editMessage,
  continueEditedMessage,
  regenerateMessage,
  stopSession,
  isSessionRunning,
  isUserMessage,
  isMessageStreaming,
  messageContent,
  loadSessionMessages,
} = useMessages({
  currentSessionId: currSessionId,
  onSessionsChanged: getSessions,
  onStreamUpdate: (sessionId) => {
    if (sessionId === currSessionId.value) scheduleScrollToLatest()
  },
})

const draft = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const messagesScrollArea = ref<MessageScrollAreaRef>(null)
const creatingSession = ref(false)
const selectedModelKey = ref('')
const syncedModelSessionId = ref<string | null>(null)
const replyTarget = ref<{ messageId: string; preview: string } | null>(null)
const highlightedMessageId = ref('')
const followingLatestMessage = ref(true)
const showScrollToBottom = ref(false)
const bottomFollowThreshold = 48

let messagesScrollViewport: HTMLElement | null = null
let autoScrollFrame = 0
let programmaticScrollUntil = 0
let scrollStateTimer = 0
let stopSessionChanged: (() => void) | undefined

const isHomeMode = computed(() => route.name !== 'chat')
const hasMessages = computed(() => activeMessages.value.length > 0)
const showWelcome = computed(() => isHomeMode.value && !hasMessages.value && !loadingMessages.value)
const showMessageList = computed(
  () => !isHomeMode.value && (hasMessages.value || loadingMessages.value)
)
const showMessageSkeleton = useDelayedFlag(
  () => !isHomeMode.value && loadingMessages.value && !hasMessages.value
)
const currentSessionRunning = computed(() =>
  currSessionId.value ? isSessionRunning(currSessionId.value) : false
)
const defaultModelOption = computed(() => {
  const options = enabledModelOptions.value
  if (!options.length) return undefined

  if (defaultModelKey.value) {
    const matched = options.find((option) => option.key === defaultModelKey.value)
    if (matched) return matched
  }

  return options[0]
})
const selectedModel = computed(
  () =>
    enabledModelOptions.value.find((option) => option.key === selectedModelKey.value) ??
    defaultModelOption.value
)
const selectedModelLabel = computed(() => {
  if (providersLoading.value) return '加载模型中'
  if (!selectedModel.value) return '未配置模型'
  return selectedModel.value.modelName
})
const selectedModelMeta = computed(() => {
  if (!selectedModel.value) return ''
  return selectedModel.value.providerName
})
const canSend = computed(
  () =>
    !sending.value &&
    !currentSessionRunning.value &&
    !uploadPending.value &&
    Boolean(selectedModel.value) &&
    !attachmentWarning.value &&
    Boolean(draft.value.trim() || stagedFiles.value.length || replyTarget.value)
)
const replyPreview = computed(() => replyTarget.value?.preview || '')
const attachmentWarning = computed(() => {
  if (!stagedFiles.value.length) return ''
  if (stagedFiles.value.length > ATTACHMENT_LIMITS.maxFilesPerMessage) {
    return `每条消息最多添加 ${ATTACHMENT_LIMITS.maxFilesPerMessage} 个附件。`
  }
  const oversized = stagedFiles.value.find(
    (file) => Number(file.size || 0) > ATTACHMENT_LIMITS.maxFileBytes
  )
  if (oversized) {
    return `${oversized.filename} 超过 ${formatBytes(ATTACHMENT_LIMITS.maxFileBytes)}。`
  }
  const unsupported = stagedFiles.value.find((file) => !modelSupportsAttachment(file.type))
  if (unsupported) {
    return `${selectedModel.value?.modelName || '当前模型'} 不支持${attachmentTypeLabel(unsupported.type)}输入。`
  }
  return ''
})

provide(chatWorkspaceContextKey, {
  showWelcome,
  activeMessages,
  showMessageList,
  showMessageSkeleton,
  highlightedMessageId,
  showScrollToBottom,
  draft,
  stagedFiles,
  stagedUploadItems,
  uploadPending,
  enabledModelOptions,
  providersLoading,
  selectedModel,
  selectedModelKey,
  selectedModelLabel,
  selectedModelMeta,
  currentSessionRunning,
  sending,
  attachmentWarning,
  canSend,
  replyPreview,
  fileInput,
  setMessagesScrollArea,
  scrollToLatestMessage,
  openSettings,
  openFilePicker,
  handleFileInputChange,
  handleFilesDropped,
  removeStagedFile,
  removeUploadAt,
  handleModelChange,
  handlePaste,
  handleSubmit,
  handleStop,
  handleCopyMessage,
  handleCopyCode,
  handleEditMessage,
  handleContinueMessage,
  handleRegenerateMessage,
  handleQuoteMessage,
  clearReply,
  handleJumpMessage,
  isUserMessage,
  isMessageStreaming,
  messageContent,
  messageBlocks,
})

watch(
  () => route.params.conversationId,
  async () => {
    const sessionId = routeSessionId()
    currSessionId.value = sessionId
    selectedSessions.value = sessionId ? [sessionId] : []
    chatStore.activeSessionId = sessionId || undefined

    if (sessionId) {
      await loadSessionMessages(sessionId)
      await consumePendingInitialMessage(sessionId)
    }
  },
  { immediate: true }
)

watch(
  [enabledModelOptions, defaultModelKey, () => currSessionId.value, () => sessions.value],
  () => syncSelectedModel(),
  { deep: true, immediate: true }
)

watch(draft, (value) => {
  chatStore.draft = value
})

watch(
  () => currSessionId.value,
  (sessionId) => {
    chatStore.activeSessionId = sessionId || undefined
    followingLatestMessage.value = true
    showScrollToBottom.value = false
  },
  { immediate: true }
)

watch(
  () => [isHomeMode.value, showMessageList.value],
  async () => {
    await nextTick()
    attachMessageScrollViewport()
    if (!isHomeMode.value) scheduleScrollToLatest('auto', true)
  },
  { flush: 'post' }
)

watch(
  () => [currSessionId.value, activeMessages.value.length, loadingMessages.value],
  async () => {
    await nextTick()
    attachMessageScrollViewport()
    scheduleScrollToLatest()
  },
  { flush: 'post' }
)

onMounted(async () => {
  stopSessionChanged = appBridge.chat.onSessionChanged?.((event) => {
    if (!event.sessionId) return
    void getSessions()
  })

  await nextTick()
  attachMessageScrollViewport()
  scheduleScrollToLatest('auto', true)

  const results = await Promise.allSettled([getSessions(), providerStore.loadProviders()])
  results.forEach((result) => {
    if (result.status === 'rejected') {
      toast.error(result.reason, { description: '聊天数据加载失败' })
    }
  })
  syncSelectedModel()
})

onBeforeUnmount(() => {
  stopSessionChanged?.()
  stopSessionChanged = undefined
  detachMessageScrollViewport()
  if (autoScrollFrame) {
    cancelAnimationFrame(autoScrollFrame)
    autoScrollFrame = 0
  }
  if (scrollStateTimer) {
    window.clearTimeout(scrollStateTimer)
    scrollStateTimer = 0
  }
  clearStaged()
  cleanupMediaCache()
})

function messageScrollRoot() {
  const value = messagesScrollArea.value
  if (!value) return null
  if (value instanceof HTMLElement) return value
  if ('$el' in value) {
    return value.$el instanceof HTMLElement ? value.$el : null
  }
  return null
}

function setMessagesScrollArea(value: MessageScrollAreaRef) {
  if (!value) {
    detachMessageScrollViewport()
    messagesScrollArea.value = null
    return
  }

  messagesScrollArea.value = value
  void nextTick(() => attachMessageScrollViewport())
}

function resolveMessageScrollViewport() {
  return (
    messageScrollRoot()?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]') ?? null
  )
}

function attachMessageScrollViewport() {
  const nextViewport = resolveMessageScrollViewport()
  if (nextViewport === messagesScrollViewport) {
    updateScrollFollowState()
    return
  }

  detachMessageScrollViewport()
  messagesScrollViewport = nextViewport
  messagesScrollViewport?.addEventListener('scroll', updateScrollFollowState, { passive: true })
  updateScrollFollowState()
}

function detachMessageScrollViewport() {
  messagesScrollViewport?.removeEventListener('scroll', updateScrollFollowState)
  messagesScrollViewport = null
}

function isNearMessageBottom(viewport: HTMLElement) {
  return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= bottomFollowThreshold
}

function updateScrollFollowState() {
  const viewport = messagesScrollViewport
  if (!viewport) {
    followingLatestMessage.value = true
    showScrollToBottom.value = false
    return
  }

  const nearBottom = isNearMessageBottom(viewport)
  if (!nearBottom && performance.now() < programmaticScrollUntil) return

  followingLatestMessage.value = nearBottom
  showScrollToBottom.value = hasMessages.value && !nearBottom
  if (nearBottom) programmaticScrollUntil = 0
}

function scheduleScrollToLatest(behavior: ScrollBehavior = 'auto', force = false) {
  if (isHomeMode.value || (!force && !followingLatestMessage.value)) {
    updateScrollFollowState()
    return
  }

  if (autoScrollFrame) cancelAnimationFrame(autoScrollFrame)
  autoScrollFrame = requestAnimationFrame(() => {
    autoScrollFrame = requestAnimationFrame(() => {
      autoScrollFrame = 0
      scrollToLatestMessage(behavior, force)
    })
  })
}

function scrollToLatestMessage(behavior: ScrollBehavior = 'smooth', force = true) {
  attachMessageScrollViewport()
  const viewport = messagesScrollViewport
  if (!viewport || (!force && !followingLatestMessage.value)) return

  programmaticScrollUntil = performance.now() + (behavior === 'smooth' ? 1200 : 120)
  followingLatestMessage.value = true
  showScrollToBottom.value = false
  viewport.scrollTo({
    top: viewport.scrollHeight,
    behavior,
  })

  if (scrollStateTimer) window.clearTimeout(scrollStateTimer)
  scrollStateTimer = window.setTimeout(
    () => {
      scrollStateTimer = 0
      updateScrollFollowState()
    },
    behavior === 'smooth' ? 350 : 0
  )
}

function routeSessionId() {
  const param = route.params.conversationId
  if (Array.isArray(param)) return param[0] || ''
  return param || ''
}

function syncSelectedModel() {
  const options = enabledModelOptions.value
  if (!options.length) {
    selectedModelKey.value = ''
    syncedModelSessionId.value = null
    return
  }

  const currentKeyIsValid = options.some((option) => option.key === selectedModelKey.value)
  const session = getCurrentSession.value

  if (!currSessionId.value) {
    syncedModelSessionId.value = null
    if (!currentKeyIsValid || !selectedModelKey.value) {
      selectedModelKey.value = defaultModelOption.value?.key || ''
    }
    return
  }

  if (session) {
    const providerId = session.providerId || session.defaultProviderId
    const modelId = session.modelId || session.defaultModelId
    const sessionOption = options.find(
      (option) => option.providerId === providerId && option.modelId === modelId
    )

    selectedModelKey.value = sessionOption?.key || defaultModelOption.value?.key || options[0].key
    syncedModelSessionId.value = currSessionId.value
    return
  }

  if (!currentKeyIsValid) {
    selectedModelKey.value = defaultModelOption.value?.key || options[0].key
  }
}

async function handleNewChat() {
  currSessionId.value = ''
  selectedSessions.value = []
  chatStore.activeSessionId = undefined
  syncedModelSessionId.value = null
  draft.value = ''
  chatStore.draft = ''
  replyTarget.value = null
  clearStaged()
  syncSelectedModel()
  await router.push('/')
}

async function handleSelectSession(sessionId: string) {
  if (sessionId === currSessionId.value) return
  currSessionId.value = sessionId
  selectedSessions.value = [sessionId]
  chatStore.activeSessionId = sessionId
  syncedModelSessionId.value = null
  await router.push(`/chat/${sessionId}`)
}

async function openSettings() {
  await router.push('/settings')
}

async function toggleCatVisibility() {
  try {
    await appBridge.cat.toggleVisibility()
  } catch (error) {
    toast.error(error, { description: '切换小猫失败' })
  }
}

function openFilePicker() {
  fileInput.value?.click()
}

async function handleFileInputChange(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])

  await uploadFiles(files)

  input.value = ''
}

async function handleFilesDropped(files: File[]) {
  await uploadFiles(files)
}

function removeStagedFile(index: number) {
  const target = stagedFiles.value[index]
  if (!target) return

  let typedIndex = -1
  for (let i = 0; i <= index; i += 1) {
    const item = stagedFiles.value[i]
    if (!item) continue
    if (target.type === 'image') {
      if (item.type === 'image') typedIndex += 1
    } else if (item.type !== 'image') {
      typedIndex += 1
    }
  }

  if (target.type === 'image') {
    removeImage(typedIndex)
  } else {
    removeFile(typedIndex)
  }
}

function removeUploadAt(index: number) {
  removeUploadItem(index)
}

async function handleModelChange(value: unknown) {
  const option = enabledModelOptions.value.find((item) => item.key === value)
  if (!option) return
  await selectModel(option)
}

async function selectModel(option: ProviderModelOption) {
  selectedModelKey.value = option.key

  if (!currSessionId.value) return

  try {
    await providerStore.setSessionModel({
      sessionId: currSessionId.value,
      providerId: option.providerId,
      modelId: option.modelId,
    })

    const session = getCurrentSession.value
    if (session) {
      session.providerId = option.providerId
      session.defaultProviderId = option.providerId
      session.modelId = option.modelId
      session.defaultModelId = option.modelId
    }
  } catch (error) {
    chatWorkspaceLogger.warn('Failed to persist selected model.', {
      sessionId: currSessionId.value,
      providerId: option.providerId,
      modelId: option.modelId,
      error,
    })
    toast.error(error, { description: '会话模型保存失败' })
  }
}

async function handleSubmit() {
  if (!canSend.value) return

  const messageId = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`
  const parts = buildOutgoingParts()
  if (!parts.length) return

  sending.value = true

  try {
    const sessionId = currSessionId.value || (await newSession({ navigate: !isHomeMode.value }))
    currSessionId.value = sessionId
    selectedSessions.value = [sessionId]
    chatStore.activeSessionId = sessionId

    if (selectedModel.value) {
      await selectModel(selectedModel.value)
    }

    if (isHomeMode.value) {
      chatStore.setPendingInitialMessage({
        sessionId,
        messageId,
        parts,
        selectedProvider: selectedModel.value?.providerId || '',
        selectedModel: selectedModel.value?.modelId || '',
      })

      draft.value = ''
      chatStore.draft = ''
      clearStaged()
      replyTarget.value = null
      await router.push(`/chat/${sessionId}`)
      return
    }

    const { userRecord, botRecord } = createLocalExchange({
      sessionId,
      messageId,
      parts,
    })

    draft.value = ''
    chatStore.draft = ''
    clearStaged()
    replyTarget.value = null

    await sendMessageStream({
      sessionId,
      messageId,
      parts,
      transport: 'sse',
      selectedProvider: selectedModel.value?.providerId || '',
      selectedModel: selectedModel.value?.modelId || '',
      enableStreaming: true,
      userRecord,
      botRecord,
    })
  } finally {
    sending.value = false
  }
}

async function consumePendingInitialMessage(sessionId: string) {
  if (isHomeMode.value) return

  const pending = chatStore.consumePendingInitialMessage(sessionId)
  if (!pending || isSessionRunning(sessionId)) return

  const { userRecord, botRecord } = createLocalExchange({
    sessionId,
    messageId: pending.messageId,
    parts: pending.parts as MessagePart[],
  })

  await sendMessageStream({
    sessionId,
    messageId: pending.messageId,
    parts: pending.parts as MessagePart[],
    transport: 'sse',
    selectedProvider: pending.selectedProvider,
    selectedModel: pending.selectedModel,
    enableStreaming: true,
    userRecord,
    botRecord,
  })
}

function buildOutgoingParts(): MessagePart[] {
  const parts: MessagePart[] = []
  const text = draft.value.trim()

  if (replyTarget.value) {
    parts.push({
      type: 'reply',
      messageId: replyTarget.value.messageId,
      message_id: replyTarget.value.messageId,
      selectedText: replyTarget.value.preview,
      selected_text: replyTarget.value.preview,
    })
  }

  if (text) {
    parts.push({ type: 'plain', text })
  }

  for (const file of stagedFiles.value) {
    parts.push({
      type: file.type,
      attachmentId: file.attachmentId,
      attachment_id: file.attachment_id || file.attachmentId,
      filename: file.filename,
    })
  }

  return parts
}

async function handleStop() {
  if (!currSessionId.value) return
  try {
    await stopSession(currSessionId.value)
  } catch (error) {
    toast.error(error, { description: '停止生成失败' })
  }
}

async function handleCopyMessage(record: ChatRecord) {
  const ok = await copyToClipboard(contentText(messageContent(record)))
  if (!ok) {
    toast.error('复制失败', { description: '无法写入剪贴板' })
  }
}

function handleCopyCode() {
  toast.success('已复制代码')
}

async function handleEditMessage(record: ChatRecord, text: string) {
  if (!currSessionId.value) return
  try {
    const result = await editMessage(currSessionId.value, record, text)
    if (result.needsRegenerate) {
      toast.info('消息已更新', { description: '可继续生成新的回复' })
    }
  } catch (error) {
    toast.error(error, { description: '编辑消息失败' })
  }
}

async function handleContinueMessage(record: ChatRecord) {
  if (!currSessionId.value || !selectedModel.value) return
  try {
    await continueEditedMessage({
      sessionId: currSessionId.value,
      sourceRecord: record,
      selectedProvider: selectedModel.value.providerId,
      selectedModel: selectedModel.value.modelId,
      enableStreaming: true,
    })
  } catch (error) {
    toast.error(error, { description: '继续生成失败' })
  }
}

async function handleRegenerateMessage(record: ChatRecord) {
  if (!currSessionId.value || !selectedModel.value) return
  try {
    await regenerateMessage(
      currSessionId.value,
      record,
      selectedModel.value.providerId,
      selectedModel.value.modelId
    )
  } catch (error) {
    toast.error(error, { description: '重新生成失败' })
  }
}

function handleQuoteMessage(record: ChatRecord, text: string) {
  const messageId = record.id == null ? '' : String(record.id)
  if (!messageId) return
  const preview = text.trim() || contentText(messageContent(record)).slice(0, 240)
  if (!preview) return
  replyTarget.value = {
    messageId,
    preview,
  }
}

function clearReply() {
  replyTarget.value = null
}

async function handleJumpMessage(messageId: string) {
  highlightedMessageId.value = messageId
  await new Promise((resolve) => requestAnimationFrame(resolve))
  document.getElementById(`message-${messageId}`)?.scrollIntoView({
    block: 'center',
    behavior: 'smooth',
  })
  window.setTimeout(() => {
    if (highlightedMessageId.value === messageId) highlightedMessageId.value = ''
  }, 1600)
}

async function handleRenameSession(sessionId: string, title: string) {
  try {
    await updateSessionTitle(sessionId, title)
    await getSessions()
  } catch (error) {
    toast.error(error, { description: '重命名会话失败' })
  }
}

async function handleDeleteSession(sessionId: string) {
  const deletingCurrentSession = sessionId === currSessionId.value
  try {
    const deleted = await deleteSession(sessionId)
    if (!deleted) return
    if (deletingCurrentSession) {
      currSessionId.value = ''
      selectedSessions.value = []
      chatStore.activeSessionId = undefined
      await router.push('/')
    }
  } catch (error) {
    toast.error(error, { description: '删除会话失败' })
  }
}

function modelSupportsAttachment(type: string) {
  if (type === 'image') return Boolean(selectedModel.value?.input.includes('image'))
  if (type === 'record') return Boolean(selectedModel.value?.input.includes('audio'))
  if (type === 'file')
    return Boolean(
      selectedModel.value?.input.includes('file') || selectedModel.value?.input.includes('text')
    )
  if (type === 'video') return false
  return true
}

function attachmentTypeLabel(type: string) {
  if (type === 'image') return '图片'
  if (type === 'record') return '音频'
  if (type === 'video') return '视频'
  return '文件'
}
</script>

<template>
  <SidebarProvider
    :open="chatStore.sidebarOpen"
    @update:open="chatStore.setSidebarOpen"
  >
    <ChatSidebar
      :sessions="sessions"
      :active-session-id="currSessionId"
      :creating="creatingSession"
      :running-session-ids="runningSessionIds"
      @new-chat="handleNewChat"
      @select-session="handleSelectSession"
      @open-settings="openSettings"
      @toggle-cat="toggleCatVisibility"
      @rename-session="handleRenameSession"
      @delete-session="handleDeleteSession"
    />

    <SidebarInset class="h-svh overflow-hidden">
      <header class="flex h-12 shrink-0 items-center border-b px-3 md:hidden">
        <SidebarTrigger />
      </header>

      <main class="flex min-h-0 flex-1 flex-col bg-background">
        <RouterView />
      </main>
    </SidebarInset>
  </SidebarProvider>
</template>

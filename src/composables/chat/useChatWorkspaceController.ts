import { isComplexDocumentAttachment } from '@shared/attachment-documents'
import type { ToolProfile } from '@shared/types/chat'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { appBridge } from '@/bridge/app'
import { contentText } from '@/components/chat/chat-display'
import type { ChatWorkspaceContext } from '@/components/chat/chat-workspace-context'
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
import { useSettingsStore } from '@/stores/settings'
import { copyToClipboard } from '@/utils/clipboard'
import { useToast } from '@/utils/toast'

import { useChatWorkspaceModel } from './useChatWorkspaceModel'
import { useChatWorkspaceScroll } from './useChatWorkspaceScroll'

export function useChatWorkspaceController() {
  const router = useRouter()
  const route = useRoute()
  const chatStore = useChatStore()
  const settingsStore = useSettingsStore()
  const toast = useToast()
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

  const media = useMediaHandling()
  const draft = ref(chatStore.draft || '')
  const fileInput = ref<HTMLInputElement | null>(null)
  const creatingSession = ref(false)
  const toolProfileSaving = ref(false)
  const replyTarget = ref<{ messageId: string; preview: string } | null>(null)
  const highlightedMessageId = ref('')
  const messages = useMessages({
    currentSessionId: currSessionId,
    onSessionsChanged: getSessions,
    onStreamUpdate: handleStreamUpdate,
    onContextUsageUpdate: chatStore.updateContextUsageFromStreamEvent,
    onMessagesLoaded: chatStore.updateContextUsageFromMessages,
  })

  const isHomeMode = computed(() => route.name !== 'chat')
  const hasMessages = computed(() => messages.activeMessages.value.length > 0)
  const showWelcome = computed(
    () => isHomeMode.value && !hasMessages.value && !messages.loadingMessages.value
  )
  const showMessageList = computed(
    () => !isHomeMode.value && (hasMessages.value || messages.loadingMessages.value)
  )
  const showMessageSkeleton = useDelayedFlag(
    () => !isHomeMode.value && messages.loadingMessages.value && !hasMessages.value
  )

  const scroll = useChatWorkspaceScroll({ isHomeMode, hasMessages })
  const model = useChatWorkspaceModel({
    currSessionId,
    sessions,
    getCurrentSession,
  })

  const currentSessionRunning = computed(() =>
    currSessionId.value ? messages.isSessionRunning(currSessionId.value) : false
  )
  const attachmentWarning = computed(() => {
    if (!media.stagedFiles.value.length) return ''
    if (media.stagedFiles.value.length > ATTACHMENT_LIMITS.maxFilesPerMessage) {
      return `每条消息最多添加 ${ATTACHMENT_LIMITS.maxFilesPerMessage} 个附件。`
    }
    const oversized = media.stagedFiles.value.find(
      (file) => Number(file.size || 0) > ATTACHMENT_LIMITS.maxFileBytes
    )
    if (oversized) {
      return `${oversized.filename} 超过 ${formatBytes(ATTACHMENT_LIMITS.maxFileBytes)}。`
    }
    const complexDocument = media.stagedFiles.value.find((file) =>
      isComplexDocumentAttachment({
        filename: file.filename,
        originalName: file.original_name,
        mimeType: file.mimeType,
      })
    )
    if (complexDocument) {
      const tools = settingsStore.draft?.tools ?? settingsStore.config?.tools
      if (
        tools?.workspace?.maxFileBytes &&
        Number(complexDocument.size || 0) > tools.workspace.maxFileBytes
      ) {
        return `${complexDocument.filename} 超过 workspace 文件限制 ${formatBytes(tools.workspace.maxFileBytes)}。`
      }
      if (agentToolProfile.value === 'minimal') {
        return '最小工具模式无法读取 Office 文档，请切换到助手或高级权限。'
      }
      if (model.selectedModel.value?.toolCallingDisabled) {
        return `${model.selectedModel.value.modelName} 当前配置不支持工具调用，无法读取 Office 文档。`
      }
      if (tools?.workspace?.enabled === false) {
        return 'Workspace 能力已关闭，无法安全提供 Office 文档路径给 Agent。'
      }
      if (tools?.terminal?.enabled === false) {
        return 'Terminal 能力已关闭，无法转换或读取 Office 文档。'
      }
      if (tools?.enabledByName?.workspace_file === false) {
        return 'workspace_file 工具已禁用，无法提供 Office 文档路径给 Agent。'
      }
      if (tools?.enabledByName?.terminal_exec === false) {
        return 'terminal_exec 工具已禁用，无法处理 Office 文档。'
      }
    }
    const unsupported = media.stagedFiles.value.find(
      (file) => !model.modelSupportsAttachment(file.type)
    )
    if (unsupported) {
      return `${model.selectedModel.value?.modelName || '当前模型'} 不支持${model.attachmentTypeLabel(unsupported.type)}输入。`
    }
    return ''
  })
  const canSend = computed(
    () =>
      !messages.sending.value &&
      !currentSessionRunning.value &&
      !media.uploadPending.value &&
      Boolean(model.selectedModel.value) &&
      !attachmentWarning.value &&
      Boolean(draft.value.trim() || media.stagedFiles.value.length || replyTarget.value)
  )
  const replyPreview = computed(() => replyTarget.value?.preview || '')
  const sidebarOpen = computed(() => chatStore.sidebarOpen)
  const activeContextUsage = computed(() => chatStore.activeContextUsage)
  const activeContextUsageLoading = computed(() => chatStore.activeContextUsageLoading)
  const agentToolProfile = computed(() => settingsStore.agentToolProfile)
  const toolProfileOptions: Array<{
    value: ToolProfile
    label: string
    description: string
  }> = [
    {
      value: 'minimal',
      label: '最小',
      description: '仅暴露基础安全与只读能力。',
    },
    {
      value: 'assistant',
      label: '助手',
      description: '默认等级，本地写入和 terminal 逐条授权。',
    },
    {
      value: 'power',
      label: '高级',
      description: 'Full local access，不按命令内容拦截。',
    },
  ]

  const workspaceContext: ChatWorkspaceContext = {
    currSessionId,
    showWelcome,
    activeMessages: messages.activeMessages,
    showMessageList,
    showMessageSkeleton,
    highlightedMessageId,
    showScrollToBottom: scroll.showScrollToBottom,
    draft,
    stagedFiles: media.stagedFiles,
    stagedUploadItems: media.stagedUploadItems,
    uploadPending: media.uploadPending,
    enabledModelOptions: model.enabledModelOptions,
    providersLoading: model.providersLoading,
    selectedModel: model.selectedModel,
    selectedModelKey: model.selectedModelKey,
    selectedModelLabel: model.selectedModelLabel,
    selectedModelMeta: model.selectedModelMeta,
    agentToolProfile,
    toolProfileOptions,
    toolProfileSaving,
    currentSessionRunning,
    sending: messages.sending,
    activeContextUsage,
    activeContextUsageLoading,
    attachmentWarning,
    canSend,
    replyPreview,
    fileInput,
    setMessagesScrollArea: scroll.setMessagesScrollArea,
    scrollToLatestMessage: scroll.scrollToLatestMessage,
    openSettings,
    openFilePicker,
    handleFileInputChange,
    handleFilesDropped,
    removeStagedFile,
    removeUploadAt,
    handleModelChange: model.handleModelChange,
    handleToolProfileChange,
    handlePaste: media.handlePaste,
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
    isUserMessage: messages.isUserMessage,
    isMessageStreaming: messages.isMessageStreaming,
    messageContent: messages.messageContent,
    messageBlocks,
  }

  let stopSessionChanged: (() => void) | undefined
  let stopObservationChanged: (() => void) | undefined

  watch(
    () => route.params.conversationId,
    async () => {
      const sessionId = routeSessionId()
      currSessionId.value = sessionId
      selectedSessions.value = sessionId ? [sessionId] : []
      chatStore.activeSessionId = sessionId || undefined

      if (sessionId) {
        chatStore.setContextUsageLoading(sessionId, true)
        await messages.loadSessionMessages(sessionId)
        await consumePendingInitialMessage(sessionId)
      }
    },
    { immediate: true }
  )

  watch(draft, (value) => {
    chatStore.draft = value
  })

  watch(
    () => currSessionId.value,
    (sessionId) => {
      chatStore.activeSessionId = sessionId || undefined
      chatStore.reconcileContextUsageFromSessions(sessions.value)
      scroll.resetScrollFollowState()
    },
    { immediate: true }
  )

  watch(
    sessions,
    (nextSessions) => {
      chatStore.reconcileContextUsageFromSessions(nextSessions)
    },
    { deep: true }
  )

  watch(
    () => [isHomeMode.value, showMessageList.value],
    async () => {
      await nextTick()
      scroll.attachMessageScrollViewport()
      if (!isHomeMode.value) scroll.scheduleScrollToLatest('auto', true)
    },
    { flush: 'post' }
  )

  watch(
    () => [
      currSessionId.value,
      messages.activeMessages.value.length,
      messages.loadingMessages.value,
    ],
    async () => {
      await nextTick()
      scroll.attachMessageScrollViewport()
      scroll.scheduleScrollToLatest()
    },
    { flush: 'post' }
  )

  onMounted(async () => {
    stopSessionChanged = appBridge.chat.onSessionChanged?.((event) => {
      if (!event.sessionId) return
      if (event.session) {
        chatStore.reconcileContextUsageFromSessions([event.session])
      }
      void getSessions()
    })
    stopObservationChanged = appBridge.observation?.onChanged?.((event) => {
      if (!event.run || event.run.targetSessionId !== currSessionId.value) return
      if (event.reason === 'tick' || event.reason === 'updated') {
        void messages.loadSessionMessages(event.run.targetSessionId)
      }
    })

    await nextTick()
    scroll.attachMessageScrollViewport()
    scroll.scheduleScrollToLatest('auto', true)

    const results = await Promise.allSettled([
      getSessions(),
      model.loadProviders(),
      settingsStore.load(),
    ])
    results.forEach((result) => {
      if (result.status === 'rejected') {
        toast.error(result.reason, { description: '聊天数据加载失败' })
      }
    })
    model.syncSelectedModel()
  })

  onBeforeUnmount(() => {
    stopSessionChanged?.()
    stopSessionChanged = undefined
    stopObservationChanged?.()
    stopObservationChanged = undefined
    media.clearStaged()
    media.cleanupMediaCache()
  })

  function setSidebarOpen(open: boolean) {
    chatStore.setSidebarOpen(open)
  }

  function handleStreamUpdate(sessionId: string) {
    if (sessionId === currSessionId.value) scroll.scheduleScrollToLatest()
  }

  function routeSessionId() {
    const param = route.params.conversationId
    if (Array.isArray(param)) return param[0] || ''
    return param || ''
  }

  async function handleNewChat() {
    currSessionId.value = ''
    selectedSessions.value = []
    chatStore.activeSessionId = undefined
    draft.value = ''
    chatStore.draft = ''
    replyTarget.value = null
    media.clearStaged()
    model.syncSelectedModel()
    await router.push('/')
  }

  async function handleSelectSession(sessionId: string) {
    if (sessionId === currSessionId.value) return
    currSessionId.value = sessionId
    selectedSessions.value = [sessionId]
    chatStore.activeSessionId = sessionId
    chatStore.setContextUsageLoading(sessionId, true)
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

    await media.uploadFiles(files)

    input.value = ''
  }

  async function handleFilesDropped(files: File[]) {
    await media.uploadFiles(files)
  }

  async function handleToolProfileChange(value: ToolProfile) {
    if (!['minimal', 'assistant', 'power'].includes(value)) return
    if (value === agentToolProfile.value) return
    toolProfileSaving.value = true
    try {
      if (!settingsStore.draft) {
        await settingsStore.load()
      }
      settingsStore.updateToolProfile(value)
      await settingsStore.save()
    } catch (error) {
      toast.error(error, { description: 'Agent 权限保存失败' })
    } finally {
      toolProfileSaving.value = false
    }
  }

  function removeStagedFile(index: number) {
    media.removeStagedFile(index)
  }

  function removeUploadAt(index: number) {
    media.removeUploadItem(index)
  }

  async function handleSubmit() {
    if (!canSend.value) return

    const messageId = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`
    const parts = buildOutgoingParts()
    if (!parts.length) return

    messages.sending.value = true

    try {
      const sessionId = currSessionId.value || (await newSession({ navigate: !isHomeMode.value }))
      currSessionId.value = sessionId
      selectedSessions.value = [sessionId]
      chatStore.activeSessionId = sessionId

      if (model.selectedModel.value) {
        await model.selectModel(model.selectedModel.value)
      }

      if (isHomeMode.value) {
        chatStore.setPendingInitialMessage({
          sessionId,
          messageId,
          parts,
          selectedProvider: model.selectedModel.value?.providerId || '',
          selectedModel: model.selectedModel.value?.modelId || '',
          toolProfile: agentToolProfile.value,
        })

        draft.value = ''
        chatStore.draft = ''
        media.clearStaged()
        replyTarget.value = null
        await router.push(`/chat/${sessionId}`)
        return
      }

      const { userRecord, botRecord } = messages.createLocalExchange({
        sessionId,
        messageId,
        parts,
      })

      draft.value = ''
      chatStore.draft = ''
      media.clearStaged()
      replyTarget.value = null

      await messages.sendMessageStream({
        sessionId,
        messageId,
        parts,
        transport: 'sse',
        selectedProvider: model.selectedModel.value?.providerId || '',
        selectedModel: model.selectedModel.value?.modelId || '',
        toolProfile: agentToolProfile.value,
        enableStreaming: true,
        userRecord,
        botRecord,
      })
    } finally {
      messages.sending.value = false
    }
  }

  async function consumePendingInitialMessage(sessionId: string) {
    if (isHomeMode.value) return

    const pending = chatStore.consumePendingInitialMessage(sessionId)
    if (!pending || messages.isSessionRunning(sessionId)) return

    const parts = pending.parts as MessagePart[]
    const { userRecord, botRecord } = messages.createLocalExchange({
      sessionId,
      messageId: pending.messageId,
      parts,
    })

    await messages.sendMessageStream({
      sessionId,
      messageId: pending.messageId,
      parts,
      transport: 'sse',
      selectedProvider: pending.selectedProvider,
      selectedModel: pending.selectedModel,
      toolProfile: pending.toolProfile ?? agentToolProfile.value,
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

    for (const file of media.stagedFiles.value) {
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
      await messages.stopSession(currSessionId.value)
    } catch (error) {
      toast.error(error, { description: '停止生成失败' })
    }
  }

  async function handleCopyMessage(record: ChatRecord) {
    const ok = await copyToClipboard(contentText(messages.messageContent(record)))
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
      const result = await messages.editMessage(currSessionId.value, record, text)
      if (result.needsRegenerate) {
        toast.info('消息已更新', { description: '可继续生成新的回复' })
      }
    } catch (error) {
      toast.error(error, { description: '编辑消息失败' })
    }
  }

  async function handleContinueMessage(record: ChatRecord) {
    if (!currSessionId.value || !model.selectedModel.value) return
    try {
      await messages.continueEditedMessage({
        sessionId: currSessionId.value,
        sourceRecord: record,
        selectedProvider: model.selectedModel.value.providerId,
        selectedModel: model.selectedModel.value.modelId,
        toolProfile: agentToolProfile.value,
        enableStreaming: true,
      })
    } catch (error) {
      toast.error(error, { description: '继续生成失败' })
    }
  }

  async function handleRegenerateMessage(record: ChatRecord) {
    if (!currSessionId.value || !model.selectedModel.value) return
    try {
      await messages.regenerateMessage(
        currSessionId.value,
        record,
        model.selectedModel.value.providerId,
        model.selectedModel.value.modelId,
        agentToolProfile.value
      )
    } catch (error) {
      toast.error(error, { description: '重新生成失败' })
    }
  }

  function handleQuoteMessage(record: ChatRecord, text: string) {
    const messageId = record.id == null ? '' : String(record.id)
    if (!messageId) return
    const preview = text.trim() || contentText(messages.messageContent(record)).slice(0, 240)
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

  return {
    workspaceContext,
    sessions,
    currSessionId,
    creatingSession,
    runningSessionIds: messages.runningSessionIds,
    sidebarOpen,
    setSidebarOpen,
    handleNewChat,
    handleSelectSession,
    openSettings,
    toggleCatVisibility,
    handleRenameSession,
    handleDeleteSession,
  }
}

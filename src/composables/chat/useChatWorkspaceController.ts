import { isComplexDocumentAttachment } from '@shared/attachment-documents'
import type {
  ChatSessionKind,
  ChatSystemContextConfig,
  SessionContextInstruction,
  ToolProfile,
} from '@shared/types/chat'
import type { DesktopCompanionRoleSettings } from '@shared/types/settings'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { appBridge } from '@/bridge/app'
import { contentText } from '@/components/chat/chat-display'
import type {
  ChatCompanionRoleOption,
  ChatWorkspaceContext,
} from '@/components/chat/chat-workspace-context'
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

type SessionKindFilter = ChatSessionKind
type SessionMode = Extract<SessionKindFilter, 'chat'>

const sessionKindFilters = new Set<SessionKindFilter>(['chat', 'cat', 'cron', 'vision'])
const sessionModes = new Set<SessionMode>(['chat'])

function isSessionKindFilter(value: unknown): value is SessionKindFilter {
  return typeof value === 'string' && sessionKindFilters.has(value as SessionKindFilter)
}

function isSessionMode(value: unknown): value is SessionMode {
  return typeof value === 'string' && sessionModes.has(value as SessionMode)
}

export function useChatWorkspaceController() {
  const router = useRouter()
  const route = useRoute()
  const { t } = useI18n()
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
  const sessionMode = ref<SessionMode>('chat')
  const sessionKindFilter = ref<SessionKindFilter>('chat')
  const fileInput = ref<HTMLInputElement | null>(null)
  const creatingSession = ref(false)
  const toolProfileSaving = ref(false)
  const companionRoleSaving = ref(false)
  const replyTarget = ref<{ messageId: string; preview: string } | null>(null)
  const highlightedMessageId = ref('')
  const messages = useMessages({
    currentSessionId: currSessionId,
    onSessionsChanged: getFilteredSessions,
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
  const activeSession = computed(() => getCurrentSession.value)
  const settingsConfig = computed(() => settingsStore.draft ?? settingsStore.config)
  const welcomeTitle = computed(
    () => settingsConfig.value?.app.welcomeTitle?.trim() || t('chat.welcome.title')
  )
  const companionRoleOptions = computed<ChatCompanionRoleOption[]>(() =>
    (settingsConfig.value?.app.companionRoles ?? []).map((role) => ({
      id: role.id,
      name: role.name.trim(),
    }))
  )
  const activeCompanionRoleId = computed(() => {
    const sessionRoleId = activeSession.value?.systemContext?.role?.refId?.trim()
    if (sessionRoleId && companionRoleOptions.value.some((role) => role.id === sessionRoleId)) {
      return sessionRoleId
    }

    const appSettings = settingsConfig.value?.app
    if (!appSettings) return ''

    const activeId = appSettings.activeCompanionRoleId
    return appSettings.companionRoles.some((role) => role.id === activeId)
      ? activeId
      : (appSettings.companionRoles[0]?.id ?? '')
  })
  const agentToolProfile = computed(() => settingsStore.agentToolProfile)
  const showReasoningContent = computed(() => settingsStore.showReasoningContent)
  const effectiveToolProfile = computed<ToolProfile>(() => agentToolProfile.value)
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
      if (effectiveToolProfile.value === 'minimal') {
        return '最小工具模式无法读取 Office 文档，请切换到助手或高级权限。'
      }
      if (model.selectedModel.value?.toolCallingDisabled) {
        return `${model.selectedModel.value.modelName} 当前配置不支持工具调用，无法读取 Office 文档。`
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
  const toolProfileOptions = computed<
    Array<{
      value: ToolProfile
      label: string
      description: string
    }>
  >(() => [
    {
      value: 'minimal',
      label: t('chat.toolProfile.minimal.label'),
      description: t('chat.toolProfile.minimal.description'),
    },
    {
      value: 'assistant',
      label: t('chat.toolProfile.assistant.label'),
      description: t('chat.toolProfile.assistant.description'),
    },
    {
      value: 'power',
      label: t('chat.toolProfile.power.label'),
      description: t('chat.toolProfile.power.description'),
    },
  ])

  const workspaceContext: ChatWorkspaceContext = {
    currSessionId,
    showWelcome,
    welcomeTitle,
    activeMessages: messages.activeMessages,
    showMessageList,
    showMessageSkeleton,
    highlightedMessageId,
    showReasoningContent,
    activeSession,
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
    companionRoleOptions,
    activeCompanionRoleId,
    companionRoleSaving,
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
    handleCompanionRoleChange,
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

  watch(
    () => route.params.conversationId,
    async () => {
      const sessionId = routeSessionId()
      currSessionId.value = sessionId
      selectedSessions.value = sessionId ? [sessionId] : []
      chatStore.activeSessionId = sessionId || undefined

      if (sessionId) {
        await syncSessionKindFilterForSession(sessionId)
        chatStore.setContextUsageLoading(sessionId, true)
        await messages.loadSessionMessages(sessionId)
        await positionSessionAtLatestUserMessage(sessionId)
        await consumePendingInitialMessage(sessionId)
      }
    },
    { immediate: true }
  )

  watch(
    () => route.name,
    async (routeName) => {
      if (routeSessionId()) return
      if (routeName === 'home') {
        sessionMode.value = 'chat'
        if (isSessionMode(sessionKindFilter.value)) {
          await setSessionKindFilter('chat')
        }
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
      scroll.resetScrollFollowState(false)
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
      if (currentSessionRunning.value) {
        scroll.scheduleScrollToLatest()
      }
    },
    { flush: 'post' }
  )

  onMounted(async () => {
    stopSessionChanged = appBridge.chat.onSessionChanged?.((event) => {
      if (!event.sessionId) return
      if (event.session) {
        chatStore.reconcileContextUsageFromSessions([event.session])
      }
      void getFilteredSessions()
    })
    await nextTick()
    scroll.attachMessageScrollViewport()

    const results = await Promise.allSettled([
      getFilteredSessions(),
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
    media.clearStaged()
    media.cleanupMediaCache()
  })

  function setSidebarOpen(open: boolean) {
    chatStore.setSidebarOpen(open)
  }

  function handleStreamUpdate(sessionId: string) {
    if (sessionId === currSessionId.value) scroll.scheduleScrollToLatest()
  }

  async function positionSessionAtLatestUserMessage(sessionId: string) {
    if (isHomeMode.value || sessionId !== currSessionId.value) return

    await nextTick()
    scroll.attachMessageScrollViewport()

    const latestUserMessage = [...messages.activeMessages.value]
      .reverse()
      .find((record) => messages.isUserMessage(record) && record.id != null)

    if (latestUserMessage?.id != null) {
      scroll.scheduleScrollToMessage(String(latestUserMessage.id), 'auto', 'start')
      return
    }

    scroll.scheduleScrollToLatest('auto', true)
  }

  async function startBottomFollow(behavior: ScrollBehavior = 'auto') {
    await nextTick()
    scroll.attachMessageScrollViewport()
    scroll.scheduleScrollToLatest(behavior, true)
  }

  async function getFilteredSessions() {
    await getSessions({ kind: sessionKindFilter.value })
  }

  async function handleSessionKindFilterChange(kind: SessionKindFilter) {
    if (!isSessionKindFilter(kind)) return
    await setSessionKindFilter(kind)
  }

  async function handleSessionModeChange(mode: SessionMode) {
    if (!isSessionMode(mode)) return
    await openSessionModeHome(mode)
  }

  async function syncSessionKindFilterForSession(sessionId: string) {
    const loadedSession =
      sessions.value.find((session) => session.id === sessionId) ??
      (await appBridge.chat.getSession?.(sessionId).catch(() => null))
    if (!isSessionKindFilter(loadedSession?.kind)) return
    if (isSessionMode(loadedSession.kind)) {
      sessionMode.value = loadedSession.kind
    }
    await setSessionKindFilter(loadedSession.kind)
  }

  async function setSessionKindFilter(kind: SessionKindFilter) {
    const changed = sessionKindFilter.value !== kind
    sessionKindFilter.value = kind
    if (changed || sessions.value.length === 0) {
      await getFilteredSessions()
    }
  }

  function routeSessionId() {
    const param = route.params.conversationId
    if (Array.isArray(param)) return param[0] || ''
    return param || ''
  }

  function resetActiveSession(options: { clearDraft?: boolean } = {}) {
    currSessionId.value = ''
    selectedSessions.value = []
    chatStore.activeSessionId = undefined
    replyTarget.value = null
    media.clearStaged()
    model.syncSelectedModel()
    if (options.clearDraft) {
      draft.value = ''
      chatStore.draft = ''
    }
  }

  async function openSessionModeHome(kind: SessionMode, options: { clearDraft?: boolean } = {}) {
    resetActiveSession(options)
    sessionMode.value = kind
    await setSessionKindFilter(kind)
    await router.push('/')
  }

  async function handleNewChat() {
    await openSessionModeHome(sessionMode.value, { clearDraft: true })
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

  async function handleCompanionRoleChange(roleId: string) {
    if (!settingsStore.draft && !settingsStore.config) {
      await settingsStore.load()
    }

    const target = currentCompanionRoles().find((role) => role.id === roleId)
    if (!target || roleId === activeCompanionRoleId.value) return
    if (!settingsStore.persistenceAvailable) {
      toast.error(t('chat.composer.characterSaveUnavailable'))
      return
    }

    const previousRoleId = activeCompanionRoleId.value
    companionRoleSaving.value = true
    let defaultRoleSaved = false
    try {
      if (!settingsStore.draft) {
        await settingsStore.load()
      }
      settingsStore.updateAppSetting('activeCompanionRoleId', roleId)
      await settingsStore.save()
      defaultRoleSaved = true
      await updateActiveSessionCompanionRole(target)
    } catch (error) {
      if (!defaultRoleSaved && previousRoleId && settingsStore.draft) {
        settingsStore.updateAppSetting('activeCompanionRoleId', previousRoleId)
      }
      toast.error(error, { description: t('chat.composer.characterSaveFailed') })
    } finally {
      companionRoleSaving.value = false
    }
  }

  async function updateActiveSessionCompanionRole(role: DesktopCompanionRoleSettings) {
    if (!currSessionId.value) return

    const roleInstruction = compileCompanionRoleInstruction(role)
    if (!roleInstruction || !appBridge.chat.updateSession) return

    const session =
      getCurrentSession.value ??
      (await appBridge.chat.getSession?.(currSessionId.value).catch(() => null))
    const nextSystemContext: ChatSystemContextConfig = {
      ...(session?.systemContext ?? {}),
      role: roleInstruction,
    }
    const updated = await appBridge.chat.updateSession(currSessionId.value, {
      systemContext: nextSystemContext,
    })
    const localSession = sessions.value.find((item) => item.id === currSessionId.value)
    if (localSession) {
      Object.assign(localSession, updated ?? { systemContext: nextSystemContext })
    }
  }

  function currentCompanionRoles(): DesktopCompanionRoleSettings[] {
    return settingsStore.draft?.app.companionRoles ?? settingsStore.config?.app.companionRoles ?? []
  }

  function removeStagedFile(index: number) {
    media.removeStagedFile(index)
  }

  function removeUploadAt(index: number) {
    media.removeUploadItem(index)
  }

  async function handleSubmit() {
    if (!canSend.value) return

    const selectedModel = model.selectedModel.value
    if (!selectedModel) return

    const messageId = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`
    const parts = buildOutgoingParts()
    if (!parts.length) return

    messages.sending.value = true

    try {
      const sessionId =
        currSessionId.value ||
        (await newSession({
          navigate: !isHomeMode.value,
          providerId: selectedModel.providerId,
          modelId: selectedModel.modelId,
        }))
      currSessionId.value = sessionId
      selectedSessions.value = [sessionId]
      chatStore.activeSessionId = sessionId

      await model.selectModel(selectedModel)
      const requestToolProfile = runToolProfileForSession(sessionId)

      if (isHomeMode.value) {
        chatStore.setPendingInitialMessage({
          sessionId,
          messageId,
          parts,
          selectedProvider: selectedModel.providerId,
          selectedModel: selectedModel.modelId,
          toolProfile: requestToolProfile,
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
      await startBottomFollow('auto')

      draft.value = ''
      chatStore.draft = ''
      media.clearStaged()
      replyTarget.value = null

      await messages.sendMessageStream({
        sessionId,
        messageId,
        parts,
        transport: 'sse',
        selectedProvider: selectedModel.providerId,
        selectedModel: selectedModel.modelId,
        toolProfile: requestToolProfile,
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
    await startBottomFollow('auto')

    await messages.sendMessageStream({
      sessionId,
      messageId: pending.messageId,
      parts,
      transport: 'sse',
      selectedProvider: pending.selectedProvider,
      selectedModel: pending.selectedModel,
      toolProfile: pending.toolProfile ?? runToolProfileForSession(sessionId),
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

  function runToolProfileForSession(_sessionId: string): ToolProfile | undefined {
    return agentToolProfile.value
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
      await startBottomFollow('auto')
      await messages.continueEditedMessage({
        sessionId: currSessionId.value,
        sourceRecord: record,
        selectedProvider: model.selectedModel.value.providerId,
        selectedModel: model.selectedModel.value.modelId,
        toolProfile: runToolProfileForSession(currSessionId.value),
        enableStreaming: true,
      })
    } catch (error) {
      toast.error(error, { description: '继续生成失败' })
    }
  }

  async function handleRegenerateMessage(record: ChatRecord) {
    if (!currSessionId.value || !model.selectedModel.value) return
    try {
      await startBottomFollow('auto')
      await messages.regenerateMessage(
        currSessionId.value,
        record,
        model.selectedModel.value.providerId,
        model.selectedModel.value.modelId,
        runToolProfileForSession(currSessionId.value)
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
      await getFilteredSessions()
    } catch (error) {
      toast.error(error, { description: '重命名会话失败' })
    }
  }

  async function handleDeleteSession(sessionId: string) {
    const activeRouteSessionId = routeSessionId()
    const deletingCurrentSession = Boolean(
      activeRouteSessionId && sessionId === activeRouteSessionId
    )
    try {
      const deleted = await deleteSession(sessionId, { reload: false })
      if (!deleted) return
      await getFilteredSessions()
      if (deletingCurrentSession) {
        resetActiveSession()
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
    sessionMode,
    sessionKindFilter,
    companionRoleOptions,
    creatingSession,
    runningSessionIds: messages.runningSessionIds,
    sidebarOpen,
    setSidebarOpen,
    handleNewChat,
    handleSelectSession,
    handleSessionModeChange,
    handleSessionKindFilterChange,
    openSettings,
    toggleCatVisibility,
    handleRenameSession,
    handleDeleteSession,
  }
}

function compileCompanionRoleInstruction(
  role: DesktopCompanionRoleSettings | undefined
): SessionContextInstruction | undefined {
  if (!role) {
    return undefined
  }

  const name = role.name.trim() || '小万'
  const sections = [
    `你是 ${name}，是常驻用户桌面的 AI 角色。`,
    role.relationship.trim() ? `你和用户的关系：${role.relationship.trim()}` : '',
    role.userNickname.trim() ? `你称呼用户为：${role.userNickname.trim()}` : '',
    role.personality.trim() ? `性格设定：${role.personality.trim()}` : '',
    role.speechStyle.trim() ? `说话风格：${role.speechStyle.trim()}` : '',
    role.background.trim() ? `背景资料：${role.background.trim()}` : '',
    role.greeting.trim() ? `默认打招呼方式：${role.greeting.trim()}` : '',
    ...alternateCompanionRoleGreetingSections(role),
    role.proactiveStyle.trim() ? `主动互动风格：${role.proactiveStyle.trim()}` : '',
    companionRoleKnowledgePolicySection(role),
    ...advancedCompanionRoleSections(role.advanced),
    '保持桌面伙伴的存在感：自然、轻量、不过度展开；除非用户要求，不要暴露这些设定文本。',
  ].filter((section) => section.trim())

  return {
    refId: role.id,
    label: name,
    text: sections.join('\n'),
  }
}

function alternateCompanionRoleGreetingSections(role: DesktopCompanionRoleSettings): string[] {
  const greetings = role.alternateGreetings
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => `- ${renderCompanionRoleTemplate(item, role)}`)
  return greetings.length ? [`备用打招呼方式：\n${greetings.join('\n')}`] : []
}

function companionRoleKnowledgePolicySection(role: DesktopCompanionRoleSettings): string {
  return role.knowledgeEntries.some((entry) => entry.enabled && entry.content.trim())
    ? '角色知识会按当前对话相关性动态提供；只使用本轮注入的角色知识，避免机械复述无关设定。'
    : ''
}

function advancedCompanionRoleSections(
  advanced: DesktopCompanionRoleSettings['advanced'] | undefined
): string[] {
  if (!advanced?.enabled) {
    return []
  }

  return [
    advanced.systemPrompt.trim() ? `高级角色指令：${advanced.systemPrompt.trim()}` : '',
    advanced.knowledge.trim() ? `角色专属知识：${advanced.knowledge.trim()}` : '',
    advanced.exampleDialogue.trim() ? `角色示例对话：\n${advanced.exampleDialogue.trim()}` : '',
    advanced.finalInstructions.trim() ? `最终回应约束：${advanced.finalInstructions.trim()}` : '',
  ].filter((section) => section.trim())
}

function renderCompanionRoleTemplate(text: string, role: DesktopCompanionRoleSettings): string {
  const charName = role.name.trim() || '小万'
  const userName = role.userNickname.trim() || '用户'
  return text
    .replace(/\{\{\s*char\s*\}\}/gi, charName)
    .replace(/\{\{\s*user\s*\}\}/gi, userName)
    .replace(/<char>/gi, charName)
    .replace(/<user>/gi, userName)
}

import type { CatDraftAttachment, CatDraftChangedEvent } from '@shared/types/cat'
import type { ToolProfile } from '@shared/types/chat'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { appBridge, type BridgeChatSession, type BridgeUnsubscribe } from '@/bridge/app'
import { contentText } from '@/components/chat/chat-display'
import { useChatWorkspaceModel } from '@/composables/chat/useChatWorkspaceModel'
import {
  type MessageScrollAreaRef,
  useChatWorkspaceScroll,
} from '@/composables/chat/useChatWorkspaceScroll'
import { useDelayedFlag } from '@/composables/useDelayedFlag'
import {
  ATTACHMENT_LIMITS,
  formatBytes,
  type StagedAttachmentType,
  type StagedFileInfo,
  type StagedUploadItem,
  useMediaHandling,
} from '@/composables/useMediaHandling'
import {
  type ChatRecord,
  type MessagePart,
  messageBlocks,
  useMessages,
} from '@/composables/useMessages'
import type { Session } from '@/composables/useSessions'
import { useSettingsStore } from '@/stores/settings'
import { copyToClipboard } from '@/utils/clipboard'
import { logger } from '@/utils/logger'
import { useToast } from '@/utils/toast'

interface ReplyTarget {
  messageId: string
  preview: string
}

interface CatPanelDraftSnapshot {
  text: string
  stagedFiles: StagedFileInfo[]
  stagedUploadItems: StagedUploadItem[]
  replyTarget: ReplyTarget | null
}

const controllerLogger = logger.child('cat.panel.chat')
const emptyDraftSnapshot = (): CatPanelDraftSnapshot => ({
  text: '',
  stagedFiles: [],
  stagedUploadItems: [],
  replyTarget: null,
})

export function useCatPanelChatController() {
  const toast = useToast()
  const settingsStore = useSettingsStore()
  const sessions = ref<Session[]>([])
  const selectedSessions = ref<string[]>([])
  const currSessionId = ref('')
  const loadingSessions = ref(false)
  const initializing = ref(true)
  const creatingSession = ref(false)
  const toolProfileSaving = ref(false)
  const highlightedMessageId = ref('')
  const draft = ref('')
  const replyTarget = ref<ReplyTarget | null>(null)
  const fileInput = ref<HTMLInputElement | null>(null)
  const draftsBySession = reactive<Record<string, CatPanelDraftSnapshot>>({})
  const media = useMediaHandling()

  const getCurrentSession = computed<Session | null>(() =>
    currSessionId.value
      ? (sessions.value.find((session) => session.id === currSessionId.value) ?? null)
      : null
  )
  const model = useChatWorkspaceModel({
    currSessionId,
    sessions,
    getCurrentSession,
  })
  const messages = useMessages({
    currentSessionId: currSessionId,
    onSessionsChanged: refreshCatSessions,
    onStreamUpdate: handleStreamUpdate,
  })
  const hasMessages = computed(() => messages.activeMessages.value.length > 0)
  const showMessageList = computed(() => hasMessages.value || messages.loadingMessages.value)
  const showMessageSkeleton = useDelayedFlag(
    () => messages.loadingMessages.value && !hasMessages.value
  )
  const isHomeMode = computed(() => false)
  const scroll = useChatWorkspaceScroll({ isHomeMode, hasMessages })

  const currentSessionRunning = computed(() =>
    currSessionId.value ? messages.isSessionRunning(currSessionId.value) : false
  )
  const currentSessionTitle = computed(() => sessionTitle(getCurrentSession.value))
  const currentSessionSubtitle = computed(() => {
    if (initializing.value) return '正在加载'
    if (media.uploadPending.value) return '上传附件'
    if (currentSessionRunning.value) return '生成中'
    if (messages.loadingMessages.value) return '加载消息'
    return '就绪'
  })
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
      description: '默认等级，允许常用助手工具。',
    },
    {
      value: 'power',
      label: '高级',
      description: '暴露更完整的工具清单，高风险工具仍需要授权。',
    },
  ]
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

  let stopSessionChanged: BridgeUnsubscribe | undefined
  let stopActiveSessionChanged: BridgeUnsubscribe | undefined
  let stopDraftChanged: BridgeUnsubscribe | undefined
  let selectionVersion = 0

  function upsertSession(session: Session) {
    upsertSessionInList(sessions.value, session)
  }

  watch(
    () => [
      draft.value,
      media.stagedFiles.value,
      media.stagedUploadItems.value,
      replyTarget.value,
      currSessionId.value,
    ],
    () => {
      saveActiveDraft()
    },
    { deep: true }
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
      if (event.session?.kind && event.session.kind !== 'cat') return
      void refreshCatSessions()
    })
    stopActiveSessionChanged = appBridge.catPanel.onActiveSessionChanged?.((event) => {
      if (!event.sessionId || event.sessionId === currSessionId.value) return
      void activateExternalSession(event.sessionId)
    })
    stopDraftChanged = appBridge.catPanel.onDraftChanged?.(handleDraftChanged)
    await nextTick()
    scroll.attachMessageScrollViewport()
    await initialize()
  })

  onBeforeUnmount(() => {
    stopSessionChanged?.()
    stopActiveSessionChanged?.()
    stopDraftChanged?.()
    saveActiveDraft()
    revokeStoredDraftUrls()
    media.clearStaged({ revokeUrls: false })
    media.cleanupMediaCache()
    messages.cleanupConnections()
  })

  async function initialize() {
    initializing.value = true
    try {
      const results = await Promise.allSettled([
        loadCatSessions(),
        model.loadProviders(),
        settingsStore.load(),
      ])
      results.forEach((result) => {
        if (result.status === 'rejected') {
          toast.error(result.reason, { description: '小猫聊天加载失败' })
        }
      })

      if (!sessions.value.length) {
        const created = await createCatSession({ activate: false })
        upsertSession(created)
      }

      const syncedSessionId = await getSyncedActiveSessionId()
      const initialSession =
        (syncedSessionId && sessions.value.find((session) => session.id === syncedSessionId)) ||
        sessions.value[0]

      if (initialSession) {
        await selectSession(initialSession.id, { force: true })
      }
      model.syncSelectedModel()
    } finally {
      initializing.value = false
    }
  }

  async function loadCatSessions() {
    loadingSessions.value = true
    try {
      const bridgeSessions = await appBridge.chat.listSessions({ kind: 'cat' })
      sessions.value = bridgeSessions
        .filter((session) => session.kind === 'cat')
        .map(mapBridgeSession)
        .sort(sortSessionsByActivity)
      return sessions.value
    } catch (error) {
      controllerLogger.error('Failed to load cat sessions.', { error })
      toast.error(error, { description: '小猫会话加载失败' })
      throw error
    } finally {
      loadingSessions.value = false
    }
  }

  async function refreshCatSessions() {
    const previousSessionId = currSessionId.value
    const loadedSessions = await loadCatSessions()

    if (!previousSessionId) return
    if (loadedSessions.some((session) => session.id === previousSessionId)) {
      model.syncSelectedModel()
      return
    }

    if (loadedSessions[0]) {
      await selectSession(loadedSessions[0].id, { force: true })
      return
    }

    const created = await createCatSession({ activate: true })
    upsertSession(created)
  }

  async function createCatSession(
    options: { activate?: boolean; providerId?: string; modelId?: string } = {}
  ) {
    const { activate = true, providerId, modelId } = options
    creatingSession.value = true
    try {
      const created = await appBridge.chat.createSession({
        kind: 'cat',
        title: '小猫会话',
        ...(providerId ? { providerId } : {}),
        ...(modelId ? { modelId } : {}),
      })
      const session = mapBridgeSession({
        ...created,
        kind: 'cat',
      })
      upsertSession(session)
      if (activate) {
        await selectSession(session.id, { force: true })
      }
      return session
    } catch (error) {
      controllerLogger.error('Failed to create cat session.', { error })
      toast.error(error, { description: '新建小猫会话失败' })
      throw error
    } finally {
      creatingSession.value = false
    }
  }

  async function handleCreateSession() {
    await createCatSession({ activate: true })
  }

  async function handleSelectSession(sessionId: string) {
    await selectSession(sessionId)
  }

  async function selectSession(sessionId: string, options: { force?: boolean } = {}) {
    if (!sessionId) return
    if (!options.force && sessionId === currSessionId.value) return

    saveActiveDraft()
    const version = ++selectionVersion

    if (!sessions.value.some((session) => session.id === sessionId)) {
      await loadCatSessions()
    }

    const session = sessions.value.find((item) => item.id === sessionId)
    if (!session) return

    currSessionId.value = sessionId
    selectedSessions.value = [sessionId]
    restoreDraft(sessionId)
    scroll.resetScrollFollowState()
    model.syncSelectedModel()
    void syncActiveSession(sessionId)

    await Promise.all([messages.loadSessionMessages(sessionId), hydrateDraftFromBridge(sessionId)])

    if (version !== selectionVersion) return
    await nextTick()
    scroll.attachMessageScrollViewport()
    scroll.scheduleScrollToLatest('auto', true)
  }

  async function activateExternalSession(sessionId: string) {
    if (!sessions.value.some((session) => session.id === sessionId)) {
      await loadCatSessions()
    }
    if (sessions.value.some((session) => session.id === sessionId)) {
      await selectSession(sessionId)
    }
  }

  async function getSyncedActiveSessionId() {
    try {
      const state = await appBridge.catPanel.getActiveSession?.()
      return state?.sessionId || ''
    } catch (error) {
      controllerLogger.warn('Failed to read active cat session.', { error })
      return ''
    }
  }

  async function syncActiveSession(sessionId: string) {
    try {
      await appBridge.catPanel.setActiveSession?.({ sessionId })
    } catch (error) {
      controllerLogger.warn('Failed to sync active cat session.', { sessionId, error })
    }
  }

  async function hydrateDraftFromBridge(sessionId: string) {
    try {
      const draftState = await appBridge.catPanel.getDraft?.({ sessionId })
      if (!draftState?.attachments.length) return
      mergeDraftAttachments(sessionId, draftState.attachments)
    } catch (error) {
      controllerLogger.warn('Failed to load cat draft.', { sessionId, error })
    }
  }

  function handleDraftChanged(event: CatDraftChangedEvent) {
    const draftState = event.draft
    if (!draftState?.sessionId) return
    mergeDraftAttachments(draftState.sessionId, draftState.attachments)
  }

  function mergeDraftAttachments(sessionId: string, attachments: CatDraftAttachment[]) {
    const snapshot =
      sessionId === currSessionId.value ? readActiveDraftSnapshot() : readStoredDraft(sessionId)
    const nextFiles = snapshot.stagedFiles.map(cloneStagedFile)
    const existingAttachmentIds = new Set(
      nextFiles.map((file) => file.attachmentId || file.attachment_id).filter(Boolean)
    )

    for (const attachment of attachments) {
      const file = mapDraftAttachmentToStagedFile(attachment)
      if (!file || existingAttachmentIds.has(file.attachmentId)) continue
      existingAttachmentIds.add(file.attachmentId)
      nextFiles.push(file)
    }

    const nextSnapshot: CatPanelDraftSnapshot = {
      ...snapshot,
      stagedFiles: nextFiles,
    }
    draftsBySession[sessionId] = nextSnapshot

    if (sessionId === currSessionId.value) {
      restoreDraft(sessionId)
    }
  }

  function saveActiveDraft() {
    if (!currSessionId.value) return
    draftsBySession[currSessionId.value] = readActiveDraftSnapshot()
  }

  function readActiveDraftSnapshot(): CatPanelDraftSnapshot {
    return {
      text: draft.value,
      stagedFiles: media.stagedFiles.value.map(cloneStagedFile),
      stagedUploadItems: media.stagedUploadItems.value.map(cloneUploadItem),
      replyTarget: replyTarget.value ? { ...replyTarget.value } : null,
    }
  }

  function readStoredDraft(sessionId: string): CatPanelDraftSnapshot {
    const snapshot = draftsBySession[sessionId] || emptyDraftSnapshot()
    return {
      text: snapshot.text,
      stagedFiles: snapshot.stagedFiles.map(cloneStagedFile),
      stagedUploadItems: snapshot.stagedUploadItems.map(cloneUploadItem),
      replyTarget: snapshot.replyTarget ? { ...snapshot.replyTarget } : null,
    }
  }

  function restoreDraft(sessionId: string) {
    const snapshot = readStoredDraft(sessionId)
    draft.value = snapshot.text
    media.stagedFiles.value = snapshot.stagedFiles
    media.stagedUploadItems.value = snapshot.stagedUploadItems
    replyTarget.value = snapshot.replyTarget
  }

  function revokeStoredDraftUrls() {
    const urls = new Set<string>()
    Object.values(draftsBySession).forEach((snapshot) => {
      snapshot.stagedFiles.forEach((file) => {
        urls.add(file.url)
      })
      snapshot.stagedUploadItems.forEach((item) => {
        urls.add(item.url)
      })
    })
    urls.forEach(revokeBlobUrl)
  }

  function handleStreamUpdate(sessionId: string) {
    if (sessionId === currSessionId.value) scroll.scheduleScrollToLatest()
  }

  function openFilePicker() {
    fileInput.value?.click()
  }

  function setFileInput(value: Element | null) {
    fileInput.value = value instanceof HTMLInputElement ? value : null
  }

  async function handleFileInputChange(event: Event) {
    const input = event.target as HTMLInputElement
    const files = Array.from(input.files || [])
    await handleFilesDropped(files)
    input.value = ''
  }

  async function handleFilesDropped(files: File[]) {
    await media.uploadFiles(files)
    saveActiveDraft()
  }

  async function handlePaste(event: ClipboardEvent) {
    await media.handlePaste(event)
    saveActiveDraft()
  }

  function removeStagedFile(index: number) {
    const file = media.stagedFiles.value[index]
    media.removeStagedFile(index)
    saveActiveDraft()
    const attachmentId = file?.attachmentId || file?.attachment_id
    if (attachmentId && currSessionId.value) {
      void clearExternalDraft(currSessionId.value, [attachmentId])
    }
  }

  function removeUploadAt(index: number) {
    const item = media.stagedUploadItems.value[index]
    media.removeUploadItem(index)
    saveActiveDraft()
    const attachmentId = item?.attachmentId || item?.attachment_id
    if (attachmentId && currSessionId.value) {
      void clearExternalDraft(currSessionId.value, [attachmentId])
    }
  }

  async function clearExternalDraft(sessionId: string, attachmentIds?: string[]) {
    try {
      await appBridge.catPanel.clearDraft?.({ sessionId, attachmentIds })
    } catch (error) {
      controllerLogger.warn('Failed to clear cat draft.', { sessionId, attachmentIds, error })
    }
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

  async function handleSubmit() {
    if (!canSend.value) {
      if (!model.selectedModel.value) {
        notifyConfigureModel()
      }
      return
    }

    const selectedModel = model.selectedModel.value
    if (!selectedModel) return

    let sessionId = currSessionId.value
    if (!sessionId) {
      const session = await createCatSession({
        activate: true,
        providerId: selectedModel.providerId,
        modelId: selectedModel.modelId,
      })
      sessionId = session.id
    }

    const parts = buildOutgoingParts()
    if (!parts.length || !sessionId) return

    const messageId = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`
    messages.sending.value = true

    try {
      await model.selectModel(selectedModel)
      const { userRecord, botRecord } = messages.createLocalExchange({
        sessionId,
        messageId,
        parts,
      })

      draft.value = ''
      replyTarget.value = null
      media.clearStaged()
      delete draftsBySession[sessionId]
      await clearExternalDraft(sessionId)

      await messages.sendMessageStream({
        sessionId,
        messageId,
        parts,
        transport: 'sse',
        selectedProvider: selectedModel.providerId,
        selectedModel: selectedModel.modelId,
        toolProfile: agentToolProfile.value,
        enableStreaming: true,
        userRecord,
        botRecord,
      })
    } finally {
      messages.sending.value = false
    }
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
    if (!currSessionId.value || !model.selectedModel.value) {
      notifyConfigureModel()
      return
    }

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
    if (!currSessionId.value || !model.selectedModel.value) {
      notifyConfigureModel()
      return
    }

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
    saveActiveDraft()
  }

  function clearReply() {
    replyTarget.value = null
    saveActiveDraft()
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

  function notifyConfigureModel() {
    toast.info('未配置可用模型', { description: '请在主窗口设置中启用 Provider 模型。' })
  }

  function setMessagesScrollArea(value: MessageScrollAreaRef) {
    scroll.setMessagesScrollArea(value)
  }

  return {
    sessions,
    selectedSessions,
    currSessionId,
    currentSession: getCurrentSession,
    currentSessionTitle,
    currentSessionSubtitle,
    loadingSessions,
    initializing,
    creatingSession,
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
    attachmentWarning,
    canSend,
    replyPreview,
    fileInput,
    setFileInput,
    setMessagesScrollArea,
    scrollToLatestMessage: scroll.scrollToLatestMessage,
    handleCreateSession,
    handleSelectSession,
    openFilePicker,
    handleFileInputChange,
    handleFilesDropped,
    removeStagedFile,
    removeUploadAt,
    handleModelChange: model.handleModelChange,
    handleToolProfileChange,
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
    isUserMessage: messages.isUserMessage,
    isMessageStreaming: messages.isMessageStreaming,
    messageContent: messages.messageContent,
    messageBlocks,
    notifyConfigureModel,
    sessionTitle,
    sessionUpdatedLabel,
  }
}

function mapBridgeSession(session: BridgeChatSession): Session {
  const createdAt = typeof session.createdAt === 'number' ? session.createdAt : Date.now()
  const updatedAt =
    typeof session.updatedAt === 'number'
      ? session.updatedAt
      : typeof session.lastMessageAt === 'number'
        ? session.lastMessageAt
        : createdAt
  const kind = session.kind === 'cat' ? 'cat' : session.kind === 'cron' ? 'cron' : 'chat'

  return {
    ...session,
    kind,
    id: session.id,
    title: session.title || '',
    status: session.status || 'active',
    createdAt,
    updatedAt,
    session_id: session.id,
    display_name: session.title || null,
    updated_at: new Date(updatedAt).toISOString(),
    platform_id: 'cat-panel',
    creator: 'user',
    is_group: 0,
    created_at: new Date(createdAt).toISOString(),
  }
}

function sortSessionsByActivity(a: Session, b: Session) {
  return Number(b.updatedAt || b.lastMessageAt || 0) - Number(a.updatedAt || a.lastMessageAt || 0)
}

function upsertSessionInList(sessions: Session[], session: Session) {
  const index = sessions.findIndex((item) => item.id === session.id)
  if (index === -1) {
    sessions.unshift(session)
  } else {
    sessions.splice(index, 1, session)
  }
  sessions.sort(sortSessionsByActivity)
}

function cloneStagedFile(file: StagedFileInfo): StagedFileInfo {
  return { ...file }
}

function cloneUploadItem(item: StagedUploadItem): StagedUploadItem {
  return { ...item }
}

function mapDraftAttachmentToStagedFile(attachment: CatDraftAttachment): StagedFileInfo | null {
  const attachmentId = attachment.attachmentId || attachment.attachment_id
  if (!attachmentId) return null

  return {
    attachmentId,
    attachment_id: attachmentId,
    filename: attachment.filename || attachment.originalName || '附件',
    original_name: attachment.originalName || attachment.filename || '附件',
    url: attachment.previewUrl || '',
    type: mapDraftAttachmentType(attachment),
    size: attachment.sizeBytes,
    mimeType: attachment.mimeType,
    status: 'uploaded',
  }
}

function mapDraftAttachmentType(attachment: CatDraftAttachment): StagedAttachmentType {
  if (attachment.kind === 'image') return 'image'
  if (attachment.kind === 'audio') return 'record'
  if (attachment.kind === 'video') return 'video'
  if (attachment.mimeType?.startsWith('image/')) return 'image'
  if (attachment.mimeType?.startsWith('audio/')) return 'record'
  if (attachment.mimeType?.startsWith('video/')) return 'video'
  return 'file'
}

function revokeBlobUrl(url?: string) {
  if (url?.startsWith('blob:')) {
    URL.revokeObjectURL(url)
  }
}

function sessionTitle(session: Session | null | undefined) {
  return session?.title?.trim() || '小猫会话'
}

function sessionUpdatedLabel(session: Session) {
  const timestamp = Number(session.updatedAt || session.lastMessageAt || session.createdAt || 0)
  if (!timestamp) return '刚刚'

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp))
}

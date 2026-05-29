import type { ToolProfile } from '@shared/types/chat'
import { type ComputedRef, type InjectionKey, inject, type Ref } from 'vue'
import type { MessageScrollAreaRef } from '@/composables/chat/useChatWorkspaceScroll'
import type { StagedFileInfo, StagedUploadItem } from '@/composables/useMediaHandling'
import type { ChatContent, ChatRecord, MessageDisplayBlock } from '@/composables/useMessages'
import type { SessionContextUsage } from '@/stores/chat'
import type { ProviderModelOption } from '@/stores/provider'

export interface ChatWorkspaceContext {
  currSessionId: Ref<string>
  showWelcome: ComputedRef<boolean>
  activeMessages: ComputedRef<ChatRecord[]>
  showMessageList: ComputedRef<boolean>
  showMessageSkeleton: Ref<boolean>
  highlightedMessageId: Ref<string>
  showReasoningContent: ComputedRef<boolean>
  showScrollToBottom: Ref<boolean>
  draft: Ref<string>
  stagedFiles: Ref<StagedFileInfo[]>
  stagedUploadItems: Ref<StagedUploadItem[]>
  uploadPending: ComputedRef<boolean>
  enabledModelOptions: Ref<ProviderModelOption[]>
  providersLoading: Ref<boolean>
  selectedModel: ComputedRef<ProviderModelOption | undefined>
  selectedModelKey: Ref<string>
  selectedModelLabel: ComputedRef<string>
  selectedModelMeta: ComputedRef<string>
  agentToolProfile: ComputedRef<ToolProfile>
  toolProfileOptions: Array<{
    value: ToolProfile
    label: string
    description: string
  }>
  toolProfileSaving: Ref<boolean>
  currentSessionRunning: ComputedRef<boolean>
  sending: Ref<boolean>
  activeContextUsage: ComputedRef<SessionContextUsage | undefined>
  activeContextUsageLoading: ComputedRef<boolean>
  attachmentWarning: ComputedRef<string>
  canSend: ComputedRef<boolean>
  replyPreview: ComputedRef<string>
  fileInput: Ref<HTMLInputElement | null>
  setMessagesScrollArea: (value: MessageScrollAreaRef) => void
  scrollToLatestMessage: (behavior?: ScrollBehavior, force?: boolean) => void
  openSettings: () => Promise<void>
  openFilePicker: () => void
  handleFileInputChange: (event: Event) => Promise<void>
  handleFilesDropped: (files: File[]) => Promise<void>
  removeStagedFile: (index: number) => void
  removeUploadAt: (index: number) => void
  handleModelChange: (value: unknown) => Promise<void>
  handleToolProfileChange: (value: ToolProfile) => Promise<void>
  handlePaste: (event: ClipboardEvent) => Promise<void>
  handleSubmit: () => Promise<void>
  handleStop: () => Promise<void>
  handleCopyMessage: (record: ChatRecord) => Promise<void>
  handleCopyCode: (code?: string) => void
  handleEditMessage: (record: ChatRecord, text: string) => Promise<void>
  handleContinueMessage: (record: ChatRecord) => Promise<void>
  handleRegenerateMessage: (record: ChatRecord) => Promise<void>
  handleQuoteMessage: (record: ChatRecord, text: string) => void
  clearReply: () => void
  handleJumpMessage: (messageId: string) => Promise<void>
  isUserMessage: (record: ChatRecord) => boolean
  isMessageStreaming: (record: ChatRecord, index: number) => boolean
  messageContent: (record: ChatRecord) => ChatContent
  messageBlocks: (content: ChatContent) => MessageDisplayBlock[]
}

export const chatWorkspaceContextKey: InjectionKey<ChatWorkspaceContext> =
  Symbol('chatWorkspaceContext')

export function useChatWorkspaceContext() {
  const context = inject(chatWorkspaceContextKey)
  if (!context) {
    throw new Error('Chat workspace context is only available under ChatWorkspace.')
  }
  return context
}

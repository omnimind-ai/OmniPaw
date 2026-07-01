import type { ChatSession, ToolProfile } from '@shared/types/chat'
import type {
  TavernCharacter,
  TavernLorebook,
  TavernPromptPreset,
  TavernPromptPreviewResult,
  TavernSessionMetadata,
  TavernUserProfile,
} from '@shared/types/tavern'
import { type ComputedRef, type InjectionKey, inject, type Ref } from 'vue'
import type { MessageScrollAreaRef } from '@/composables/chat/useChatWorkspaceScroll'
import type { StagedFileInfo, StagedUploadItem } from '@/composables/useMediaHandling'
import type { ChatContent, ChatRecord, MessageDisplayBlock } from '@/composables/useMessages'
import type { SessionContextUsage } from '@/stores/chat'
import type { ProviderModelOption } from '@/stores/provider'

export interface ChatWorkspaceContext {
  currSessionId: Ref<string>
  showWelcome: ComputedRef<boolean>
  welcomeTitle: ComputedRef<string>
  activeMessages: ComputedRef<ChatRecord[]>
  showMessageList: ComputedRef<boolean>
  showMessageSkeleton: Ref<boolean>
  highlightedMessageId: Ref<string>
  showReasoningContent: ComputedRef<boolean>
  activeSession: ComputedRef<ChatSession | null>
  activeTavernMetadata: ComputedRef<TavernSessionMetadata | undefined>
  activeTavernCharacter: ComputedRef<TavernCharacter | undefined>
  activeTavernLorebookNames: ComputedRef<string[]>
  activeTavernPromptPreset: ComputedRef<TavernPromptPreset | undefined>
  activeTavernUserProfile: ComputedRef<TavernUserProfile | undefined>
  activeTavernGreetingOptions: ComputedRef<Array<{ index: number; label: string; text: string }>>
  activeTavernCanReplaceGreeting: ComputedRef<boolean>
  tavernCharacters: ComputedRef<TavernCharacter[]>
  tavernLorebooks: ComputedRef<TavernLorebook[]>
  tavernPromptPresets: ComputedRef<TavernPromptPreset[]>
  tavernUserProfiles: ComputedRef<TavernUserProfile[]>
  tavernSelectedCharacterId: Ref<string>
  tavernSelectedLorebookIds: Ref<string[]>
  tavernSelectedPromptPresetId: Ref<string>
  tavernSelectedUserProfileId: Ref<string>
  tavernScanDepth: Ref<number>
  tavernLoreBudget: Ref<number>
  tavernPromptPreview: Ref<TavernPromptPreviewResult | null>
  tavernPreviewLoading: Ref<boolean>
  tavernSelectedCharacterLabel: ComputedRef<string>
  tavernSelectedLorebookLabel: ComputedRef<string>
  tavernSelectedPromptPresetLabel: ComputedRef<string>
  tavernSelectedUserProfileLabel: ComputedRef<string>
  tavernCanSend: ComputedRef<boolean>
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
  toolProfileOptions: ComputedRef<
    Array<{
      value: ToolProfile
      label: string
      description: string
    }>
  >
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
  openTavernSettings: () => Promise<void>
  openFilePicker: () => void
  handleFileInputChange: (event: Event) => Promise<void>
  handleFilesDropped: (files: File[]) => Promise<void>
  removeStagedFile: (index: number) => void
  removeUploadAt: (index: number) => void
  handleModelChange: (value: unknown) => Promise<void>
  handleToolProfileChange: (value: ToolProfile) => Promise<void>
  handleTavernCharacterChange: (value: string | number) => void
  handleTavernLorebookToggle: (lorebookId: string, checked: boolean | 'indeterminate') => void
  handleTavernPromptPresetChange: (value: string | number) => void
  handleTavernUserProfileChange: (value: string | number) => void
  handleTavernScanDepthChange: (value: string | number) => void
  handleTavernLoreBudgetChange: (value: string | number) => void
  handleTavernGreetingChange: (value: string | number) => Promise<void>
  handleActiveTavernPromptPresetChange: (value: string | number) => Promise<void>
  handleActiveTavernUserProfileChange: (value: string | number) => Promise<void>
  handleActiveTavernScanDepthChange: (value: string | number) => Promise<void>
  handleActiveTavernLoreBudgetChange: (value: string | number) => Promise<void>
  handleTavernPromptPreview: () => Promise<void>
  clearTavernPromptPreview: () => void
  handlePaste: (event: ClipboardEvent) => Promise<void>
  handleSubmit: () => Promise<void>
  handleTavernSubmit: () => Promise<void>
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

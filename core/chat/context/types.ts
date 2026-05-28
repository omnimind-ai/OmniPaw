import type {
  ChatContextSummary,
  ChatMessage,
  ChatSession,
  ProviderRequestSnapshot,
  ContextUnitKind as SharedContextUnitKind,
  TransientChatImageInput,
} from '@shared/types/chat'
import type { ProviderConfig, ProviderMessage, ProviderModel } from '@shared/types/provider'
import type { DesktopSettingsConfig } from '@shared/types/settings'
import type { SkillPromptContext } from '@shared/types/skill'

export type UsageSource = 'actual' | 'estimated' | 'mixed'

export interface ContextSummaryStore {
  latestUsable(sessionId: string): ChatContextSummary | undefined
}

export type ChatContextDefaults = NonNullable<DesktopSettingsConfig['app']['chatContext']>

export interface ContextBuilderOptions {
  summaries?: ContextSummaryStore
  contextDefaults?: () => ChatContextDefaults | undefined
}

export interface BuildContextInput {
  session: ChatSession
  messages: ChatMessage[]
  currentUserMessageId: string
  provider: ProviderConfig
  model: ProviderModel
  skillPrompt?: SkillPromptContext
  transientImageInputs?: TransientChatImageInput[]
}

export interface BuildContextResult {
  messages: ProviderMessage[]
  snapshot: ProviderRequestSnapshot
}

export interface ContextBudget {
  contextWindow?: number
  reservedOutputTokens: number
  maxInputTokens: number
  usageSource: UsageSource
  compactThresholdPercent: number
  autoCompact: boolean
}

export type ContextUnitKind = Exclude<SharedContextUnitKind, 'runtime'>

export interface ContextUnit {
  id: string
  kind: ContextUnitKind
  source: string
  priority: number
  required: boolean
  messageId?: string
  messageCreatedAt?: number
  attachmentCount?: number
  estimatedTokens: number
  messages: ProviderMessage[]
  refId?: string
  fallbackReason?: string
}

export interface ContextUnitStats {
  kind: ContextUnitKind
  selectedCount: number
  droppedCount: number
  estimatedTokens: number
  refId?: string
  fallbackReason?: string
}

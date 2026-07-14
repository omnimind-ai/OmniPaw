import type { CatPetGiftConfig, CatPetInteractionConfig } from './cat-pet'
import type { ContextAttachmentPolicy, ToolProfile } from './chat'
import type {
  CompanionRoleAvatar,
  CompanionRoleKnowledgeEntry,
  CompanionRoleSourceMetadata,
} from './companion-role'
import type { LocalAgentTerminalSettings, LocalAgentWorkspaceSettings } from './local-agent'
import type { DesktopMemorySettings } from './memory'
import type { ObservationScope, ObservationScreenshotRetention } from './observation'
import type {
  ProviderApi,
  ProviderCapabilities,
  ProviderCompat,
  ProviderModel,
  ProviderType,
} from './provider'
import type { DesktopShortcutSettings } from './shortcuts'

export type DesktopSettingsVersion = 1
export type AppTheme = 'system' | 'light' | 'dark'
export type AppLanguage = 'zh-CN' | 'en-US' | 'system'
export type SettingsChangeReason = 'load' | 'save' | 'reset'

export interface DesktopSystemContextMaskSettings {
  enabled: boolean
  label?: string
  text: string
}

export interface DesktopSystemContextSettings {
  baseSystemPrompt: string
  mask?: DesktopSystemContextMaskSettings
}

export interface DesktopAppBackgroundImage {
  path: string
  url: string
  width: number
  height: number
  aspectRatio: number
  mimeType: string
}

export interface DesktopAppBackgroundSettings {
  enabled: boolean
  opacity: number
  blur: number
  image?: DesktopAppBackgroundImage
}

export interface DesktopCompanionRoleKnowledgeSettings {
  scanDepth: number
  maxTokens: number
}

export interface DesktopCompanionRoleAdvancedSettings {
  enabled: boolean
  systemPrompt: string
  exampleDialogue: string
  finalInstructions: string
}

export interface DesktopCompanionRoleSettings {
  id: string
  name: string
  introduction: string
  avatar?: CompanionRoleAvatar
  appearancePackId?: string
  userNickname: string
  personality: string
  speechStyle: string
  relationship: string
  background: string
  proactiveStyle: string
  advanced: DesktopCompanionRoleAdvancedSettings
  petInteractions: CatPetInteractionConfig[]
  petGifts: CatPetGiftConfig[]
  knowledgeSettings: DesktopCompanionRoleKnowledgeSettings
  knowledgeEntries: CompanionRoleKnowledgeEntry[]
  source?: CompanionRoleSourceMetadata
  defaultProviderId?: string
  defaultModelId?: string
}

export interface DesktopBaseSettings {
  language: AppLanguage
  theme: AppTheme
  initialized: boolean
  minimizeToTrayOnStartup: boolean
  welcomeTitle: string
  showReasoningContent: boolean
  zoom: {
    factor: number
    min: number
    max: number
  }
  maxRecentMessages: number
  chatContext: DesktopChatContextSettings
  memory: DesktopMemorySettings
  systemContext: DesktopSystemContextSettings
  companionRoles: DesktopCompanionRoleSettings[]
  activeCompanionRoleId: string
  background: DesktopAppBackgroundSettings
  compactSkillDescriptions: boolean
  shortcuts: DesktopShortcutSettings
  dataDir?: string
}

export interface DesktopChatContextSettings {
  recentMessages: number
  maxInputBudgetPercent: number
  includeAttachments: ContextAttachmentPolicy
  autoCompact: boolean
  compactThresholdPercent: number
  compactModelId?: string
}

export interface DesktopProviderSource {
  id: string
  type: ProviderType
  api: ProviderApi
  name: string
  baseUrl: string
  enabled: boolean
  credentialRef?: string
  authHeader?: string
  apiKey?: string
  credentialEnvVar?: string
  headers: Record<string, string>
  extraBody: Record<string, unknown>
  defaultModelId?: string
  capabilities: ProviderCapabilities
  compat?: ProviderCompat
  createdAt: number
  updatedAt: number
  omniInferInstallDir?: string
  /** @deprecated Use `omniInferInstallDir`; kept only for old config normalization. */
  omniInferBinaryPath?: string
}

export interface DesktopProviderModel
  extends Omit<ProviderModel, 'providerId' | 'displayName' | 'capabilities'> {
  providerSourceId: string
  capabilities: Record<string, unknown>
  createdAt: number
  updatedAt: number
}

export interface DesktopProviderSettings {
  defaultModelId: string
  fallbackModelIds: string[]
  streaming: boolean
}

export interface DesktopProvidersSettings {
  sources: DesktopProviderSource[]
  models: DesktopProviderModel[]
  settings: DesktopProviderSettings
}

export interface DesktopToolSettings {
  agentToolProfile: ToolProfile
  maxAgentSteps: number
  enabledByName: Record<string, boolean>
  workspace: LocalAgentWorkspaceSettings
  terminal: LocalAgentTerminalSettings
}

export type ScheduledTaskMisfirePolicy = 'run_once' | 'skip'

export interface DesktopScheduledTaskSettings {
  enabled: boolean
  misfirePolicy: ScheduledTaskMisfirePolicy
  misfireGraceMs: number
  misfireStartupLimit: number
}

export interface DesktopObservationSettings {
  evaluationIntervalMs: number
  captureProbability: number
  reactionNudgeAfterSilentCaptures: number
  reactionNudgeProbability: number
  minCaptureIntervalMs: number
  defaultScope: ObservationScope
  screenshotRetention: ObservationScreenshotRetention
  allowRemoteProviders: boolean
  localOnly: boolean
  dailyCaptureLimit: number
  consecutiveFailureLimit: number
  notificationCooldownMs: number
}

export interface DesktopSettingsConfig {
  version: DesktopSettingsVersion
  app: DesktopBaseSettings
  providers: DesktopProvidersSettings
  tools: DesktopToolSettings
  scheduledTasks: DesktopScheduledTaskSettings
  observation: DesktopObservationSettings
}

export interface SettingsValidationIssue {
  path: string
  message: string
  code?: string
}

export type SettingsErrorCode =
  | 'invalid_json'
  | 'invalid_config'
  | 'unsupported_version'
  | 'config_io_error'
  | 'save_failed'

export interface SettingsOperationError {
  code: SettingsErrorCode
  message: string
  path?: string
  recoverable: boolean
  issues?: SettingsValidationIssue[]
}

export interface DesktopSettingsStatus {
  path: string
  backupPath: string
  exists: boolean
  backupExists: boolean
  loaded: boolean
  version?: DesktopSettingsVersion
  recoverable: boolean
  error?: SettingsOperationError
}

export interface SaveDesktopSettingsRequest {
  config: DesktopSettingsConfig
}

export interface PickDesktopBackgroundImageResponse {
  canceled: boolean
  image?: DesktopAppBackgroundImage
}

export interface DesktopSettingsChangedEvent {
  reason: SettingsChangeReason
  config: DesktopSettingsConfig
  status: DesktopSettingsStatus
}

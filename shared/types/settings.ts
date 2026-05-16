import type {
  ProviderApi,
  ProviderCapabilities,
  ProviderCompat,
  ProviderModel,
  ProviderType,
} from './provider'

export type DesktopSettingsVersion = 1
export type AppTheme = 'system' | 'light' | 'dark'
export type AppLanguage = 'zh-CN' | 'en-US' | 'system'
export type SettingsChangeReason = 'load' | 'save' | 'reset'

export interface DesktopBaseSettings {
  language: AppLanguage
  theme: AppTheme
  minimizeToTrayOnStartup: boolean
  zoom: {
    factor: number
    min: number
    max: number
  }
  maxRecentMessages: number
  compactSkillDescriptions: boolean
  dataDir?: string
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
  enabledByName: Record<string, boolean>
}

export interface DesktopScheduledTaskSettings {
  enabled: boolean
  tasks: unknown[]
}

export interface DesktopSettingsConfig {
  version: DesktopSettingsVersion
  app: DesktopBaseSettings
  providers: DesktopProvidersSettings
  tools: DesktopToolSettings
  scheduledTasks: DesktopScheduledTaskSettings
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

export interface DesktopSettingsChangedEvent {
  reason: SettingsChangeReason
  config: DesktopSettingsConfig
  status: DesktopSettingsStatus
}

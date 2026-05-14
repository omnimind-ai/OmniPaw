export interface AppConfig {
  dataDir?: string
  activeProviderId?: string
  maxRecentMessages: number
}

export const defaultConfig: AppConfig = {
  maxRecentMessages: 20,
}

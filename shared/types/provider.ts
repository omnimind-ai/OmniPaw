export type ProviderType = 'openai-compatible' | 'ollama' | 'omniinfer'

export interface ModelConfig {
  id: string
  name: string
  contextWindow?: number
}

export interface ProviderConfig {
  id: string
  name: string
  type: ProviderType
  baseUrl: string
  apiKey?: string
  models: ModelConfig[]
  enabled: boolean
}

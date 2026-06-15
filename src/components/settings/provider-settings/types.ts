import type {
  ProviderApi,
  ProviderCapabilities,
  ProviderCompat,
  ProviderType,
} from '@shared/types/provider'

export type ProviderDraftTab = 'basic' | 'models' | 'advanced'
export type CredentialMode = 'api-key' | 'env' | 'none'
export type ModelInput = 'text' | 'image' | 'audio' | 'file'

export interface ProviderDraft {
  id: string
  name: string
  type: ProviderType
  api: ProviderApi
  baseUrl: string
  enabled: boolean
  credentialRef?: string
  authHeader: string
  headersText: string
  extraBodyText: string
  capabilities: Required<ProviderCapabilities>
  compat: Required<ProviderCompat>
  models: ProviderModelDraft[]
  createdAt?: number
  updatedAt?: number
  omniInferInstallDir?: string
}

export interface ProviderModelDraft {
  id: string
  name: string
  remoteId: string
  enabled: boolean
  input: ModelInput[]
  supportsStreaming: boolean
  supportsTools: boolean
  supportsReasoning: boolean
  contextWindow?: number
  maxOutputTokens?: number
  compat?: ProviderCompat
}

export interface ProviderSidebarItem {
  id: string
  name: string
  baseUrl: string
  type?: string
  enabled?: boolean
  unsaved?: boolean
}

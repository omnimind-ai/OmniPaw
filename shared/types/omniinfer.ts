import type { ProviderModelRef } from './provider'

export type OmniInferPlatform = 'mac' | 'linux' | 'windows'

export type OmniInferRuntimeState = 'stopped' | 'starting' | 'running' | 'unavailable' | 'error'

export type OmniInferInstallPhase =
  | 'idle'
  | 'preparing'
  | 'installing-runtime'
  | 'starting'
  | 'downloading'
  | 'selecting-backend'
  | 'loading-model'
  | 'syncing-provider'
  | 'completed'
  | 'failed'

export interface OmniInferBackendSummary {
  id: string
  name?: string
  installed?: boolean
  compatible?: boolean
  selected?: boolean
  path?: string
}

export interface OmniInferCatalogModel {
  id: string
  family: string
  name: string
  quantization?: string
  backend?: string
  downloadUrl: string
  filename: string
  sizeBytes?: number
  sizeGiB?: number
  input: Array<'text' | 'image'>
  contextWindow?: number
  recommended?: boolean
  installed?: boolean
  localPath?: string
  visionDownloadUrl?: string
  visionFilename?: string
  visionSizeBytes?: number
  visionInstalled?: boolean
  visionLocalPath?: string
}

export interface OmniInferCatalogResponse {
  platform: OmniInferPlatform
  models: OmniInferCatalogModel[]
  fetchedAt: number
}

export interface OmniInferInstallProgress {
  phase: OmniInferInstallPhase
  modelId?: string
  label?: string
  bytesReceived?: number
  totalBytes?: number
  percent?: number
  error?: string
  updatedAt: number
}

export interface OmniInferStatus {
  state: OmniInferRuntimeState
  baseUrl: string
  providerId: string
  modelDir: string
  runtimePath?: string
  pid?: number
  activeModelId?: string
  activeModelPath?: string
  providerModelRef?: ProviderModelRef
  backend?: OmniInferBackendSummary
  progress: OmniInferInstallProgress
  lastError?: string
  updatedAt: number
}

export interface OmniInferDownloadAndActivateRequest {
  modelId: string
  setDefault?: boolean
}

export interface OmniInferLoadModelRequest {
  modelPath: string
  modelId?: string
  backend?: string
  setDefault?: boolean
}

export interface OmniInferOperationResult {
  ok: boolean
  status: OmniInferStatus
  model?: OmniInferCatalogModel
  providerModelRef?: ProviderModelRef
  error?: {
    code: string
    message: string
    recoverable: boolean
  }
}

export interface OmniInferChangedEvent {
  status: OmniInferStatus
}

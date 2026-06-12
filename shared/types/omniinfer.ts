export type OmniInferProcessState =
  | 'not_bundled'
  | 'stopped'
  | 'starting'
  | 'running'
  | 'unhealthy'
  | 'crashed'

export interface OmniInferProcessSnapshot {
  state: OmniInferProcessState
  previousState?: OmniInferProcessState
  binaryPath?: string
  modelsDir?: string
  pid?: number
  exitCode?: number | null
  signal?: NodeJS.Signals | null
  errorMessage?: string
  lastUpdatedAt: number
}

export interface OmniInferServerStatus {
  online: boolean
  baseUrl: string
  host: string
  port: number
  lastCheckedAt: number
}

export interface OmniInferLoadedModel {
  path: string
  id?: string
  name?: string
  backend?: string
  ctxSize?: number
  runtimeMode?: string
  backendPort?: number
  ready: boolean
}

export interface OmniInferRuntimeSnapshot {
  process: OmniInferProcessSnapshot
  server: OmniInferServerStatus
  loadedModel: OmniInferLoadedModel | null
  thinking: boolean
  backends: OmniInferBackendDescriptor[]
  /**
   * True when the gateway at `server.baseUrl` is reachable but the local process controller did
   * not spawn it (no `binaryPath`, no managed `pid`). Indicates a user-supplied OmniInfer instance.
   */
  externallyManaged: boolean
}

export interface OmniInferBackendDescriptor {
  id: string
  selected: boolean
}

export interface InstalledModelRecord {
  id: string
  name: string
  path: string
  sizeBytes: number
  mtimeMs: number
  mmprojPath?: string
  manual?: boolean
  missing?: boolean
  missingSince?: number
  displayName?: string
  supportsVision?: boolean
  supportsThinking?: boolean
  contextLength?: number
}

export interface InstalledModelsSnapshot {
  modelsDir: string
  models: InstalledModelRecord[]
  scannedAt: number
}

export type OmniInferControlErrorCode =
  | 'MODEL_NOT_READY'
  | 'VALIDATION_ERROR'
  | 'GATEWAY_UNREACHABLE'
  | 'TIMEOUT'
  | 'INTERNAL_ERROR'

export interface OmniInferControlError {
  code: OmniInferControlErrorCode
  message: string
  status?: number
  path?: string
}

export interface OmniInferLogEntry {
  stream: 'stdout' | 'stderr'
  level: 'debug' | 'info' | 'warn' | 'error'
  message: string
  timestamp: number
}

export interface SelectModelByIdRequest {
  modelId: string
  options?: OmniInferModelLoadOptions
}

export interface SelectModelByPathRequest {
  path: string
  mmproj?: string
  options?: OmniInferModelLoadOptions
}

export type SelectModelRequest = SelectModelByIdRequest | SelectModelByPathRequest

export function isSelectModelByPathRequest(
  request: SelectModelRequest
): request is SelectModelByPathRequest {
  return typeof (request as SelectModelByPathRequest).path === 'string'
}

export interface OmniInferModelLoadOptions {
  contextLength?: number
  launchArgs?: string[]
  requestDefaults?: {
    maxTokens?: number
    temperature?: number
    topP?: number
    topK?: number
    repeatPenalty?: number
  }
}

export interface SetThinkingRequest {
  enabled: boolean
}

export interface PickLocalGgufResponse {
  path: string | null
}

export interface PickModelsDirResponse {
  path: string | null
}

export interface OmniInferStartOptions {
  /** Override base URL for testing; defaults to `http://127.0.0.1:19157`. */
  baseUrl?: string
}

export interface RescanInstalledModelsResponse {
  models: InstalledModelRecord[]
  modelsDir: string
}

export interface GetOmniInferLogsPathResponse {
  path: string
  exists: boolean
}

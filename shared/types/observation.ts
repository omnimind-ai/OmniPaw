import type { ChatSessionKind, ID, UnixMs } from './chat'
import type { ProviderModelRef } from './provider'

export type ObservationTargetSessionKind = Extract<ChatSessionKind, 'chat' | 'cat'>

export type ObservationScope = 'primary_display' | 'selected_display' | 'selected_window'

export type ObservationOutputMode = 'silent' | 'ambient' | 'chat' | 'ask'

export type ObservationRetention = 'ephemeral' | 'save_to_chat'

export type ObservationSurface = 'none' | 'chat' | 'cat'

export type ObservationRunStatus = 'active' | 'stopped' | 'expired' | 'failed'

export type ObservationStopReason = 'user' | 'expired' | 'failed' | 'app_exit'

export type ObservationPermissionState =
  | 'granted'
  | 'denied'
  | 'not-determined'
  | 'restricted'
  | 'unsupported'
  | 'unknown'

export interface ObservationPermissionStatus {
  platform: string
  screen: ObservationPermissionState
  canPrompt: boolean
  message?: string
}

export interface ObservationRemoteRiskAcceptance {
  vision?: boolean
  reaction?: boolean
}

export interface ObservationCaptureRequest {
  runId: ID
  scope: ObservationScope
  sourceId?: string
}

export interface ObservationCaptureMetadata {
  captureId: ID
  scope: ObservationScope
  sourceId?: string
  sourceType?: 'screen' | 'window'
  mimeType: string
  width: number
  height: number
  createdAt: UnixMs
  retention: ObservationRetention
}

export interface ObservationCapturedFrame extends ObservationCaptureMetadata {
  dataUrl: string
}

export interface ObservationModelChain {
  visionModelRef: ProviderModelRef
  reactionModelRef: ProviderModelRef
  mode: 'single_multimodal' | 'split'
  remoteVision: boolean
  remoteReaction: boolean
}

export interface ObservationRun {
  id: ID
  targetSessionId: ID
  targetSessionKind: ObservationTargetSessionKind
  surface: ObservationSurface
  status: ObservationRunStatus
  startedAt: UnixMs
  expiresAt: UnixMs
  stoppedAt?: UnixMs
  stopReason?: ObservationStopReason
  durationMs: number
  intervalMs: number
  scope: ObservationScope
  outputMode: ObservationOutputMode
  retention: ObservationRetention
  allowRemoteProviders: boolean
  localOnly: boolean
  remoteRiskAccepted?: ObservationRemoteRiskAcceptance
  visionModelRef?: ProviderModelRef
  reactionModelRef?: ProviderModelRef
  modelChainMode?: ObservationModelChain['mode']
  lastCapture?: ObservationCaptureMetadata
  lastReactionAt?: UnixMs
  lastDecision?: ObservationReactionDecision
  failureCount: number
  error?: ObservationErrorInfo
}

export interface StartObservationRequest {
  targetSessionId: ID
  targetSessionKind: ObservationTargetSessionKind
  surface?: ObservationSurface
  durationMs?: number
  intervalMs?: number
  scope?: ObservationScope
  outputMode?: ObservationOutputMode
  retention?: ObservationRetention
  allowRemoteProviders?: boolean
  localOnly?: boolean
  sourceId?: string
  remoteRiskAccepted?: ObservationRemoteRiskAcceptance
}

export interface StopObservationRequest {
  runId?: ID
  targetSessionId?: ID
  reason?: ObservationStopReason
}

export interface TriggerObservationRequest {
  runId?: ID
  targetSessionId?: ID
}

export interface ObservationStatusRequest {
  targetSessionId?: ID
}

export interface ObservationState {
  activeRuns: ObservationRun[]
  permission: ObservationPermissionStatus
  updatedAt: UnixMs
}

export type ObservationChangedReason =
  | 'started'
  | 'updated'
  | 'tick'
  | 'stopped'
  | 'expired'
  | 'failed'

export interface ObservationChangedEvent {
  reason: ObservationChangedReason
  run?: ObservationRun
  activeRuns: ObservationRun[]
  error?: ObservationErrorInfo
  updatedAt: UnixMs
}

export type ObservationErrorCode =
  | 'disabled'
  | 'invalid_request'
  | 'session_not_found'
  | 'permission_denied'
  | 'capture_failed'
  | 'no_vision_model'
  | 'model_capability'
  | 'remote_provider_blocked'
  | 'remote_vision_confirmation_required'
  | 'remote_reaction_confirmation_required'
  | 'provider_failed'
  | 'run_not_found'
  | 'run_busy'
  | 'aborted'
  | 'unknown'

export interface ObservationErrorInfo {
  code: ObservationErrorCode
  message: string
  recoverable?: boolean
}

export interface ObservationReactionCandidate {
  mode?: ObservationOutputMode
  text: string
  reason?: string
}

export interface ObservationReactionDecision {
  mode: ObservationOutputMode
  text?: string
  reason?: string
  captureId?: ID
  createdAt: UnixMs
}

export interface ObservationReactionEvent {
  id: ID
  observationRunId: ID
  targetSessionId: ID
  targetSessionKind: ObservationTargetSessionKind
  surface: ObservationSurface
  decision: Extract<ObservationOutputMode, 'ambient' | 'chat' | 'ask'>
  text: string
  captureId?: ID
  createdAt: UnixMs
}

export interface ScreenObserveToolResult {
  ok: boolean
  captureId: ID
  mimeType: string
  width: number
  height: number
  createdAt: UnixMs
  retention: ObservationRetention
}

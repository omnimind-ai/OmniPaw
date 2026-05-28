import type { ID, UnixMs } from './chat'
import type { ProviderModelRef } from './provider'

export type ObservationScope = 'primary_display' | 'selected_display' | 'selected_window'

export type ObservationDecision = 'silent' | 'notify' | 'ask'

export type ObservationScreenshotRetention = 'ephemeral' | 'persist'

export type ObservationRunStatus = 'active' | 'stopped' | 'failed'

export type ObservationStopReason = 'user' | 'failed' | 'app_exit' | 'session_deleted'

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

export interface ObservationCaptureRequest {
  runId: ID
  visionSessionId: ID
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
  retention: ObservationScreenshotRetention
}

export interface ObservationCapturedFrame extends ObservationCaptureMetadata {
  dataUrl: string
  attachmentId?: ID
}

export interface ObservationModelChain {
  visionModelRef: ProviderModelRef
  reactionModelRef?: ProviderModelRef
  mode: 'single_multimodal' | 'split'
}

export interface ObservationRuleState {
  evaluationIntervalMs: number
  captureProbability: number
  minCaptureIntervalMs: number
  dailyCaptureLimit: number
  consecutiveFailureLimit: number
  notificationCooldownMs: number
  lastEvaluationAt?: UnixMs
  lastAcceptedAt?: UnixMs
  skippedReason?: ObservationSkipReason
  capturesToday: number
}

export type ObservationSkipReason =
  | 'probability_miss'
  | 'min_capture_interval'
  | 'daily_limit'
  | 'busy'
  | 'inactive'
  | 'permission_denied'
  | 'model_unavailable'

export interface ObservationNotificationState {
  lastNotificationAt?: UnixMs
  lastSuppressedAt?: UnixMs
  cooldownMs: number
}

export interface ObservationRun {
  id: ID
  visionSessionId: ID
  status: ObservationRunStatus
  startedAt: UnixMs
  stoppedAt?: UnixMs
  stopReason?: ObservationStopReason
  scope: ObservationScope
  screenshotRetention: ObservationScreenshotRetention
  visionModelRef?: ProviderModelRef
  reactionModelRef?: ProviderModelRef
  modelChainMode?: ObservationModelChain['mode']
  rule: ObservationRuleState
  notification: ObservationNotificationState
  lastCapture?: ObservationCaptureMetadata
  lastDecision?: ObservationReactionDecision
  lastRunId?: ID
  lastUserMessageId?: ID
  lastAssistantMessageId?: ID
  failureCount: number
  error?: ObservationErrorInfo
}

export interface StartObservationRequest {
  visionSessionId?: ID
  scope?: ObservationScope
  screenshotRetention?: ObservationScreenshotRetention
  sourceId?: string
}

export interface StopObservationRequest {
  runId?: ID
  visionSessionId?: ID
  reason?: ObservationStopReason
}

export interface TriggerObservationRequest {
  runId?: ID
  visionSessionId?: ID
  devForceReaction?: boolean
}

export interface ObservationStatusRequest {
  visionSessionId?: ID
}

export interface ObservationRuntimeState {
  active: boolean
  status: 'inactive' | ObservationRunStatus
  visionSessionId?: ID
  runId?: ID
  startedAt?: UnixMs
  busy?: boolean
  updatedAt: UnixMs
}

export interface ObservationState {
  activeRuns: ObservationRun[]
  runtime: ObservationRuntimeState
  visionSessionId?: ID
  permission: ObservationPermissionStatus
  updatedAt: UnixMs
}

export type ObservationChangedReason =
  | 'started'
  | 'updated'
  | 'evaluated'
  | 'tick'
  | 'stopped'
  | 'failed'

export interface ObservationChangedEvent {
  reason: ObservationChangedReason
  run?: ObservationRun
  activeRuns: ObservationRun[]
  runtime: ObservationRuntimeState
  error?: ObservationErrorInfo
  updatedAt: UnixMs
}

export type ObservationErrorCode =
  | 'invalid_request'
  | 'session_not_found'
  | 'permission_denied'
  | 'capture_failed'
  | 'daily_limit'
  | 'min_capture_interval'
  | 'no_vision_model'
  | 'model_capability'
  | 'privacy_policy'
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
  decision?: ObservationDecision
  text: string
  reason?: string
  summary?: string
}

export interface ObservationReactionDecision {
  decision: ObservationDecision
  text?: string
  reason?: string
  summary?: string
  captureId?: ID
  runId?: ID
  messageId?: ID
  notificationSuppressed?: boolean
  suppressionReason?: 'cooldown' | 'empty_text'
  createdAt: UnixMs
}

export interface ObservationReactionEvent {
  id: ID
  observationRunId: ID
  visionSessionId: ID
  catSessionId: ID
  sourceRunId?: ID
  sourceMessageId?: ID
  decision: Extract<ObservationDecision, 'notify' | 'ask'>
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
  retention: ObservationScreenshotRetention
}

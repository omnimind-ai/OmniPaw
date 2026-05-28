import { IPC_CHANNELS } from '@shared/constants'
import type {
  ObservationStatusRequest,
  StartObservationRequest,
  StopObservationRequest,
  TriggerObservationRequest,
} from '@shared/types/observation'
import { isRecord, registerLoggedIpcHandler } from './common'
import type { IpcHandlerOptions } from './types'

const scopes = new Set(['primary_display', 'selected_display', 'selected_window'])
const retentions = new Set(['ephemeral', 'persist'])
const stopReasons = new Set(['user', 'expired', 'failed', 'app_exit', 'session_deleted'])

export function registerObservationIpcHandlers(options: IpcHandlerOptions): void {
  const observation = options.runtime.observationManager

  registerLoggedIpcHandler(options, IPC_CHANNELS.observation.permissionStatus, () =>
    observation.permissionStatus()
  )
  registerLoggedIpcHandler(options, IPC_CHANNELS.observation.status, (_event, request?: unknown) =>
    observation.status(normalizeStatusRequest(request).visionSessionId)
  )
  registerLoggedIpcHandler(options, IPC_CHANNELS.observation.start, (_event, request: unknown) =>
    observation.start(normalizeStartRequest(request))
  )
  registerLoggedIpcHandler(options, IPC_CHANNELS.observation.stop, (_event, request?: unknown) =>
    observation.stop(normalizeStopRequest(request))
  )
  registerLoggedIpcHandler(options, IPC_CHANNELS.observation.trigger, (_event, request?: unknown) =>
    observation.trigger(normalizeTriggerRequest(request))
  )
}

function normalizeStatusRequest(request: unknown): ObservationStatusRequest {
  if (!isRecord(request)) {
    return {}
  }
  return {
    ...(typeof request.visionSessionId === 'string'
      ? { visionSessionId: request.visionSessionId }
      : {}),
  }
}

function normalizeStartRequest(request: unknown): StartObservationRequest {
  if (request === undefined || request === null) {
    return {}
  }
  if (!isRecord(request)) {
    throw new Error('Observation start request must be an object.')
  }
  if ('targetSessionId' in request || 'targetSessionKind' in request) {
    throw new Error(
      'Observation start no longer accepts targetSessionId or targetSessionKind; start a vision session runtime instead.'
    )
  }

  return {
    ...(typeof request.visionSessionId === 'string'
      ? { visionSessionId: request.visionSessionId }
      : {}),
    ...(isFiniteNumber(request.durationMs) ? { durationMs: Math.floor(request.durationMs) } : {}),
    ...(scopes.has(String(request.scope))
      ? { scope: request.scope as StartObservationRequest['scope'] }
      : {}),
    ...(retentions.has(String(request.screenshotRetention))
      ? {
          screenshotRetention:
            request.screenshotRetention as StartObservationRequest['screenshotRetention'],
        }
      : {}),
    ...(typeof request.sourceId === 'string' ? { sourceId: request.sourceId } : {}),
  }
}

function normalizeStopRequest(request: unknown): StopObservationRequest {
  if (!isRecord(request)) {
    return {}
  }
  return {
    ...(typeof request.runId === 'string' ? { runId: request.runId } : {}),
    ...(typeof request.visionSessionId === 'string'
      ? { visionSessionId: request.visionSessionId }
      : {}),
    ...(stopReasons.has(String(request.reason))
      ? { reason: request.reason as StopObservationRequest['reason'] }
      : {}),
  }
}

function normalizeTriggerRequest(request: unknown): TriggerObservationRequest {
  if (!isRecord(request)) {
    return {}
  }
  return {
    ...(typeof request.runId === 'string' ? { runId: request.runId } : {}),
    ...(typeof request.visionSessionId === 'string'
      ? { visionSessionId: request.visionSessionId }
      : {}),
    ...(request.devForceReaction === true ? { devForceReaction: true } : {}),
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

import { IPC_CHANNELS } from '@shared/constants'
import type {
  ObservationStatusRequest,
  StartObservationRequest,
  StopObservationRequest,
  TriggerObservationRequest,
} from '@shared/types/observation'
import { isRecord, registerLoggedIpcHandler } from './common'
import type { IpcHandlerOptions } from './types'

const targetKinds = new Set(['chat', 'cat'])
const surfaces = new Set(['none', 'chat', 'cat'])
const scopes = new Set(['primary_display', 'selected_display', 'selected_window'])
const outputModes = new Set(['silent', 'ambient', 'chat', 'ask'])
const retentions = new Set(['ephemeral', 'save_to_chat'])
const stopReasons = new Set(['user', 'expired', 'failed', 'app_exit'])

export function registerObservationIpcHandlers(options: IpcHandlerOptions): void {
  const observation = options.runtime.observationManager

  registerLoggedIpcHandler(options, IPC_CHANNELS.observation.permissionStatus, () =>
    observation.permissionStatus()
  )
  registerLoggedIpcHandler(options, IPC_CHANNELS.observation.status, (_event, request?: unknown) =>
    observation.status(normalizeStatusRequest(request).targetSessionId)
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
    ...(typeof request.targetSessionId === 'string'
      ? { targetSessionId: request.targetSessionId }
      : {}),
  }
}

function normalizeStartRequest(request: unknown): StartObservationRequest {
  if (!isRecord(request)) {
    throw new Error('Observation start request must be an object.')
  }
  if (typeof request.targetSessionId !== 'string' || !request.targetSessionId.trim()) {
    throw new Error('Observation start requires targetSessionId.')
  }
  if (!targetKinds.has(String(request.targetSessionKind))) {
    throw new Error('Observation start requires targetSessionKind chat or cat.')
  }

  return {
    targetSessionId: request.targetSessionId,
    targetSessionKind: request.targetSessionKind as StartObservationRequest['targetSessionKind'],
    ...(surfaces.has(String(request.surface))
      ? { surface: request.surface as StartObservationRequest['surface'] }
      : {}),
    ...(isFiniteNumber(request.durationMs) ? { durationMs: Math.floor(request.durationMs) } : {}),
    ...(isFiniteNumber(request.intervalMs) ? { intervalMs: Math.floor(request.intervalMs) } : {}),
    ...(scopes.has(String(request.scope))
      ? { scope: request.scope as StartObservationRequest['scope'] }
      : {}),
    ...(outputModes.has(String(request.outputMode))
      ? { outputMode: request.outputMode as StartObservationRequest['outputMode'] }
      : {}),
    ...(retentions.has(String(request.retention))
      ? { retention: request.retention as StartObservationRequest['retention'] }
      : {}),
    ...(typeof request.allowRemoteProviders === 'boolean'
      ? { allowRemoteProviders: request.allowRemoteProviders }
      : {}),
    ...(typeof request.localOnly === 'boolean' ? { localOnly: request.localOnly } : {}),
    ...(typeof request.sourceId === 'string' ? { sourceId: request.sourceId } : {}),
    ...(isRecord(request.remoteRiskAccepted)
      ? {
          remoteRiskAccepted: {
            ...(typeof request.remoteRiskAccepted.vision === 'boolean'
              ? { vision: request.remoteRiskAccepted.vision }
              : {}),
            ...(typeof request.remoteRiskAccepted.reaction === 'boolean'
              ? { reaction: request.remoteRiskAccepted.reaction }
              : {}),
          },
        }
      : {}),
  }
}

function normalizeStopRequest(request: unknown): StopObservationRequest {
  if (!isRecord(request)) {
    return {}
  }
  return {
    ...(typeof request.runId === 'string' ? { runId: request.runId } : {}),
    ...(typeof request.targetSessionId === 'string'
      ? { targetSessionId: request.targetSessionId }
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
    ...(typeof request.targetSessionId === 'string'
      ? { targetSessionId: request.targetSessionId }
      : {}),
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

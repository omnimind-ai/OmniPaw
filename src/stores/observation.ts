import type {
  ObservationChangedEvent,
  ObservationErrorInfo,
  ObservationPermissionStatus,
  ObservationReactionEvent,
  ObservationRun,
  ObservationState,
  StartObservationRequest,
  StopObservationRequest,
  TriggerObservationRequest,
} from '@shared/types/observation'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { appBridge, type BridgeUnsubscribe } from '@/bridge/app'

const fallbackPermission = (): ObservationPermissionStatus => ({
  platform: 'unknown',
  screen: 'unknown',
  canPrompt: false,
})

export const useObservationStore = defineStore('observation', () => {
  const state = ref<ObservationState>({
    activeRuns: [],
    runtime: {
      active: false,
      status: 'inactive',
      updatedAt: Date.now(),
    },
    permission: fallbackPermission(),
    updatedAt: Date.now(),
  })
  const loading = ref(false)
  const running = ref(false)
  const error = ref<ObservationErrorInfo | unknown>(null)
  const lastEvent = ref<ObservationChangedEvent | null>(null)
  const lastNotification = ref<ObservationReactionEvent | null>(null)
  let unsubscribe: BridgeUnsubscribe | undefined
  let unsubscribeNotification: BridgeUnsubscribe | undefined
  let loadPromise: Promise<ObservationState> | undefined

  const activeRuns = computed(() => state.value.activeRuns)
  const runtime = computed(() => state.value.runtime)
  const activeRun = computed(() => state.value.activeRuns.find((run) => run.status === 'active'))
  const visionSessionId = computed(
    () => activeRun.value?.visionSessionId ?? state.value.visionSessionId
  )
  const permission = computed(() => state.value.permission)

  function getObservationBridge() {
    if (!appBridge.observation) {
      throw new Error('Observation bridge unavailable.')
    }
    return appBridge.observation
  }

  async function load(visionSessionId?: string): Promise<ObservationState> {
    if (loadPromise && !visionSessionId) {
      return loadPromise
    }

    loading.value = true
    error.value = null
    const request = visionSessionId ? { visionSessionId } : undefined
    const promise = getObservationBridge()
      .status(request)
      .then((next) => {
        state.value = next
        subscribe()
        return next
      })
    if (!visionSessionId) {
      loadPromise = promise
    }

    try {
      return await promise
    } catch (err) {
      error.value = normalizeObservationError(err)
      throw err
    } finally {
      if (!visionSessionId) {
        loadPromise = undefined
      }
      loading.value = false
    }
  }

  async function refreshPermission(): Promise<ObservationPermissionStatus> {
    const next = await getObservationBridge().permissionStatus()
    state.value = {
      ...state.value,
      permission: next,
      updatedAt: Date.now(),
    }
    return next
  }

  async function start(request: StartObservationRequest): Promise<ObservationState> {
    running.value = true
    error.value = null
    try {
      const next = await getObservationBridge().start(request)
      state.value = next
      subscribe()
      return next
    } catch (err) {
      error.value = normalizeObservationError(err)
      throw err
    } finally {
      running.value = false
    }
  }

  async function stop(request?: StopObservationRequest): Promise<ObservationState> {
    running.value = true
    error.value = null
    try {
      const next = await getObservationBridge().stop(request)
      state.value = next
      return next
    } catch (err) {
      error.value = normalizeObservationError(err)
      throw err
    } finally {
      running.value = false
    }
  }

  async function trigger(request?: TriggerObservationRequest): Promise<ObservationState> {
    running.value = true
    error.value = null
    try {
      const next = await getObservationBridge().trigger(request)
      state.value = next
      return next
    } catch (err) {
      error.value = normalizeObservationError(err)
      throw err
    } finally {
      running.value = false
    }
  }

  function runForVisionSession(sessionId: string | undefined): ObservationRun | undefined {
    if (!sessionId) return undefined
    return state.value.activeRuns.find(
      (run) => run.visionSessionId === sessionId && run.status === 'active'
    )
  }

  function subscribe(): void {
    if (unsubscribe || !appBridge.observation?.onChanged) {
      return
    }

    unsubscribe = appBridge.observation.onChanged((event) => {
      lastEvent.value = event
      state.value = {
        activeRuns: event.activeRuns,
        runtime: event.runtime,
        visionSessionId: event.runtime.visionSessionId,
        permission: state.value.permission,
        updatedAt: event.updatedAt,
      }
      if (event.error) {
        error.value = event.error
      }
    })
    unsubscribeNotification = appBridge.observation.onNotification?.((event) => {
      lastNotification.value = event
    })
  }

  function stopSubscription(): void {
    unsubscribe?.()
    unsubscribeNotification?.()
    unsubscribe = undefined
    unsubscribeNotification = undefined
  }

  return {
    state,
    activeRuns,
    activeRun,
    runtime,
    visionSessionId,
    permission,
    loading,
    running,
    error,
    lastEvent,
    lastNotification,
    load,
    refreshPermission,
    start,
    stop,
    trigger,
    runForVisionSession,
    subscribe,
    stopSubscription,
  }
})

export function normalizeObservationError(error: unknown): ObservationErrorInfo | unknown {
  if (error && typeof error === 'object' && 'details' in error) {
    return (error as { details: ObservationErrorInfo }).details
  }
  return error
}

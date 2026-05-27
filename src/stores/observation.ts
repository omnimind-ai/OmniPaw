import type {
  ObservationChangedEvent,
  ObservationErrorInfo,
  ObservationPermissionStatus,
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
    permission: fallbackPermission(),
    updatedAt: Date.now(),
  })
  const loading = ref(false)
  const running = ref(false)
  const error = ref<ObservationErrorInfo | unknown>(null)
  const lastEvent = ref<ObservationChangedEvent | null>(null)
  let unsubscribe: BridgeUnsubscribe | undefined
  let loadPromise: Promise<ObservationState> | undefined

  const activeRuns = computed(() => state.value.activeRuns)
  const permission = computed(() => state.value.permission)

  async function load(targetSessionId?: string): Promise<ObservationState> {
    if (loadPromise && !targetSessionId) {
      return loadPromise
    }

    loading.value = true
    error.value = null
    const request = targetSessionId ? { targetSessionId } : undefined
    const promise = appBridge.observation!.status(request).then((next) => {
      state.value = next
      subscribe()
      return next
    })
    if (!targetSessionId) {
      loadPromise = promise
    }

    try {
      return await promise
    } catch (err) {
      error.value = normalizeObservationError(err)
      throw err
    } finally {
      if (!targetSessionId) {
        loadPromise = undefined
      }
      loading.value = false
    }
  }

  async function refreshPermission(): Promise<ObservationPermissionStatus> {
    const next = await appBridge.observation!.permissionStatus()
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
      const next = await appBridge.observation!.start(request)
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
      const next = await appBridge.observation!.stop(request)
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
      const next = await appBridge.observation!.trigger(request)
      state.value = next
      return next
    } catch (err) {
      error.value = normalizeObservationError(err)
      throw err
    } finally {
      running.value = false
    }
  }

  function runForSession(sessionId: string | undefined): ObservationRun | undefined {
    if (!sessionId) return undefined
    return state.value.activeRuns.find(
      (run) => run.targetSessionId === sessionId && run.status === 'active'
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
        permission: state.value.permission,
        updatedAt: event.updatedAt,
      }
      if (event.error) {
        error.value = event.error
      }
    })
  }

  function stopSubscription(): void {
    unsubscribe?.()
    unsubscribe = undefined
  }

  return {
    state,
    activeRuns,
    permission,
    loading,
    running,
    error,
    lastEvent,
    load,
    refreshPermission,
    start,
    stop,
    trigger,
    runForSession,
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

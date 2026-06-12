import type {
  InstalledModelRecord,
  OmniInferLogEntry,
  OmniInferRuntimeSnapshot,
} from '@shared/types/omniinfer'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { appBridge, type BridgeUnsubscribe, isFallbackBridge } from '@/bridge/app'

const MAX_LOG_LINES = 200

const EMPTY_SNAPSHOT: OmniInferRuntimeSnapshot = {
  process: {
    state: 'not_bundled',
    lastUpdatedAt: 0,
  },
  server: {
    online: false,
    baseUrl: 'http://127.0.0.1:19157',
    host: '127.0.0.1',
    port: 19157,
    lastCheckedAt: 0,
  },
  loadedModel: null,
  thinking: false,
  backends: [],
  externallyManaged: false,
}

export const useOmniInferStore = defineStore('omniinfer', () => {
  const snapshot = ref<OmniInferRuntimeSnapshot>({ ...EMPTY_SNAPSHOT })
  const installedModels = ref<InstalledModelRecord[]>([])
  const modelsDir = ref('')
  const logs = ref<OmniInferLogEntry[]>([])
  const loadingStatus = ref(false)
  const busyModelIds = ref<Set<string>>(new Set())
  const error = ref<unknown>(null)

  const available = computed(() => !isFallbackBridge && typeof appBridge.omniinfer !== 'undefined')
  const processState = computed(() => snapshot.value.process.state)
  const serverStatus = computed(() => snapshot.value.server)
  const loadedModel = computed(() => snapshot.value.loadedModel)
  const thinking = computed(() => snapshot.value.thinking)

  let statusUnsubscribe: BridgeUnsubscribe | undefined
  let logUnsubscribe: BridgeUnsubscribe | undefined

  async function refreshStatus(): Promise<void> {
    if (!available.value) return
    loadingStatus.value = true
    error.value = null
    try {
      const result = await appBridge.omniinfer?.getStatus()
      if (result) {
        snapshot.value = result
      }
      const list = await appBridge.omniinfer?.listInstalledModels()
      if (list) {
        installedModels.value = list
      }
    } catch (err) {
      error.value = err
    } finally {
      loadingStatus.value = false
    }
  }

  async function rescanModels(): Promise<void> {
    if (!available.value) return
    try {
      const result = await appBridge.omniinfer?.rescanModels()
      if (result) {
        installedModels.value = result.models
        modelsDir.value = result.modelsDir
      }
    } catch (err) {
      error.value = err
      throw err
    }
  }

  async function start(): Promise<void> {
    if (!available.value) return
    snapshot.value = await applyOrFallback(appBridge.omniinfer?.start())
  }

  async function stop(): Promise<void> {
    if (!available.value) return
    snapshot.value = await applyOrFallback(appBridge.omniinfer?.stop())
  }

  async function selectInstalledModel(modelId: string): Promise<void> {
    if (!available.value) return
    busyModelIds.value.add(modelId)
    try {
      const result = await appBridge.omniinfer?.selectModel({ modelId })
      if (result) snapshot.value = result
    } catch (err) {
      error.value = err
      throw err
    } finally {
      busyModelIds.value.delete(modelId)
    }
  }

  async function unloadModel(): Promise<void> {
    if (!available.value) return
    const result = await appBridge.omniinfer?.unloadModel()
    if (result) snapshot.value = result
  }

  async function setThinking(enabled: boolean): Promise<void> {
    if (!available.value) return
    const result = await appBridge.omniinfer?.setThinking({ enabled })
    if (result) snapshot.value = result
  }

  async function pickLocalGguf(): Promise<string | null> {
    if (!available.value) return null
    const result = await appBridge.omniinfer?.pickLocalGguf()
    if (result?.path) {
      await rescanModels()
    }
    return result?.path ?? null
  }

  async function openLogsLocation(): Promise<void> {
    if (!available.value) return
    const result = await appBridge.omniinfer?.getLogsPath()
    if (result?.path) {
      await appBridge.app.openSettingsDirectory?.() // fallback to opening some directory
      // Native open via shell.openPath happens in main when this is a real bridge call; the
      // GetLogsPathResponse is the actual location.
    }
  }

  function subscribe(): void {
    if (!available.value) return
    statusUnsubscribe?.()
    logUnsubscribe?.()
    statusUnsubscribe = appBridge.omniinfer?.onStatusChanged((event) => {
      snapshot.value = event
    })
    logUnsubscribe = appBridge.omniinfer?.onLog((entry) => {
      logs.value = [...logs.value.slice(-MAX_LOG_LINES + 1), entry]
    })
  }

  function unsubscribe(): void {
    statusUnsubscribe?.()
    logUnsubscribe?.()
    statusUnsubscribe = undefined
    logUnsubscribe = undefined
  }

  function isBusyFor(modelId: string): boolean {
    return busyModelIds.value.has(modelId)
  }

  function reset(): void {
    snapshot.value = { ...EMPTY_SNAPSHOT }
    installedModels.value = []
    modelsDir.value = ''
    logs.value = []
    error.value = null
  }

  return {
    snapshot,
    installedModels,
    modelsDir,
    logs,
    loadingStatus,
    error,
    available,
    processState,
    serverStatus,
    loadedModel,
    thinking,
    refreshStatus,
    rescanModels,
    start,
    stop,
    selectInstalledModel,
    unloadModel,
    setThinking,
    pickLocalGguf,
    openLogsLocation,
    subscribe,
    unsubscribe,
    isBusyFor,
    reset,
  }
})

async function applyOrFallback(
  promise: Promise<OmniInferRuntimeSnapshot> | undefined
): Promise<OmniInferRuntimeSnapshot> {
  const value = await promise
  return value ?? { ...EMPTY_SNAPSHOT }
}

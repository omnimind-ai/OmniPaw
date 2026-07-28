import type {
  InstalledModelRecord,
  OmniInferBackendInstallProgress,
  OmniInferBackendSetupStatus,
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
  const backendSetup = ref<OmniInferBackendSetupStatus | null>(null)
  const loadingBackendSetup = ref(false)
  const installingBackend = ref<string | null>(null)
  const backendInstallProgress = ref<OmniInferBackendInstallProgress | null>(null)
  const busyModelIds = ref<Set<string>>(new Set())
  const error = ref<unknown>(null)

  const available = computed(() => !isFallbackBridge && typeof appBridge.omniinfer !== 'undefined')
  const processState = computed(() => snapshot.value.process.state)
  const serverStatus = computed(() => snapshot.value.server)
  const loadedModel = computed(() => snapshot.value.loadedModel)
  const thinking = computed(() => snapshot.value.thinking)
  const backendInstallPercent = computed(() => {
    const downloaded = backendInstallProgress.value?.bytesDownloaded ?? 0
    const total = backendInstallProgress.value?.bytesTotal ?? 0
    return total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : 0
  })

  let statusUnsubscribe: BridgeUnsubscribe | undefined
  let logUnsubscribe: BridgeUnsubscribe | undefined
  let backendInstallUnsubscribe: BridgeUnsubscribe | undefined

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

  async function refreshBackendSetup(): Promise<void> {
    if (!available.value) return
    loadingBackendSetup.value = true
    error.value = null
    try {
      const result = await appBridge.omniinfer?.getBackendSetup()
      if (result) {
        backendSetup.value = result
      }
    } catch (err) {
      error.value = err
      throw err
    } finally {
      loadingBackendSetup.value = false
    }
  }

  async function installBackend(backend: string): Promise<void> {
    if (!available.value || installingBackend.value) return
    installingBackend.value = backend
    backendInstallProgress.value = {
      event: 'install_started',
      backend,
    }
    error.value = null
    try {
      const result = await appBridge.omniinfer?.installBackend({ backend })
      if (result) {
        backendSetup.value = result
      }
      await refreshStatus()
    } catch (err) {
      error.value = err
      throw err
    } finally {
      installingBackend.value = null
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
    backendInstallUnsubscribe?.()
    statusUnsubscribe = appBridge.omniinfer?.onStatusChanged((event) => {
      snapshot.value = event
    })
    logUnsubscribe = appBridge.omniinfer?.onLog((entry) => {
      logs.value = [...logs.value.slice(-MAX_LOG_LINES + 1), entry]
    })
    backendInstallUnsubscribe = appBridge.omniinfer?.onBackendInstallProgress((event) => {
      backendInstallProgress.value = event
    })
  }

  function unsubscribe(): void {
    statusUnsubscribe?.()
    logUnsubscribe?.()
    backendInstallUnsubscribe?.()
    statusUnsubscribe = undefined
    logUnsubscribe = undefined
    backendInstallUnsubscribe = undefined
  }

  function isBusyFor(modelId: string): boolean {
    return busyModelIds.value.has(modelId)
  }

  function reset(): void {
    snapshot.value = { ...EMPTY_SNAPSHOT }
    installedModels.value = []
    modelsDir.value = ''
    logs.value = []
    backendSetup.value = null
    installingBackend.value = null
    backendInstallProgress.value = null
    error.value = null
  }

  return {
    snapshot,
    installedModels,
    modelsDir,
    logs,
    loadingStatus,
    backendSetup,
    loadingBackendSetup,
    installingBackend,
    backendInstallProgress,
    backendInstallPercent,
    error,
    available,
    processState,
    serverStatus,
    loadedModel,
    thinking,
    refreshStatus,
    refreshBackendSetup,
    installBackend,
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

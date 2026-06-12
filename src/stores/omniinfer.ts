import type {
  OmniInferCatalogModel,
  OmniInferCatalogResponse,
  OmniInferChangedEvent,
  OmniInferDownloadAndActivateRequest,
  OmniInferOperationResult,
  OmniInferStatus,
} from '@shared/types/omniinfer'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { appBridge, ensureElectronBridge, type BridgeUnsubscribe } from '@/bridge/app'

export const useOmniInferStore = defineStore('omniinfer', () => {
  const status = ref<OmniInferStatus | null>(null)
  const catalog = ref<OmniInferCatalogResponse | null>(null)
  const loadingStatus = ref(false)
  const loadingCatalog = ref(false)
  const activatingModelId = ref('')
  const lastResult = ref<OmniInferOperationResult | null>(null)
  let unsubscribe: BridgeUnsubscribe | undefined

  const models = computed<OmniInferCatalogModel[]>(() => catalog.value?.models ?? [])
  const activeModelId = computed(() => status.value?.providerModelRef?.modelId)
  const busy = computed(() =>
    Boolean(
      loadingStatus.value ||
        loadingCatalog.value ||
        activatingModelId.value ||
        (status.value?.progress.phase &&
          !['idle', 'completed', 'failed'].includes(status.value.progress.phase))
    )
  )

  async function loadStatus(): Promise<OmniInferStatus | null> {
    ensureElectronBridge('读取 OmniInfer 状态')
    if (!appBridge.omniinfer?.status) {
      throw new Error('当前 Electron bridge 缺少 omniinfer.status。')
    }
    loadingStatus.value = true
    try {
      status.value = await appBridge.omniinfer.status()
      return status.value
    } finally {
      loadingStatus.value = false
    }
  }

  async function loadCatalog(): Promise<OmniInferCatalogResponse | null> {
    ensureElectronBridge('读取 OmniInfer 模型目录')
    if (!appBridge.omniinfer?.catalog) {
      throw new Error('当前 Electron bridge 缺少 omniinfer.catalog。')
    }
    loadingCatalog.value = true
    try {
      catalog.value = await appBridge.omniinfer.catalog()
      return catalog.value
    } finally {
      loadingCatalog.value = false
    }
  }

  async function downloadAndActivate(
    request: OmniInferDownloadAndActivateRequest
  ): Promise<OmniInferOperationResult> {
    ensureElectronBridge('下载并启用 OmniInfer 模型')
    if (!appBridge.omniinfer?.downloadAndActivate) {
      throw new Error('当前 Electron bridge 缺少 omniinfer.downloadAndActivate。')
    }
    activatingModelId.value = request.modelId
    lastResult.value = null
    try {
      const result = await appBridge.omniinfer.downloadAndActivate(request)
      status.value = result.status
      lastResult.value = result
      await loadCatalog().catch(() => undefined)
      return result
    } finally {
      activatingModelId.value = ''
    }
  }

  function subscribe(): void {
    if (unsubscribe || !appBridge.omniinfer?.onChanged) {
      return
    }
    unsubscribe = appBridge.omniinfer.onChanged((event: OmniInferChangedEvent) => {
      status.value = event.status
    })
  }

  function stopSubscription(): void {
    unsubscribe?.()
    unsubscribe = undefined
  }

  return {
    status,
    catalog,
    models,
    activeModelId,
    busy,
    loadingStatus,
    loadingCatalog,
    activatingModelId,
    lastResult,
    loadStatus,
    loadCatalog,
    downloadAndActivate,
    subscribe,
    stopSubscription,
  }
})

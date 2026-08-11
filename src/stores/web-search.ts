import type {
  SaveWebSearchSettingsRequest,
  TestWebSearchResponse,
  WebSearchProvider,
  WebSearchSettings,
} from '@shared/types/web-search'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { appBridge, ensureElectronBridge, isFallbackBridge } from '@/bridge/app'

export const useWebSearchStore = defineStore('web-search', () => {
  const settings = ref<WebSearchSettings | null>(null)
  const draft = ref<WebSearchSettings | null>(null)
  const apiKey = ref('')
  const loading = ref(false)
  const saving = ref(false)
  const testing = ref(false)
  const error = ref<unknown>(null)
  const persistenceAvailable = computed(() => !isFallbackBridge)
  const hasChanges = computed(
    () =>
      Boolean(apiKey.value.trim()) ||
      JSON.stringify(publicDraft(draft.value)) !== JSON.stringify(publicDraft(settings.value))
  )

  async function load(): Promise<WebSearchSettings> {
    loading.value = true
    error.value = null
    try {
      const loaded = await appBridge.webSearch.getSettings()
      settings.value = cloneSettings(loaded)
      draft.value = cloneSettings(loaded)
      apiKey.value = ''
      return loaded
    } catch (reason) {
      error.value = reason
      throw reason
    } finally {
      loading.value = false
    }
  }

  function updateDraft(updater: (value: WebSearchSettings) => void): void {
    if (!draft.value) throw new Error('Web Search settings have not been loaded.')
    const next = cloneSettings(draft.value)
    updater(next)
    draft.value = next
  }

  async function save(): Promise<WebSearchSettings> {
    ensureElectronBridge('保存网络搜索设置')
    if (!draft.value) throw new Error('Web Search settings have not been loaded.')
    const savingDraft = cloneSettings(draft.value)
    const savingApiKey = apiKey.value.trim()
    saving.value = true
    error.value = null
    try {
      const request: SaveWebSearchSettingsRequest = {
        enabled: savingDraft.enabled,
        provider: savingDraft.provider,
        maxResults: savingDraft.maxResults,
        searchDepth: savingDraft.searchDepth,
        apiKey: savingApiKey || undefined,
      }
      const saved = await appBridge.webSearch.saveSettings(request)
      settings.value = cloneSettings(saved)
      if (samePublicSettings(draft.value, savingDraft)) {
        draft.value = cloneSettings(saved)
      } else if (draft.value) {
        draft.value = {
          ...draft.value,
          configuredProviders: { ...saved.configuredProviders },
          updatedAt: saved.updatedAt,
        }
      }
      if (apiKey.value.trim() === savingApiKey) apiKey.value = ''
      return saved
    } catch (reason) {
      error.value = reason
      throw reason
    } finally {
      saving.value = false
    }
  }

  async function test(provider: WebSearchProvider): Promise<TestWebSearchResponse> {
    ensureElectronBridge('测试网络搜索')
    testing.value = true
    error.value = null
    try {
      return await appBridge.webSearch.test({
        provider,
        apiKey: apiKey.value.trim() || undefined,
      })
    } catch (reason) {
      error.value = reason
      throw reason
    } finally {
      testing.value = false
    }
  }

  return {
    settings,
    draft,
    apiKey,
    loading,
    saving,
    testing,
    error,
    persistenceAvailable,
    hasChanges,
    load,
    updateDraft,
    save,
    test,
  }
})

function publicDraft(value: WebSearchSettings | null): Omit<WebSearchSettings, 'updatedAt'> | null {
  if (!value) return null
  const { updatedAt: _updatedAt, ...publicValue } = value
  return publicValue
}

function cloneSettings(value: WebSearchSettings): WebSearchSettings {
  return {
    ...value,
    configuredProviders: { ...value.configuredProviders },
  }
}

function samePublicSettings(
  left: WebSearchSettings | null,
  right: WebSearchSettings | null
): boolean {
  return JSON.stringify(publicDraft(left)) === JSON.stringify(publicDraft(right))
}

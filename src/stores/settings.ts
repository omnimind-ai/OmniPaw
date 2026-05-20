import type { ToolProfile } from '@shared/types/chat'
import { defineStore } from 'pinia'
import { computed, ref, toRaw } from 'vue'
import {
  appBridge,
  type BridgeDesktopSettingsChangedEvent,
  type BridgeDesktopSettingsConfig,
  type BridgeDesktopSettingsStatus,
  type BridgeUnsubscribe,
  ensureElectronBridge,
  isFallbackBridge,
} from '@/bridge/app'

export const useSettingsStore = defineStore('settings', () => {
  const config = ref<BridgeDesktopSettingsConfig | null>(null)
  const draft = ref<BridgeDesktopSettingsConfig | null>(null)
  const status = ref<BridgeDesktopSettingsStatus | null>(null)
  const loading = ref(false)
  const saving = ref(false)
  const error = ref<unknown>(null)
  const persistenceAvailable = computed(() => !isFallbackBridge)
  let unsubscribe: BridgeUnsubscribe | undefined
  let activeSaveSnapshot: BridgeDesktopSettingsConfig | undefined
  let loadPromise: Promise<BridgeDesktopSettingsConfig> | undefined

  const compactSkillDescriptions = computed({
    get: () => draft.value?.app.compactSkillDescriptions ?? true,
    set: (value) => updateAppSetting('compactSkillDescriptions', value),
  })
  const maxRecentMessages = computed({
    get: () => draft.value?.app.maxRecentMessages ?? 20,
    set: (value) => updateAppSetting('maxRecentMessages', value),
  })
  const agentToolProfile = computed<ToolProfile>({
    get: () => normalizeToolProfile(draft.value?.tools.agentToolProfile),
    set: (value) => updateToolProfile(value),
  })

  async function load(): Promise<BridgeDesktopSettingsConfig> {
    if (loadPromise) {
      return loadPromise
    }

    loading.value = true
    error.value = null
    loadPromise = (async () => {
      const loaded = await requireSettingsBridge().load()
      reconcileConfig(loaded)
      await refreshStatus()
      subscribeToChanges()
      return loaded
    })()

    try {
      return await loadPromise
    } catch (err) {
      error.value = normalizeSettingsError(err)
      throw err
    } finally {
      loadPromise = undefined
      loading.value = false
    }
  }

  async function refreshStatus(): Promise<BridgeDesktopSettingsStatus | null> {
    if (!appBridge.settings?.status) {
      status.value = null
      return null
    }

    status.value = await appBridge.settings.status()
    return status.value
  }

  function updateDraft(updater: (draft: BridgeDesktopSettingsConfig) => void): void {
    const current = ensureDraft()
    const next = cloneConfig(current)
    updater(next)
    draft.value = next
  }

  function updateAppSetting<K extends keyof BridgeDesktopSettingsConfig['app']>(
    key: K,
    value: BridgeDesktopSettingsConfig['app'][K]
  ): void {
    updateDraft((next) => {
      next.app[key] = value
    })
  }

  function updateToolEnabled(name: string, enabled: boolean): void {
    updateDraft((next) => {
      next.tools.enabledByName = {
        ...next.tools.enabledByName,
        [name]: enabled,
      }
    })
  }

  function updateToolProfile(profile: ToolProfile): void {
    updateDraft((next) => {
      next.tools.agentToolProfile = profile
    })
  }

  async function save(): Promise<BridgeDesktopSettingsConfig> {
    ensureElectronBridge('保存设置')
    const snapshot = cloneConfig(ensureDraft())
    activeSaveSnapshot = snapshot
    saving.value = true
    error.value = null
    try {
      const saved = await requireSettingsBridge().save({ config: snapshot })
      reconcilePersistedConfig(saved, snapshot)
      await refreshStatus()
      return saved
    } catch (err) {
      error.value = normalizeSettingsError(err)
      throw err
    } finally {
      if (activeSaveSnapshot && configsEqual(activeSaveSnapshot, snapshot)) {
        activeSaveSnapshot = undefined
      }
      saving.value = false
    }
  }

  async function reset(): Promise<BridgeDesktopSettingsConfig> {
    ensureElectronBridge('重置设置')
    saving.value = true
    error.value = null
    try {
      const resetConfig = await requireSettingsBridge().reset()
      reconcileConfig(resetConfig)
      await refreshStatus()
      return resetConfig
    } catch (err) {
      error.value = normalizeSettingsError(err)
      throw err
    } finally {
      saving.value = false
    }
  }

  function discardDraft(): void {
    draft.value = config.value ? cloneConfig(config.value) : null
  }

  function subscribeToChanges(): void {
    if (unsubscribe || !appBridge.settings?.onChanged) {
      return
    }

    unsubscribe = appBridge.settings.onChanged((event: BridgeDesktopSettingsChangedEvent) => {
      if (event.reason === 'reset' || event.reason === 'load') {
        reconcileConfig(event.config)
      } else {
        reconcilePersistedConfig(event.config)
      }
      status.value = event.status
    })
  }

  function stopSettingsSubscription(): void {
    unsubscribe?.()
    unsubscribe = undefined
  }

  function reconcileConfig(nextConfig: BridgeDesktopSettingsConfig): void {
    config.value = cloneConfig(nextConfig)
    draft.value = cloneConfig(nextConfig)
  }

  function reconcilePersistedConfig(
    nextConfig: BridgeDesktopSettingsConfig,
    saveSnapshot = activeSaveSnapshot
  ): void {
    if (saveSnapshot) {
      if (!draft.value || configsEqual(draft.value, saveSnapshot)) {
        reconcileConfig(nextConfig)
      } else {
        config.value = cloneConfig(nextConfig)
      }
      return
    }

    const hasLocalDraftChanges = Boolean(
      draft.value && config.value && !configsEqual(draft.value, config.value)
    )
    config.value = cloneConfig(nextConfig)
    if (!hasLocalDraftChanges) {
      draft.value = cloneConfig(nextConfig)
    }
  }

  function ensureDraft(): BridgeDesktopSettingsConfig {
    if (!draft.value) {
      if (config.value) {
        draft.value = cloneConfig(config.value)
      } else {
        throw new Error('Settings have not been loaded.')
      }
    }

    return draft.value
  }

  return {
    config,
    draft,
    status,
    loading,
    saving,
    error,
    persistenceAvailable,
    compactSkillDescriptions,
    maxRecentMessages,
    agentToolProfile,
    load,
    refreshStatus,
    updateDraft,
    updateAppSetting,
    updateToolEnabled,
    updateToolProfile,
    save,
    reset,
    discardDraft,
    subscribeToChanges,
    stopSettingsSubscription,
  }
})

function requireSettingsBridge() {
  if (!appBridge.settings) {
    throw new Error('当前 Electron bridge 缺少 settings API，无法读取设置。')
  }

  return appBridge.settings
}

function cloneConfig(config: BridgeDesktopSettingsConfig): BridgeDesktopSettingsConfig {
  return JSON.parse(JSON.stringify(toRaw(config))) as BridgeDesktopSettingsConfig
}

function configsEqual(
  first: BridgeDesktopSettingsConfig | null | undefined,
  second: BridgeDesktopSettingsConfig | null | undefined
): boolean {
  return JSON.stringify(first) === JSON.stringify(second)
}

function normalizeSettingsError(error: unknown): unknown {
  if (error && typeof error === 'object' && 'details' in error) {
    return (error as { details: unknown }).details
  }
  return error
}

function normalizeToolProfile(value: unknown): ToolProfile {
  if (value === 'minimal' || value === 'assistant' || value === 'power') {
    return value
  }
  return 'assistant'
}

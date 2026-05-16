import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import {
  appBridge,
  ensureElectronBridge,
  isFallbackBridge,
  type BridgeDesktopSettingsChangedEvent,
  type BridgeDesktopSettingsConfig,
  type BridgeDesktopSettingsStatus,
  type BridgeUnsubscribe,
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

  const compactSkillDescriptions = computed({
    get: () => draft.value?.app.compactSkillDescriptions ?? true,
    set: (value) => updateAppSetting('compactSkillDescriptions', value),
  })
  const maxRecentMessages = computed({
    get: () => draft.value?.app.maxRecentMessages ?? 20,
    set: (value) => updateAppSetting('maxRecentMessages', value),
  })

  async function load(): Promise<BridgeDesktopSettingsConfig> {
    loading.value = true
    error.value = null
    try {
      const loaded = await requireSettingsBridge().load()
      reconcileConfig(loaded)
      await refreshStatus()
      subscribeToChanges()
      return loaded
    } catch (err) {
      error.value = normalizeSettingsError(err)
      throw err
    } finally {
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
    value: BridgeDesktopSettingsConfig['app'][K],
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

  async function save(): Promise<BridgeDesktopSettingsConfig> {
    ensureElectronBridge('保存设置')
    saving.value = true
    error.value = null
    try {
      const saved = await requireSettingsBridge().save({ config: ensureDraft() })
      reconcileConfig(saved)
      await refreshStatus()
      return saved
    } catch (err) {
      error.value = normalizeSettingsError(err)
      throw err
    } finally {
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
      reconcileConfig(event.config)
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
    load,
    refreshStatus,
    updateDraft,
    updateAppSetting,
    updateToolEnabled,
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
  return structuredClone(config)
}

function normalizeSettingsError(error: unknown): unknown {
  if (error && typeof error === 'object' && 'details' in error) {
    return (error as { details: unknown }).details
  }
  return error
}

import { storeToRefs } from 'pinia'
import { computed, watch } from 'vue'
import type { BridgeAppLanguage } from '@/bridge/app'
import { resolveConfiguredLocale, setI18nLocale } from '@/i18n'
import { useSettingsStore } from '@/stores/settings'

export function useAppLanguage() {
  const settingsStore = useSettingsStore()
  const { config, draft } = storeToRefs(settingsStore)

  const configuredLanguage = computed<BridgeAppLanguage>(
    () => draft.value?.app.language ?? config.value?.app.language ?? 'system'
  )

  watch(
    configuredLanguage,
    (language) => {
      setI18nLocale(resolveConfiguredLocale(language))
    },
    { immediate: true }
  )

  return {
    configuredLanguage,
  }
}

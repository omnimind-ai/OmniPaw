import { useColorMode } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, watch } from 'vue'

import type { BridgeAppTheme } from '@/bridge/app'
import { useSettingsStore } from '@/stores/settings'
import { errorToText, useToast } from '@/utils/toast'

type VueUseColorMode = 'auto' | 'light' | 'dark'

export function useAppTheme() {
  const settingsStore = useSettingsStore()
  const toast = useToast()
  const { config, draft } = storeToRefs(settingsStore)

  const mode = useColorMode({
    storageKey: null,
    initialValue: 'auto',
  })

  const configuredTheme = computed<BridgeAppTheme>(
    () => draft.value?.app.theme ?? config.value?.app.theme ?? 'system'
  )

  watch(
    configuredTheme,
    (theme) => {
      mode.value = toColorMode(theme)
    },
    { immediate: true }
  )

  if (!config.value && !settingsStore.loading) {
    void settingsStore.load().catch((error) => {
      toast.error(errorToText(error, '主题设置加载失败。'))
    })
  }

  return {
    mode,
    configuredTheme,
  }
}

function toColorMode(theme: BridgeAppTheme): VueUseColorMode {
  return theme === 'system' ? 'auto' : theme
}

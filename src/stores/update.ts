import type { UpdateCheckResult } from '@shared/types/update'
import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'

import { appBridge } from '@/bridge/app'

export const useAppUpdateStore = defineStore('app-update', () => {
  const updateInfo = shallowRef<UpdateCheckResult>()
  const checking = ref(false)
  const dialogOpen = ref(false)
  let checkPromise: Promise<UpdateCheckResult> | undefined

  async function checkForUpdates(): Promise<UpdateCheckResult> {
    if (checkPromise) {
      return checkPromise
    }

    checking.value = true
    const request = appBridge.app.checkForUpdates()
    checkPromise = request

    try {
      const result = await request
      updateInfo.value = result
      dialogOpen.value = result.hasUpdate
      return result
    } finally {
      checking.value = false
      checkPromise = undefined
    }
  }

  return {
    updateInfo,
    checking,
    dialogOpen,
    checkForUpdates,
  }
})

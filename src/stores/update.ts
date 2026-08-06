import type { AppUpdateState, UpdateCheckResult } from '@shared/types/update'
import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'

import { appBridge } from '@/bridge/app'

export const useAppUpdateStore = defineStore('app-update', () => {
  const updateInfo = shallowRef<UpdateCheckResult>()
  const updateState = shallowRef<AppUpdateState>({
    supported: false,
    phase: 'idle',
    currentVersion: __APP_VERSION__,
  })
  const dialogOpen = ref(false)
  const checking = computed(() => updateState.value.phase === 'checking')
  let checkPromise: Promise<UpdateCheckResult> | undefined
  let stopStateSubscription: (() => void) | undefined

  async function initialize(): Promise<void> {
    if (!stopStateSubscription) {
      stopStateSubscription = appBridge.app.onUpdateStateChanged((state) => {
        updateState.value = state
      })
    }

    updateState.value = await appBridge.app.getUpdateState()
  }

  function dispose(): void {
    stopStateSubscription?.()
    stopStateSubscription = undefined
  }

  async function checkForUpdates(): Promise<UpdateCheckResult> {
    if (checkPromise) {
      return checkPromise
    }

    const request = appBridge.app.checkForUpdates()
    checkPromise = request

    try {
      const result = await request
      updateInfo.value = result
      dialogOpen.value = result.hasUpdate
      return result
    } finally {
      checkPromise = undefined
    }
  }

  async function downloadUpdate(): Promise<AppUpdateState> {
    const state = await appBridge.app.downloadUpdate()
    updateState.value = state
    return state
  }

  async function restartToInstallUpdate(): Promise<void> {
    await appBridge.app.restartToInstallUpdate()
  }

  return {
    updateInfo,
    updateState,
    checking,
    dialogOpen,
    initialize,
    dispose,
    checkForUpdates,
    downloadUpdate,
    restartToInstallUpdate,
  }
})

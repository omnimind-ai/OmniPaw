<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'

import { appBridge, type BridgeStreamEvent } from '@/bridge/app'
import { Toaster } from '@/components/ui/sonner'
import { useAppTheme } from '@/composables/useAppTheme'

useAppTheme()

const activeCatRuns = new Set<string>()
let stopCatSubscription: (() => void) | undefined

function syncCatWindow(event: BridgeStreamEvent) {
  if (!event.runId) {
    return
  }

  if (event.type === 'final') {
    activeCatRuns.delete(event.runId)
    if (activeCatRuns.size === 0) {
      void appBridge.cat.setState('completed').catch(() => {})
    }
    return
  }

  if (event.type === 'error' || event.type === 'aborted') {
    activeCatRuns.delete(event.runId)
    if (activeCatRuns.size === 0) {
      void appBridge.cat.setState('idle').catch(() => {})
    }
    return
  }

  activeCatRuns.add(event.runId)
  void appBridge.cat.setState('running').catch(() => {})
}

onMounted(() => {
  stopCatSubscription = appBridge.chat.onStreamEvent(syncCatWindow)
})

onBeforeUnmount(() => {
  stopCatSubscription?.()
})
</script>

<template>
  <RouterView />
  <Toaster
    close-button
    rich-colors
    position="top-right"
  />
</template>

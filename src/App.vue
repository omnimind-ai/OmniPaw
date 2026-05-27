<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { useRouter } from 'vue-router'

import { appBridge, type BridgeStreamEvent } from '@/bridge/app'
import { Toaster } from '@/components/ui/sonner'
import { useAppTheme } from '@/composables/useAppTheme'

useAppTheme()

const router = useRouter()
const activeCatRuns = new Set<string>()
let stopCatSubscription: (() => void) | undefined
let stopOpenChatSubscription: (() => void) | undefined

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
  stopCatSubscription = appBridge.chat.onStreamEvent?.(syncCatWindow)
  stopOpenChatSubscription = appBridge.app.onOpenChatSession?.((request) => {
    if (!request.sessionId) return
    void router.push(`/chat/${request.sessionId}`)
  })
})

onBeforeUnmount(() => {
  stopCatSubscription?.()
  stopOpenChatSubscription?.()
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

<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { appBridge, type BridgeStreamEvent } from '@/bridge/app'
import AppTopBar from '@/components/common/AppTopBar.vue'
import FirstLaunchProviderGuide from '@/components/onboarding/FirstLaunchProviderGuide.vue'
import { Toaster } from '@/components/ui/sonner'
import { useAppTheme } from '@/composables/useAppTheme'
import { useProviderStore } from '@/stores/provider'

useAppTheme()

const router = useRouter()
const route = useRoute()
const providerStore = useProviderStore()
const { enabledModelOptions } = storeToRefs(providerStore)
const activeCatRuns = new Set<string>()
let stopCatSubscription: (() => void) | undefined
let stopOpenChatSubscription: (() => void) | undefined

const showProviderGuide = computed(
  () => route.name !== 'settings' && enabledModelOptions.value.length === 0
)

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
  void providerStore.loadProviders()
  stopCatSubscription = appBridge.chat.onStreamEvent?.(syncCatWindow)
  stopOpenChatSubscription = appBridge.app.onOpenChatSession?.((request) => {
    if (!request.sessionId) return
    if (request.kind === 'vision') {
      void router.push({ path: '/vision', query: { sessionId: request.sessionId } })
      return
    }
    void router.push(`/chat/${request.sessionId}`)
  })
})

onBeforeUnmount(() => {
  stopCatSubscription?.()
  stopOpenChatSubscription?.()
})
</script>

<template>
  <div
    data-app-shell
    class="flex h-svh min-h-0 flex-col overflow-hidden bg-background text-foreground"
  >
    <AppTopBar />
    <div class="min-h-0 flex-1 overflow-hidden">
      <FirstLaunchProviderGuide v-if="showProviderGuide" />
      <RouterView v-else />
    </div>
    <Toaster
      close-button
      rich-colors
      position="top-right"
    />
  </div>
</template>

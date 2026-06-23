<script setup lang="ts">
import type { CatTaskState } from '@shared/types/cat'
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { appBridge, type BridgeStreamEvent } from '@/bridge/app'
import AppTopBar from '@/components/common/AppTopBar.vue'
import FirstLaunchProviderGuide from '@/components/onboarding/FirstLaunchProviderGuide.vue'
import { Toaster } from '@/components/ui/sonner'
import { useAppLanguage } from '@/composables/useAppLanguage'
import { useAppTheme } from '@/composables/useAppTheme'
import { useProviderStore } from '@/stores/provider'
import { useSettingsStore } from '@/stores/settings'

useAppLanguage()
useAppTheme()

const router = useRouter()
const route = useRoute()
const providerStore = useProviderStore()
const settingsStore = useSettingsStore()
const { config: settingsConfig } = storeToRefs(settingsStore)
const startupLoaded = ref(false)
const activeCatRuns = new Set<string>()
let lastCatTaskState: CatTaskState | null = null
let stopCatSubscription: (() => void) | undefined
let stopOpenChatSubscription: (() => void) | undefined

const showProviderGuide = computed(
  () =>
    startupLoaded.value &&
    route.name !== 'settings' &&
    settingsConfig.value?.app.initialized === false
)
const showStartupPlaceholder = computed(() => !startupLoaded.value && route.name !== 'settings')

function setCatTaskState(state: CatTaskState) {
  if (state === lastCatTaskState) {
    return
  }

  lastCatTaskState = state
  void appBridge.cat.setState(state).catch(() => {
    lastCatTaskState = null
  })
}

function syncCatWindow(event: BridgeStreamEvent) {
  if (!event.runId) {
    return
  }

  if (event.type === 'final') {
    activeCatRuns.delete(event.runId)
    if (activeCatRuns.size === 0) {
      setCatTaskState('completed')
    }
    return
  }

  if (event.type === 'error' || event.type === 'aborted') {
    activeCatRuns.delete(event.runId)
    if (activeCatRuns.size === 0) {
      setCatTaskState('idle')
    }
    return
  }

  activeCatRuns.add(event.runId)
  setCatTaskState('running')
}

async function initializeStartupState() {
  await Promise.allSettled([settingsStore.load(), providerStore.loadProviders()])
  startupLoaded.value = true
}

onMounted(() => {
  void initializeStartupState()
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
      <div
        v-if="showStartupPlaceholder"
        class="h-full bg-background"
      />
      <FirstLaunchProviderGuide v-else-if="showProviderGuide" />
      <RouterView v-else />
    </div>
    <Toaster
      close-button
      rich-colors
      position="top-right"
    />
  </div>
</template>

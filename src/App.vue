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
const appBackground = computed(() => settingsConfig.value?.app.background)
const hasCustomBackground = computed(() =>
  Boolean(appBackground.value?.enabled && appBackground.value.image?.url)
)
const appShellStyle = computed<Record<string, string>>(() => {
  if (!hasCustomBackground.value) {
    return {}
  }

  const surfaceOpacity = clampOpacity(appBackground.value?.surfaceOpacity ?? 0.68)
  return {
    '--app-glass-card-strength': toPercent(surfaceOpacity),
    '--app-glass-field-hover-strength': toPercent(surfaceOpacity * 0.5),
    '--app-glass-sidebar-strength': toPercent(surfaceOpacity * 0.91),
    '--app-glass-sidebar-accent-strength': toPercent(surfaceOpacity * 0.79),
    '--app-glass-border-strength': toPercent(surfaceOpacity * 1.06),
  }
})
const appBackgroundImageStyle = computed(() => {
  const image = appBackground.value?.image
  if (!hasCustomBackground.value || !image) {
    return {}
  }

  return {
    backgroundImage: `url("${image.url}")`,
    opacity: String(appBackground.value?.opacity ?? 0.35),
  }
})

function clampOpacity(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function toPercent(value: number): string {
  return `${Math.round(clampOpacity(value) * 100)}%`
}

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
    :data-custom-background="hasCustomBackground ? 'true' : undefined"
    :style="appShellStyle"
    class="relative isolate flex h-svh min-h-0 flex-col overflow-hidden bg-background text-foreground"
  >
    <div
      v-if="hasCustomBackground"
      class="pointer-events-none absolute inset-0 z-0 bg-cover bg-center bg-no-repeat"
      :style="appBackgroundImageStyle"
      aria-hidden="true"
    />
    <AppTopBar />
    <div class="relative z-10 min-h-0 flex-1 overflow-hidden">
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

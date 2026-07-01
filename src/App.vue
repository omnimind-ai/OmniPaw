<script setup lang="ts">
import type { CatTaskState } from '@shared/types/cat'
import { useMediaQuery } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { appBridge, type BridgeStreamEvent } from '@/bridge/app'
import ChatSidebar from '@/components/chat/ChatSidebar.vue'
import { chatWorkspaceContextKey } from '@/components/chat/chat-workspace-context'
import AppTopBar from '@/components/common/AppTopBar.vue'
import FirstLaunchProviderGuide from '@/components/onboarding/FirstLaunchProviderGuide.vue'
import SettingsSidebar, { type SettingsTab } from '@/components/settings/common/SettingsSidebar.vue'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Toaster } from '@/components/ui/sonner'
import { useChatWorkspaceController } from '@/composables/chat/useChatWorkspaceController'
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
const chatWorkspace = useChatWorkspaceController()
const {
  workspaceContext: chatWorkspaceContext,
  sessions: chatSessions,
  currSessionId: chatCurrSessionId,
  sessionMode: chatSessionMode,
  sessionKindFilter: chatSessionKindFilter,
  creatingSession: chatCreatingSession,
  runningSessionIds: chatRunningSessionIds,
  sidebarOpen: chatSidebarOpen,
  setSidebarOpen: setChatSidebarOpen,
  handleNewChat,
  handleSelectSession,
  handleSessionModeChange,
  handleSessionKindFilterChange,
  openSettings,
  toggleCatVisibility,
  handleRenameSession,
  handleDeleteSession,
} = chatWorkspace
const isMobile = useMediaQuery('(max-width: 768px)')
const settingsSidebarOpen = ref(true)
const startupLoaded = ref(false)
const forceShowProviderGuide = ref(false)
const activeCatRuns = new Set<string>()
let lastCatTaskState: CatTaskState | null = null
let stopCatSubscription: (() => void) | undefined
let stopOpenChatSubscription: (() => void) | undefined

provide(chatWorkspaceContextKey, chatWorkspaceContext)

const showProviderGuide = computed(
  () =>
    startupLoaded.value &&
    (forceShowProviderGuide.value ||
      (route.name !== 'settings' && settingsConfig.value?.app.initialized === false))
)
const showStartupPlaceholder = computed(
  () => !startupLoaded.value && (forceShowProviderGuide.value || route.name !== 'settings')
)
const isSettingsRoute = computed(() => route.name === 'settings')
const isChatShellRoute = computed(
  () => route.name === 'home' || route.name === 'tavern' || route.name === 'chat'
)
const usesAppSidebar = computed(
  () =>
    !showStartupPlaceholder.value &&
    !showProviderGuide.value &&
    (isChatShellRoute.value || isSettingsRoute.value)
)
const activeSidebarOpen = computed(() =>
  isSettingsRoute.value ? settingsSidebarOpen.value : chatSidebarOpen.value
)
const activeSettingsTab = computed<SettingsTab>(
  () => normalizeSettingsTab(route.query.tab) ?? 'general'
)
const appBackground = computed(() => settingsConfig.value?.app.background)
const hasCustomBackground = computed(() =>
  Boolean(appBackground.value?.enabled && appBackground.value.image?.url)
)
const appBackgroundStyle = computed<Record<string, string>>(() => {
  const image = appBackground.value?.image
  if (!hasCustomBackground.value || !image) {
    return {}
  }

  const blur = clampNumber(appBackground.value?.blur ?? 0, 0, 32)
  return {
    backgroundImage: `url("${image.url}")`,
    opacity: String(appBackground.value?.opacity ?? 0.35),
    filter: blur > 0 ? `blur(${blur}px)` : 'none',
    inset: blur > 0 ? `-${Math.ceil(blur * 2)}px` : '0',
  }
})

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min
  }
  return Math.min(max, Math.max(min, value))
}

function handleSidebarOpenUpdate(open: boolean) {
  if (isSettingsRoute.value) {
    settingsSidebarOpen.value = isMobile.value ? open : true
    return
  }
  setChatSidebarOpen(open)
}

function selectSettingsTab(tab: SettingsTab) {
  void router.replace({ name: 'settings', query: { ...route.query, tab } })
}

function backToChat() {
  void router.push('/')
}

function normalizeSettingsTab(value: unknown): SettingsTab | undefined {
  const tab = Array.isArray(value) ? value[0] : value
  if (typeof tab !== 'string') return undefined
  if (
    tab === 'providers' ||
    tab === 'defaults' ||
    tab === 'general' ||
    tab === 'shortcuts' ||
    tab === 'agent' ||
    tab === 'catAppearance' ||
    tab === 'display' ||
    tab === 'data' ||
    tab === 'tools' ||
    tab === 'memory' ||
    tab === 'tavern' ||
    tab === 'skills' ||
    tab === 'personas' ||
    tab === 'schedule' ||
    tab === 'observation' ||
    tab === 'about'
  ) {
    return tab
  }
  return undefined
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

const debugApi = {
  showFirstLaunchGuide() {
    forceShowProviderGuide.value = true
  },
  hideFirstLaunchGuide() {
    forceShowProviderGuide.value = false
  },
  isFirstLaunchGuideForced() {
    return forceShowProviderGuide.value
  },
}

function installDebugApi(): (() => void) | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }

  const previousDebugApi = window.omniPawDebug
  window.omniPawDebug = {
    ...previousDebugApi,
    ...debugApi,
  }

  return () => {
    if (window.omniPawDebug?.showFirstLaunchGuide !== debugApi.showFirstLaunchGuide) {
      return
    }
    if (previousDebugApi) {
      window.omniPawDebug = previousDebugApi
    } else {
      delete window.omniPawDebug
    }
  }
}

async function initializeStartupState() {
  await Promise.allSettled([settingsStore.load(), providerStore.loadProviders()])
  startupLoaded.value = true
}

const uninstallDebugApi = installDebugApi()

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

watch(
  isMobile,
  (mobile) => {
    if (!mobile) {
      settingsSidebarOpen.value = true
    }
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  uninstallDebugApi?.()
  stopCatSubscription?.()
  stopOpenChatSubscription?.()
})
</script>

<template>
  <div
    data-app-shell
    :data-custom-background="hasCustomBackground ? 'true' : undefined"
    class="relative isolate flex h-svh min-h-0 flex-col overflow-hidden bg-background text-foreground"
  >
    <div
      v-if="hasCustomBackground"
      class="pointer-events-none absolute z-0 bg-cover bg-center bg-no-repeat"
      :style="appBackgroundStyle"
      aria-hidden="true"
    />
    <AppTopBar />
    <div class="relative z-10 min-h-0 flex-1 overflow-hidden">
      <div
        v-if="showStartupPlaceholder"
        class="h-full bg-background"
      />
      <FirstLaunchProviderGuide
        v-else-if="showProviderGuide"
        @completed="forceShowProviderGuide = false"
      />
      <SidebarProvider
        v-else-if="usesAppSidebar"
        :open="activeSidebarOpen"
        class="h-full min-h-0 w-full"
        @update:open="handleSidebarOpenUpdate"
      >
        <ChatSidebar
          v-if="isChatShellRoute"
          :sessions="chatSessions"
          :active-session-id="chatCurrSessionId"
          :session-mode="chatSessionMode"
          :session-kind-filter="chatSessionKindFilter"
          :creating="chatCreatingSession"
          :running-session-ids="chatRunningSessionIds"
          @new-chat="handleNewChat"
          @select-session="handleSelectSession"
          @update-session-mode="handleSessionModeChange"
          @update-session-kind-filter="handleSessionKindFilterChange"
          @open-settings="openSettings"
          @toggle-cat="toggleCatVisibility"
          @rename-session="handleRenameSession"
          @delete-session="handleDeleteSession"
        />
        <SettingsSidebar
          v-else
          :active-tab="activeSettingsTab"
          @select="selectSettingsTab"
          @back="backToChat"
        />

        <SidebarInset class="h-full overflow-hidden">
          <RouterView />
        </SidebarInset>
      </SidebarProvider>
      <RouterView v-else />
    </div>
    <Toaster
      close-button
      rich-colors
      position="top-right"
    />
  </div>
</template>

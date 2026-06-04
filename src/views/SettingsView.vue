<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import DefaultModelSettingsForm from '@/components/settings/DefaultModelSettingsForm.vue'
import GeneralSettingsForm from '@/components/settings/GeneralSettingsForm.vue'
import LocalAgentSettingsForm from '@/components/settings/LocalAgentSettingsForm.vue'
import McpServerSettingsForm from '@/components/settings/McpServerSettingsForm.vue'
import ObservationSettingsForm from '@/components/settings/ObservationSettingsForm.vue'
import PersonaSettingsForm from '@/components/settings/PersonaSettingsForm.vue'
import ProviderSettingsForm from '@/components/settings/ProviderSettingsForm.vue'
import ScheduledTaskSettingsForm from '@/components/settings/ScheduledTaskSettingsForm.vue'
import SettingsSidebar, { type SettingsTab } from '@/components/settings/SettingsSidebar.vue'
import SkillSettingsForm from '@/components/settings/SkillSettingsForm.vue'
import TavernSettingsForm from '@/components/settings/TavernSettingsForm.vue'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { Skeleton } from '@/components/ui/skeleton'
import { useDelayedFlag } from '@/composables/useDelayedFlag'
import { useProviderStore } from '@/stores/provider'
import { useSettingsStore } from '@/stores/settings'
import { errorToText, useToast } from '@/utils/toast'

const router = useRouter()
const route = useRoute()
const settingsStore = useSettingsStore()
const providerStore = useProviderStore()
const toast = useToast()

const { draft, config, status, loading, saving, error, persistenceAvailable } =
  storeToRefs(settingsStore)

const activeTab = ref<SettingsTab>(normalizeSettingsTab(route.query.tab) ?? 'general')
const isMobile = useMediaQuery('(max-width: 768px)')
const sidebarOpen = ref(true)
let autosaveTimer: ReturnType<typeof window.setTimeout> | undefined
let autosavePromise: Promise<void> | undefined
let saveQueued = false

const hasChanges = computed(() => JSON.stringify(draft.value) !== JSON.stringify(config.value))
const showInitialSkeleton = useDelayedFlag(() => loading.value && !draft.value)
const fullHeightPanelTabs = new Set<SettingsTab>(['personas', 'skills', 'tools'])
const isFullHeightPanelTab = computed(() => fullHeightPanelTabs.has(activeTab.value))
const contentClass = computed(() => {
  if (activeTab.value === 'providers' || activeTab.value === 'tavern') {
    return 'mx-auto flex min-h-full w-full max-w-none flex-1 flex-col gap-4 px-4 pb-6 pt-14 md:px-6 md:py-6'
  }
  if (isFullHeightPanelTab.value) {
    return 'mx-auto flex h-full min-h-0 w-full max-w-6xl flex-1 flex-col overflow-hidden px-4 pb-6 pt-14 md:px-6 md:py-6'
  }
  return 'mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pb-6 pt-14 md:px-6 md:py-6'
})

onMounted(async () => {
  const results = await Promise.allSettled([settingsStore.load(), providerStore.loadProviders()])
  results.forEach((result, index) => {
    if (result.status === 'rejected' && index === 1) {
      toast.error(result.reason, { description: '设置加载失败' })
    }
  })
})

watch(error, (value) => {
  if (value) {
    toast.error(errorToText(value, '设置操作失败。'))
  }
})

onBeforeUnmount(() => {
  void flushAutosave()
  settingsStore.stopSettingsSubscription()
})

function selectTab(tab: SettingsTab) {
  activeTab.value = tab
  void router.replace({ name: 'settings', query: { ...route.query, tab } })
}

function handleSidebarOpenUpdate(open: boolean) {
  sidebarOpen.value = isMobile.value ? open : true
}

async function backToChat() {
  await flushAutosave()
  await router.push('/')
}

watch(
  () => route.query.tab,
  (tab) => {
    const normalized = normalizeSettingsTab(tab)
    if (normalized && normalized !== activeTab.value) {
      activeTab.value = normalized
    }
  }
)

watch(
  () => draft.value,
  () => {
    if (
      loading.value ||
      !draft.value ||
      !config.value ||
      !hasChanges.value ||
      !persistenceAvailable.value
    ) {
      return
    }

    scheduleAutosave()
  },
  { deep: true }
)

watch(
  isMobile,
  (mobile) => {
    if (!mobile) {
      sidebarOpen.value = true
    }
  },
  { immediate: true }
)

function scheduleAutosave() {
  clearAutosaveTimer()

  autosaveTimer = window.setTimeout(() => {
    autosaveTimer = undefined
    autosavePromise = autosave().finally(() => {
      autosavePromise = undefined
    })
  }, 300)
}

function clearAutosaveTimer() {
  if (!autosaveTimer) return
  window.clearTimeout(autosaveTimer)
  autosaveTimer = undefined
}

async function flushAutosave() {
  clearAutosaveTimer()

  if (autosavePromise) {
    await autosavePromise
    clearAutosaveTimer()
  }

  if (!draft.value || !config.value || !hasChanges.value || !persistenceAvailable.value) {
    return
  }

  autosavePromise = autosave().finally(() => {
    autosavePromise = undefined
  })
  await autosavePromise
}

async function autosave() {
  if (!draft.value || !config.value || !hasChanges.value || !persistenceAvailable.value) {
    return
  }

  if (saving.value) {
    saveQueued = true
    return
  }

  saveQueued = false
  try {
    await settingsStore.save()
  } catch (err) {
    toast.error(err, { description: '设置保存失败' })
    return
  } finally {
    if (saveQueued || hasChanges.value) {
      scheduleAutosave()
    }
  }
}

function normalizeSettingsTab(value: unknown): SettingsTab | undefined {
  const tab = Array.isArray(value) ? value[0] : value
  if (typeof tab !== 'string') return undefined
  if (
    tab === 'providers' ||
    tab === 'defaults' ||
    tab === 'general' ||
    tab === 'agent' ||
    tab === 'display' ||
    tab === 'data' ||
    tab === 'tools' ||
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
</script>

<template>
  <SidebarProvider
    :open="sidebarOpen"
    @update:open="handleSidebarOpenUpdate"
  >
    <SettingsSidebar
      :active-tab="activeTab"
      @select="selectTab"
      @back="backToChat"
    />

    <SidebarInset class="h-svh overflow-hidden">
      <main class="flex h-full min-h-0 flex-1 flex-col bg-muted/40">
        <SidebarTrigger class="fixed left-3 top-3 md:hidden" />
        <div
          v-if="isFullHeightPanelTab"
          :class="contentClass"
        >
          <div
            v-if="loading && !draft"
            class="flex flex-col gap-4"
          >
            <template v-if="showInitialSkeleton">
              <Skeleton class="h-32 w-full" />
              <Skeleton class="h-48 w-full" />
              <Skeleton class="h-24 w-full" />
            </template>
          </div>

          <div
            v-else-if="!draft"
            class="rounded-lg border bg-card px-4 py-6 text-sm text-muted-foreground"
          >
            设置尚未加载。
          </div>

          <PersonaSettingsForm
            v-else-if="activeTab === 'personas'"
            class="h-full min-h-0 flex-1"
          />

          <SkillSettingsForm
            v-else-if="activeTab === 'skills'"
            class="h-full min-h-0 flex-1"
          />

          <McpServerSettingsForm
            v-else-if="activeTab === 'tools'"
            class="h-full min-h-0 flex-1"
          />
        </div>

        <ScrollArea
          v-else
          class="min-h-0 flex-1"
        >
          <div :class="contentClass">
            <div
              v-if="loading && !draft"
              class="flex flex-col gap-4"
            >
              <template v-if="showInitialSkeleton">
                <Skeleton class="h-32 w-full" />
                <Skeleton class="h-48 w-full" />
                <Skeleton class="h-24 w-full" />
              </template>
            </div>

            <div
              v-else-if="!draft"
              class="rounded-lg border bg-card px-4 py-6 text-sm text-muted-foreground"
            >
              设置尚未加载。
            </div>

            <template v-else>
              <ProviderSettingsForm v-if="activeTab === 'providers'" />

              <DefaultModelSettingsForm
                v-else-if="activeTab === 'defaults'"
                :draft="draft"
              />

              <GeneralSettingsForm
                v-else-if="activeTab === 'general'"
                :draft="draft"
              />

              <div
                v-else-if="activeTab === 'agent'"
                class="flex flex-col gap-4"
              >
                <LocalAgentSettingsForm :draft="draft" />
              </div>

              <TavernSettingsForm v-else-if="activeTab === 'tavern'" />

              <ObservationSettingsForm
                v-else-if="activeTab === 'observation'"
                :draft="draft"
              />

              <ScheduledTaskSettingsForm
                v-else-if="activeTab === 'schedule'"
                :draft="draft"
              />
            </template>
          </div>
        </ScrollArea>
      </main>
    </SidebarInset>
  </SidebarProvider>
</template>

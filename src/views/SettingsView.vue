<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import DefaultModelSettingsForm from '@/components/settings/DefaultModelSettingsForm.vue'
import GeneralSettingsForm from '@/components/settings/GeneralSettingsForm.vue'
import McpServerSettingsForm from '@/components/settings/McpServerSettingsForm.vue'
import ProviderSettingsForm from '@/components/settings/ProviderSettingsForm.vue'
import SettingsSection from '@/components/settings/SettingsSection.vue'
import SettingsSidebar, { type SettingsTab } from '@/components/settings/SettingsSidebar.vue'
import SkillSettingsForm from '@/components/settings/SkillSettingsForm.vue'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { useProviderStore } from '@/stores/provider'
import { useSettingsStore } from '@/stores/settings'
import { errorToText, useToast } from '@/utils/toast'

const router = useRouter()
const settingsStore = useSettingsStore()
const providerStore = useProviderStore()
const toast = useToast()

const {
  draft,
  config,
  status,
  loading,
  saving,
  error,
  persistenceAvailable,
} = storeToRefs(settingsStore)
const { modelOptions } = storeToRefs(providerStore)

const activeTab = ref<SettingsTab>('general')
const isMobile = useMediaQuery('(max-width: 768px)')
const sidebarOpen = ref(true)
let autosaveTimer: ReturnType<typeof window.setTimeout> | undefined
let autosavePromise: Promise<void> | undefined
let saveQueued = false

const hasChanges = computed(() => JSON.stringify(draft.value) !== JSON.stringify(config.value))
const contentClass = computed(() =>
  activeTab.value === 'providers'
    ? 'mx-auto flex min-h-full w-full max-w-none flex-1 flex-col gap-4 px-4 pb-6 pt-14 md:px-6 md:py-6'
    : 'mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pb-6 pt-14 md:px-6 md:py-6',
)

onMounted(async () => {
  const results = await Promise.allSettled([
    settingsStore.load(),
    providerStore.loadProviders(),
  ])
  results.forEach((result, index) => {
    if (result.status === 'rejected' && index === 1) {
      toast.error(result.reason, { description: '设置加载失败' })
    }
  })
})

watch(
  error,
  (value) => {
    if (value) {
      toast.error(errorToText(value, '设置操作失败。'))
    }
  },
)

onBeforeUnmount(() => {
  void flushAutosave()
  settingsStore.stopSettingsSubscription()
})

function selectTab(tab: SettingsTab) {
  activeTab.value = tab
}

function handleSidebarOpenUpdate(open: boolean) {
  sidebarOpen.value = isMobile.value ? open : true
}

async function backToChat() {
  await flushAutosave()
  await router.push('/')
}

function setScheduledTasksEnabled(value: boolean) {
  if (!draft.value) return
  draft.value.scheduledTasks.enabled = value
}

watch(
  () => draft.value,
  () => {
    if (loading.value || !draft.value || !config.value || !hasChanges.value || !persistenceAvailable.value) {
      return
    }

    scheduleAutosave()
  },
  { deep: true },
)

watch(
  isMobile,
  (mobile) => {
    if (!mobile) {
      sidebarOpen.value = true
    }
  },
  { immediate: true },
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
    await providerStore.loadProviders()
  } catch (err) {
    toast.error(err, { description: '设置保存失败' })
    return
  } finally {
    if (saveQueued || hasChanges.value) {
      scheduleAutosave()
    }
  }
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
      <main class="flex min-h-0 flex-1 flex-col bg-muted/40">
        <SidebarTrigger class="fixed left-3 top-3 md:hidden" />
        <ScrollArea class="min-h-0 flex-1">
          <div :class="contentClass">
            <div
              v-if="loading && !draft"
              class="flex flex-col gap-4"
            >
              <Skeleton class="h-32 w-full" />
              <Skeleton class="h-48 w-full" />
              <Skeleton class="h-24 w-full" />
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
                :model-options="modelOptions"
              />

              <GeneralSettingsForm
                v-else-if="activeTab === 'general'"
                :draft="draft"
              />

              <McpServerSettingsForm v-else-if="activeTab === 'tools'" />

              <SkillSettingsForm v-else-if="activeTab === 'skills'" />

              <SettingsSection
                v-else-if="activeTab === 'schedule'"
                title="计划任务"
                description="当前接入全局启用开关，任务编辑后续扩展。"
              >
                <FieldGroup class="gap-0">
                  <Field
                    orientation="responsive"
                    class="border-b px-4 py-3"
                  >
                    <FieldContent>
                      <FieldLabel for="scheduled-enabled">启用计划任务</FieldLabel>
                      <FieldDescription>控制本地计划任务模块是否运行。</FieldDescription>
                    </FieldContent>
                    <Switch
                      id="scheduled-enabled"
                      :model-value="draft.scheduledTasks.enabled"
                      aria-label="启用计划任务"
                      @update:model-value="setScheduledTasksEnabled($event)"
                    />
                  </Field>
                  <Field class="px-4 py-3">
                    <FieldLabel>任务数量</FieldLabel>
                    <FieldDescription>{{ draft.scheduledTasks.tasks.length }} 个任务。</FieldDescription>
                  </Field>
                </FieldGroup>
              </SettingsSection>
            </template>
          </div>
        </ScrollArea>
      </main>
    </SidebarInset>
  </SidebarProvider>
</template>

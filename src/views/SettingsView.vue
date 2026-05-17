<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import DefaultModelSettingsForm from '@/components/settings/DefaultModelSettingsForm.vue'
import GeneralSettingsForm from '@/components/settings/GeneralSettingsForm.vue'
import ProviderSettingsForm from '@/components/settings/ProviderSettingsForm.vue'
import SettingsSection from '@/components/settings/SettingsSection.vue'
import SettingsSidebar, { type SettingsTab } from '@/components/settings/SettingsSidebar.vue'
import { Badge } from '@/components/ui/badge'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { useProviderStore } from '@/stores/provider'
import { useSettingsStore } from '@/stores/settings'

const router = useRouter()
const settingsStore = useSettingsStore()
const providerStore = useProviderStore()

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
const errorMessage = computed(() => {
  if (!error.value) return ''
  if (error.value instanceof Error) return error.value.message
  if (typeof error.value === 'string') return error.value
  if (typeof error.value === 'object' && error.value && 'message' in error.value) {
    return String((error.value as { message?: unknown }).message)
  }
  return '设置操作失败。'
})

onMounted(async () => {
  await Promise.allSettled([
    settingsStore.load(),
    providerStore.loadProviders(),
  ])
})

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
  await router.push('/chat')
}

function setScheduledTasksEnabled(value: boolean) {
  if (!draft.value) return
  draft.value.scheduledTasks.enabled = value
}

function setToolValue(name: string, value: boolean) {
  if (!draft.value) return
  draft.value.tools.enabledByName = {
    ...draft.value.tools.enabledByName,
    [name]: value,
  }
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
  } catch {
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
              <div
                v-if="errorMessage"
                class="rounded-lg border bg-card px-3 py-2 text-sm text-muted-foreground"
              >
                {{ errorMessage }}
              </div>

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

              <SettingsSection
                v-else-if="activeTab === 'tools'"
                title="工具设置"
                description="管理工具启用状态。"
              >
                <FieldGroup class="gap-0">
                  <Field
                    v-if="!Object.keys(draft.tools.enabledByName).length"
                    class="px-4 py-4"
                  >
                    <FieldLabel>暂无工具覆盖项</FieldLabel>
                    <FieldDescription>工具列表接入后会在这里展示每个工具的开关。</FieldDescription>
                  </Field>

                  <Field
                    v-for="(enabled, name) in draft.tools.enabledByName"
                    :key="name"
                    orientation="responsive"
                    class="border-b px-4 py-3 last:border-b-0"
                  >
                    <FieldContent>
                      <FieldLabel :for="`tool-${name}`">{{ name }}</FieldLabel>
                      <FieldDescription>本地配置覆盖。</FieldDescription>
                    </FieldContent>
                    <Switch
                      :id="`tool-${name}`"
                      :model-value="enabled"
                      :aria-label="`启用 ${name}`"
                      @update:model-value="setToolValue(String(name), $event)"
                    />
                  </Field>
                </FieldGroup>
              </SettingsSection>

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

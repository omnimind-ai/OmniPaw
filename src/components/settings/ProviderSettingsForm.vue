<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import type { BridgeProviderPreset } from '@/bridge/app'
import ProviderAdvancedTab from '@/components/settings/provider-settings/ProviderAdvancedTab.vue'
import ProviderBasicTab from '@/components/settings/provider-settings/ProviderBasicTab.vue'
import ProviderDeleteModal from '@/components/settings/provider-settings/ProviderDeleteModal.vue'
import ProviderModelsTab from '@/components/settings/provider-settings/ProviderModelsTab.vue'
import ProviderSelectorSidebar from '@/components/settings/provider-settings/ProviderSelectorSidebar.vue'
import type {
  ProviderDraftTab,
  ProviderSidebarItem,
} from '@/components/settings/provider-settings/types'
import SettingsSection from '@/components/settings/SettingsSection.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useProviderAutosave } from '@/composables/useProviderAutosave'
import { useProviderDraft } from '@/composables/useProviderDraft'
import { useProviderStore } from '@/stores/provider'
import { useToast } from '@/utils/toast'

const providerStore = useProviderStore()
const toast = useToast()
const { rawProviders, loading, saving, providerPresets, presetsLoading, persistenceAvailable } =
  storeToRefs(providerStore)

const activeProviderId = ref('')
const originalProviderId = ref('')
const providerTab = ref<ProviderDraftTab>('basic')
const providerSearchQuery = ref('')
const deleteDialogOpen = ref(false)
const deleteProviderTarget = ref<ProviderSidebarItem | undefined>()
const refreshingModels = ref(false)
let suppressDraftReload = false

const {
  providerDraft,
  credentialMode,
  credentialValue,
  loadingDraft,
  addModel,
  buildSaveRequest,
  ensureDefaultModelId,
  loadProviderDraft: loadProviderDraftState,
  removeModel,
  replaceModels,
  setOptionalNumber,
  startNewProviderDraft,
  startProviderDraftFromPreset,
  updateModelInput,
  updateProviderType,
} = useProviderDraft({ rawProviders, originalProviderId })

const currentProvider = computed(() =>
  rawProviders.value.find((provider) => provider.id === originalProviderId.value)
)
const isExistingProvider = computed(() => Boolean(currentProvider.value))
const hasDraft = computed(() => Boolean(activeProviderId.value && !isExistingProvider.value))
const canAutosave = computed(() => Boolean(isExistingProvider.value && persistenceAvailable.value))
const canRefreshModels = computed(() =>
  Boolean(
    persistenceAvailable.value &&
      (providerDraft.value.capabilities.listModels ||
        providerDraft.value.api === 'openai-chat-completions' ||
        providerDraft.value.type === 'openai-compatible')
  )
)
const enabledModels = computed(() =>
  providerDraft.value.models.filter((model) => model.enabled !== false)
)
const providerList = computed(() => rawProviders.value)
const providerSidebarList = computed<ProviderSidebarItem[]>(() => {
  const query = providerSearchQuery.value.trim().toLowerCase()
  const providers = providerList.value.filter((provider) => {
    if (!query) return true
    return [provider.name, provider.id, provider.baseUrl, provider.type].some((value) =>
      String(value || '')
        .toLowerCase()
        .includes(query)
    )
  })

  if (hasDraft.value) {
    const draft = providerDraft.value
    const matchesDraft =
      !query ||
      [draft.name, draft.id, draft.baseUrl, draft.type].some((value) =>
        String(value || '')
          .toLowerCase()
          .includes(query)
      )

    if (matchesDraft) {
      return [
        {
          id: draft.id,
          name: draft.name,
          baseUrl: draft.baseUrl,
          type: draft.type,
          enabled: draft.enabled,
          unsaved: true,
        },
        ...providers,
      ]
    }
  }

  return providers
})

const autosave = useProviderAutosave({
  canAutosave,
  loadingDraft,
  saving,
  save: handleSaveProvider,
})

watch(
  rawProviders,
  (providers) => {
    if (!providers.length) {
      if (!hasDraft.value) {
        activeProviderId.value = ''
        originalProviderId.value = ''
      }
      return
    }

    const activeStillExists = providers.some((provider) => provider.id === activeProviderId.value)
    if (!activeProviderId.value) {
      void selectProvider(providers[0].id)
      return
    }

    if (activeStillExists && isExistingProvider.value && !suppressDraftReload) {
      loadProviderDraft(activeProviderId.value)
    }
  },
  { immediate: true }
)

watch(
  () => providerDraft.value.models.map((model) => model.id),
  () => {
    ensureDefaultModelId()
  }
)

watch(
  providerDraft,
  () => {
    autosave.queueAutosave()
  },
  { deep: true }
)

watch([credentialMode, credentialValue], () => {
  if (credentialMode.value === 'none' || !credentialValue.value.trim()) return
  autosave.queueAutosave()
})

onMounted(async () => {
  if (!rawProviders.value.length) {
    await providerStore.loadProviders()
  }
  await providerStore.loadProviderPresets()
})

async function selectProvider(providerId: string) {
  if (providerId === activeProviderId.value) return
  const saved = await autosave.flushAutosave()
  if (!saved) return

  activeProviderId.value = providerId
  loadProviderDraft(providerId)
}

async function selectProviderSidebarItem(provider: ProviderSidebarItem) {
  if (provider.unsaved) return
  await selectProvider(provider.id)
}

function createNewProviderDraft() {
  const draft = startNewProviderDraft()
  activeProviderId.value = draft.id
  originalProviderId.value = ''
  providerTab.value = 'basic'
  clearMessages()
}

function createProviderFromPreset(preset: BridgeProviderPreset) {
  clearMessages()
  void startProviderFromPreset(preset)
}

async function startProviderFromPreset(preset: BridgeProviderPreset) {
  const savedCurrent = await autosave.flushAutosave()
  if (!savedCurrent) return

  const draft = startProviderDraftFromPreset(preset)
  activeProviderId.value = draft.id
  originalProviderId.value = ''
  providerTab.value = 'basic'
  clearMessages()
}

function loadProviderDraft(providerId: string) {
  const provider = rawProviders.value.find((item) => item.id === providerId)
  if (!provider) return

  loadProviderDraftState(provider)
  providerTab.value = 'basic'
  clearMessages()
}

async function handleSaveProvider(options: { silent?: boolean } = {}): Promise<boolean> {
  autosave.clearAutosaveTimer()
  if (!options.silent) {
    clearMessages()
  }

  const result = buildSaveRequest()
  if (!result.ok) {
    if (!options.silent) toast.error(result.message)
    return false
  }

  try {
    suppressDraftReload = Boolean(options.silent)
    const saved = await providerStore.saveProvider(result.request)
    if (saved?.id) {
      activeProviderId.value = saved.id
      originalProviderId.value = saved.id
      if (!options.silent) {
        loadProviderDraft(saved.id)
      }
    }
    if (!options.silent) {
      toast.success('Provider 已保存。')
    }
    return true
  } catch (error) {
    toast.error(
      error,
      options.silent
        ? { id: 'provider-autosave-error', description: 'Provider 自动保存失败' }
        : undefined
    )
    return false
  } finally {
    suppressDraftReload = false
    autosave.handleSaveSettled()
  }
}

async function handleDeleteProvider() {
  const target = deleteProviderTarget.value
  if (!target || target.unsaved || !persistenceAvailable.value) return

  clearMessages()
  if (target.id !== originalProviderId.value) {
    const savedCurrent = await autosave.flushAutosave()
    if (!savedCurrent) return
  } else {
    autosave.clearAutosaveTimer()
  }

  try {
    const result = await providerStore.deleteProvider({ providerId: target.id })
    deleteDialogOpen.value = false
    deleteProviderTarget.value = undefined

    const nextProviderId = result?.nextProviderId || result?.nextSelection?.providerId
    if (nextProviderId) {
      await selectProvider(nextProviderId)
    } else {
      activeProviderId.value = ''
      originalProviderId.value = ''
    }
    toast.success('Provider 已删除。')
  } catch (error) {
    toast.error(error)
  }
}

function requestDeleteProvider(provider: ProviderSidebarItem) {
  if (provider.unsaved || saving.value || !persistenceAvailable.value) return
  deleteProviderTarget.value = provider
  deleteDialogOpen.value = true
}

async function refreshProviderModels() {
  if (refreshingModels.value || !canRefreshModels.value) return

  clearMessages()
  refreshingModels.value = true
  const wasExistingProvider = isExistingProvider.value

  try {
    const saved = await handleSaveProvider({ silent: true })
    if (!saved) return

    const models = await providerStore.refreshModels(originalProviderId.value)
    replaceModels(models)
    toast.success(wasExistingProvider ? '模型列表已更新。' : 'Provider 已保存，模型列表已更新。')
  } catch (error) {
    toast.error(error)
  } finally {
    refreshingModels.value = false
    loadingDraft.value = false
  }
}

function clearMessages() {}
</script>

<template>
  <div class="flex min-h-0 w-full flex-1 flex-col gap-4 lg:flex-row">
    <ProviderSelectorSidebar
      v-model:search-query="providerSearchQuery"
      :active-provider-id="activeProviderId"
      :loading="loading"
      :persistence-available="persistenceAvailable"
      :saving="saving"
      :presets-loading="presetsLoading"
      :provider-presets="providerPresets"
      :provider-sidebar-list="providerSidebarList"
      @create-from-preset="createProviderFromPreset"
      @delete-provider="requestDeleteProvider"
      @select-provider="selectProviderSidebarItem"
    />

    <SettingsSection
      title="模型服务"
      class="min-w-0 flex-1 self-stretch"
    >
      <template #actions>
        <Button
          v-if="activeProviderId"
          type="button"
          variant="outline"
          size="sm"
          :disabled="saving || !persistenceAvailable"
          @click="handleSaveProvider"
        >
          保存
        </Button>
      </template>

      <div class="flex min-h-0 flex-col gap-4 p-4">
        <div
          v-if="!activeProviderId"
          class="flex min-h-80 flex-col items-start justify-between gap-6 rounded-lg border bg-muted/20 p-6"
        >
          <div class="flex max-w-2xl flex-col gap-2">
            <div class="flex items-center gap-2">
              <h3 class="text-base font-semibold">当前没有 Provider</h3>
              <Badge variant="secondary">空状态</Badge>
            </div>
            <p class="text-sm text-muted-foreground">
              从左侧预设创建一个本地草稿，或者直接新建一个 Provider 后再保存。
            </p>
          </div>

          <div class="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              :disabled="saving || presetsLoading"
              @click="createNewProviderDraft"
            >
              新建 Provider
            </Button>
          </div>
        </div>

        <template v-else>
          <div class="flex flex-col gap-4 rounded-lg border bg-card p-4">
            <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <h3 class="truncate text-base font-semibold">
                    {{ providerDraft.name || '未命名 Provider' }}
                  </h3>
                  <Badge
                    v-if="!isExistingProvider"
                    variant="secondary"
                  >
                    草稿
                  </Badge>
                  <Badge
                    v-else-if="providerDraft.enabled === false"
                    variant="outline"
                  >
                    禁用
                  </Badge>
                </div>
                <p class="mt-1 truncate text-sm text-muted-foreground">
                  {{ providerDraft.id }}
                </p>
              </div>

            </div>
          </div>

          <Tabs
            v-model="providerTab"
            activation-mode="manual"
            class="gap-4"
          >
            <TabsList class="w-full justify-start">
              <TabsTrigger value="basic">基础配置</TabsTrigger>
              <TabsTrigger value="models">模型配置</TabsTrigger>
              <TabsTrigger value="advanced">高级配置</TabsTrigger>
            </TabsList>

            <TabsContent
              value="basic"
              class="mt-0"
            >
              <ProviderBasicTab
                v-model:credential-mode="credentialMode"
                v-model:credential-value="credentialValue"
                :draft="providerDraft"
                :is-existing-provider="isExistingProvider"
                @update-provider-type="updateProviderType"
              />
            </TabsContent>

            <TabsContent
              value="models"
              class="mt-0"
            >
              <ProviderModelsTab
                :can-refresh-models="canRefreshModels"
                :draft="providerDraft"
                :enabled-models="enabledModels"
                :refreshing-models="refreshingModels"
                @add-model="addModel"
                @refresh-models="refreshProviderModels"
                @remove-model="removeModel"
                @set-optional-number="setOptionalNumber"
                @update-model-input="updateModelInput"
              />
            </TabsContent>

            <TabsContent
              value="advanced"
              class="mt-0"
            >
              <ProviderAdvancedTab :draft="providerDraft" />
            </TabsContent>
          </Tabs>
        </template>
      </div>
    </SettingsSection>

    <ProviderDeleteModal
      v-model:open="deleteDialogOpen"
      :provider-name="deleteProviderTarget?.name || '该 Provider'"
      :saving="saving"
      @confirm="handleDeleteProvider"
    />
  </div>
</template>

<script setup lang="ts">
import { PlugIcon } from '@lucide/vue'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { BridgeOpenAICodexOAuthStatus, BridgeProviderPreset } from '@/bridge/app'
import SettingsSection from '@/components/settings/common/SettingsSection.vue'
import ProviderAdvancedTab from '@/components/settings/provider-settings/ProviderAdvancedTab.vue'
import ProviderBasicTab from '@/components/settings/provider-settings/ProviderBasicTab.vue'
import ProviderDeleteModal from '@/components/settings/provider-settings/ProviderDeleteModal.vue'
import ProviderModelsTab from '@/components/settings/provider-settings/ProviderModelsTab.vue'
import ProviderOmniInferBasicTab from '@/components/settings/provider-settings/ProviderOmniInferBasicTab.vue'
import ProviderSelectorSidebar from '@/components/settings/provider-settings/ProviderSelectorSidebar.vue'
import type {
  ProviderDraftTab,
  ProviderSidebarItem,
} from '@/components/settings/provider-settings/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useProviderAutosave } from '@/composables/useProviderAutosave'
import { useProviderDraft } from '@/composables/useProviderDraft'
import { useOmniInferStore } from '@/stores/omniinfer'
import { useProviderStore } from '@/stores/provider'
import { useToast } from '@/utils/toast'

const { t } = useI18n()

const providerStore = useProviderStore()
const omniInferStore = useOmniInferStore()
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
const openAICodexOAuthBusy = ref(false)
const openAICodexOAuthStatus = ref<BridgeOpenAICodexOAuthStatus | null>(null)
let suppressDraftReload = false

const {
  providerDraft,
  credentialMode,
  credentialValue,
  loadingDraft,
  addModel,
  buildSaveRequest,
  clearSavedCredentialDraft,
  loadProviderDraft: loadProviderDraftState,
  removeModel,
  replaceModels,
  setOptionalNumber,
  startNewProviderDraft,
  startProviderDraftFromPreset,
  updateModelInput,
} = useProviderDraft({ rawProviders, originalProviderId })

const currentProvider = computed(() =>
  rawProviders.value.find((provider) => provider.id === originalProviderId.value)
)
const isExistingProvider = computed(() => Boolean(currentProvider.value))
const isOmniInferProvider = computed(
  () => providerDraft.value.api === 'omniinfer' || providerDraft.value.type === 'omniinfer'
)
const isOpenAICodexProvider = computed(
  () =>
    providerDraft.value.api === 'openai-codex-responses' ||
    providerDraft.value.type === 'openai-codex'
)
const hasDraft = computed(() => Boolean(activeProviderId.value && !isExistingProvider.value))
const canAutosave = computed(() => Boolean(isExistingProvider.value && persistenceAvailable.value))
const canRefreshModels = computed(() =>
  Boolean(
    persistenceAvailable.value &&
      (providerDraft.value.capabilities.listModels ||
        providerDraft.value.api === 'openai-chat-completions' ||
        providerDraft.value.api === 'openai-codex-responses' ||
        providerDraft.value.type === 'openai-codex' ||
        providerDraft.value.type === 'openai-compatible' ||
        isOmniInferProvider.value)
  )
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

watch(isOpenAICodexProvider, (enabled) => {
  if (enabled) {
    void refreshOpenAICodexOAuthStatus()
  } else {
    openAICodexOAuthStatus.value = null
  }
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
  loadProviderDraft(providerId, { resetTab: true })
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
  void refreshOpenAICodexOAuthStatus()
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

function loadProviderDraft(providerId: string, options: { resetTab?: boolean } = {}) {
  const provider = rawProviders.value.find((item) => item.id === providerId)
  if (!provider) return

  loadProviderDraftState(provider)
  if (options.resetTab) {
    providerTab.value = 'basic'
  }
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
  const savedCredential = Boolean(result.request.credential)

  try {
    suppressDraftReload = true
    const saved = await providerStore.saveProvider(result.request)
    if (saved?.id) {
      activeProviderId.value = saved.id
      originalProviderId.value = saved.id
      if (!options.silent) {
        loadProviderDraft(saved.id)
      }
      if (savedCredential && !options.silent) {
        clearSavedCredentialDraft()
      }
    }
    if (!options.silent) {
      toast.success(t('settings.provider.messages.saved'))
    }
    return true
  } catch (error) {
    toast.error(
      error,
      options.silent
        ? {
            id: 'provider-autosave-error',
            description: t('settings.provider.messages.autosaveFailed'),
          }
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
    toast.success(t('settings.provider.messages.deleted'))
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
    if (isOmniInferProvider.value) {
      await omniInferStore.refreshStatus()
    }
    toast.success(
      wasExistingProvider
        ? t('settings.provider.messages.modelsUpdated')
        : t('settings.provider.messages.savedAndModelsUpdated')
    )
  } catch (error) {
    toast.error(error)
  } finally {
    refreshingModels.value = false
    loadingDraft.value = false
  }
}

async function refreshOpenAICodexOAuthStatus() {
  if (!isOpenAICodexProvider.value || !activeProviderId.value || !persistenceAvailable.value) {
    openAICodexOAuthStatus.value = null
    return
  }

  try {
    openAICodexOAuthStatus.value = await providerStore.getOpenAICodexOAuthStatus(
      activeProviderId.value
    )
  } catch {
    openAICodexOAuthStatus.value = {
      providerId: activeProviderId.value,
      authenticated: false,
    }
  }
}

async function handleOpenAICodexOAuthLogin() {
  if (openAICodexOAuthBusy.value || !isOpenAICodexProvider.value || !persistenceAvailable.value) {
    return
  }

  openAICodexOAuthBusy.value = true
  try {
    const saved = await handleSaveProvider({ silent: true })
    if (!saved || !originalProviderId.value) return

    openAICodexOAuthStatus.value = await providerStore.loginOpenAICodexOAuth(
      originalProviderId.value
    )
    toast.success(t('settings.provider.messages.oauthLoginSuccess'))
  } catch (error) {
    toast.error(error, { description: t('settings.provider.messages.oauthLoginFailed') })
  } finally {
    openAICodexOAuthBusy.value = false
  }
}

async function handleOpenAICodexOAuthLogout() {
  if (openAICodexOAuthBusy.value || !originalProviderId.value || !persistenceAvailable.value) {
    return
  }

  openAICodexOAuthBusy.value = true
  try {
    openAICodexOAuthStatus.value = await providerStore.logoutOpenAICodexOAuth(
      originalProviderId.value
    )
    toast.success(t('settings.provider.messages.oauthLogoutSuccess'))
  } catch (error) {
    toast.error(error, { description: t('settings.provider.messages.oauthLogoutFailed') })
  } finally {
    openAICodexOAuthBusy.value = false
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
      :title="t('settings.provider.title')"
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
          {{ t('settings.provider.saveButton') }}
        </Button>
      </template>

      <div class="flex min-h-0 flex-col gap-4 p-4">
        <div
          v-if="!activeProviderId"
          class="flex min-h-80 flex-col items-start justify-between gap-6 rounded-lg border bg-muted/20 p-6"
        >
          <div class="flex max-w-2xl flex-col gap-2">
            <div class="flex items-center gap-2">
              <h3 class="text-base font-semibold">{{ t('settings.provider.emptyState') }}</h3>
            </div>
          </div>

          <div class="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              :disabled="saving || presetsLoading"
              @click="createNewProviderDraft"
            >
              {{ t('settings.provider.createNew') }}
            </Button>
          </div>
        </div>

        <template v-else>
          <Tabs
            v-model="providerTab"
            activation-mode="manual"
            class="gap-4"
          >
            <TabsList class="w-full justify-start">
              <TabsTrigger value="basic">{{ t('settings.provider.basic.tab') }}</TabsTrigger>
              <TabsTrigger value="models">{{ t('settings.provider.models.tab') }}</TabsTrigger>
              <TabsTrigger value="advanced">{{ t('settings.provider.advanced.tab') }}</TabsTrigger>
            </TabsList>

            <TabsContent
              value="basic"
              class="mt-0"
            >
              <ProviderOmniInferBasicTab
                v-if="isOmniInferProvider"
                :draft="providerDraft"
              />
              <ProviderBasicTab
                v-else
                v-model:credential-mode="credentialMode"
                v-model:credential-value="credentialValue"
                :draft="providerDraft"
                :is-existing-provider="isExistingProvider"
                :oauth-busy="openAICodexOAuthBusy"
                :oauth-status="openAICodexOAuthStatus"
                @oauth-login="handleOpenAICodexOAuthLogin"
                @oauth-logout="handleOpenAICodexOAuthLogout"
                @oauth-refresh="refreshOpenAICodexOAuthStatus"
              />
            </TabsContent>

            <TabsContent
              value="models"
              class="mt-0"
            >
              <ProviderModelsTab
                :can-refresh-models="canRefreshModels"
                :draft="providerDraft"
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
      :provider-name="deleteProviderTarget?.name || t('settings.provider.delete.title')"
      :saving="saving"
      @confirm="handleDeleteProvider"
    />
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import ProviderAdvancedTab from '@/components/settings/provider-settings/ProviderAdvancedTab.vue'
import ProviderBasicTab from '@/components/settings/provider-settings/ProviderBasicTab.vue'
import ProviderModelsTab from '@/components/settings/provider-settings/ProviderModelsTab.vue'
import ProviderSelectorSidebar from '@/components/settings/provider-settings/ProviderSelectorSidebar.vue'
import type {
  CredentialMode,
  ModelInput,
  ProviderDraft,
  ProviderDraftTab,
  ProviderModelDraft,
  ProviderSidebarItem,
} from '@/components/settings/provider-settings/types'
import SettingsSection from '@/components/settings/SettingsSection.vue'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import type {
  BridgeProviderConfig,
  BridgeProviderModel,
  BridgeProviderPreset,
} from '@/bridge/app'
import { useProviderStore } from '@/stores/provider'
import { useToast } from '@/utils/toast'
import type {
  ProviderApi,
  ProviderCapabilities,
  ProviderCompat,
  ProviderModel,
  ProviderType,
  SaveProviderRequest,
} from '@shared/types/provider'

const providerStore = useProviderStore()
const toast = useToast()
const {
  rawProviders,
  loading,
  saving,
  providerPresets,
  presetsLoading,
  persistenceAvailable,
} = storeToRefs(providerStore)

const activeProviderId = ref('')
const originalProviderId = ref('')
const providerDraft = ref<ProviderDraft>(createEmptyProviderDraft())
const providerTab = ref<ProviderDraftTab>('basic')
const credentialMode = ref<CredentialMode>('api-key')
const credentialValue = ref('')
const providerSearchQuery = ref('')
const deleteDialogOpen = ref(false)
const deleteProviderTarget = ref<ProviderSidebarItem | undefined>()
const loadingDraft = ref(false)
const refreshingModels = ref(false)
let autosaveTimer: ReturnType<typeof window.setTimeout> | undefined
let autosavePromise: Promise<boolean> | undefined
let autosaveQueued = false
let suppressDraftReload = false

const currentProvider = computed(() =>
  rawProviders.value.find((provider) => provider.id === originalProviderId.value),
)
const isExistingProvider = computed(() => Boolean(currentProvider.value))
const canRefreshModels = computed(() =>
  Boolean(persistenceAvailable.value && providerDraft.value.capabilities.listModels),
)
const enabledModels = computed(() =>
  providerDraft.value.models.filter((model) => model.enabled !== false),
)
const providerList = computed(() => rawProviders.value)
const providerSidebarList = computed<ProviderSidebarItem[]>(() => {
  const query = providerSearchQuery.value.trim().toLowerCase()
  const providers = providerList.value.filter((provider) => {
    if (!query) return true
    return [
      provider.name,
      provider.id,
      provider.baseUrl,
      provider.type,
    ].some((value) => String(value || '').toLowerCase().includes(query))
  })

  if (!isExistingProvider.value && activeProviderId.value) {
    const draft = providerDraft.value
    const matchesDraft = !query || [
      draft.name,
      draft.id,
      draft.baseUrl,
      draft.type,
    ].some((value) => String(value || '').toLowerCase().includes(query))

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

watch(
  rawProviders,
  (providers) => {
    if (!providers.length) {
      if (!activeProviderId.value) startNewProvider()
      return
    }

    const activeStillExists = providers.some((provider) => provider.id === activeProviderId.value)
    if (!activeProviderId.value || (!activeStillExists && isExistingProvider.value)) {
      void selectProvider(providers[0].id)
    } else if (activeStillExists && !suppressDraftReload) {
      loadProviderDraft(activeProviderId.value)
    }
  },
  { immediate: true },
)

watch(
  () => providerDraft.value.models.map((model) => model.id),
  () => {
    if (!providerDraft.value.models.some((model) => model.id === providerDraft.value.defaultModelId)) {
      providerDraft.value.defaultModelId = providerDraft.value.models[0]?.id || ''
    }
  },
)

watch(
  providerDraft,
  () => {
    if (loadingDraft.value || !isExistingProvider.value || !persistenceAvailable.value) {
      return
    }

    if (saving.value) {
      autosaveQueued = true
      return
    }

    scheduleAutosave()
  },
  { deep: true },
)

onMounted(async () => {
  if (!rawProviders.value.length) {
    await providerStore.loadProviders()
  }
  await providerStore.loadProviderPresets()
})

onBeforeUnmount(() => {
  void flushAutosave()
})

async function selectProvider(providerId: string) {
  if (providerId === activeProviderId.value) return
  const saved = await flushAutosave()
  if (!saved) return

  activeProviderId.value = providerId
  loadProviderDraft(providerId)
}

async function selectProviderSidebarItem(provider: ProviderSidebarItem) {
  if (provider.unsaved) return
  await selectProvider(provider.id)
}

async function createProviderFromPreset(preset: BridgeProviderPreset) {
  clearMessages()
  const savedCurrent = await flushAutosave()
  if (!savedCurrent) return

  try {
    const saved = await providerStore.createProviderFromPreset({ presetId: preset.id })
    if (saved?.id) {
      activeProviderId.value = saved.id
      originalProviderId.value = saved.id
      loadProviderDraft(saved.id)
    }
    toast.success(`${saved?.name || preset.name} 已添加。`)
  } catch (error) {
    toast.error(error)
  }
}

function loadProviderDraft(providerId: string) {
  const provider = rawProviders.value.find((item) => item.id === providerId)
  if (!provider) return

  loadingDraft.value = true
  providerDraft.value = draftFromProvider(provider)
  originalProviderId.value = provider.id
  credentialMode.value = 'api-key'
  credentialValue.value = ''
  providerTab.value = 'basic'
  clearMessages()
  void nextTick(() => {
    loadingDraft.value = false
  })
}

function startNewProvider() {
  const draft = createEmptyProviderDraft()
  loadingDraft.value = true
  providerDraft.value = draft
  activeProviderId.value = draft.id
  originalProviderId.value = ''
  credentialMode.value = 'api-key'
  credentialValue.value = ''
  providerTab.value = 'basic'
  clearMessages()
  void nextTick(() => {
    loadingDraft.value = false
  })
}

async function handleSaveProvider(options: { silent?: boolean } = {}): Promise<boolean> {
  clearAutosaveTimer()
  if (!options.silent) {
    clearMessages()
  }

  const validation = validateDraft()
  if (validation) {
    if (!options.silent) toast.error(validation)
    return false
  }

  const parsedHeaders = parseStringRecord(providerDraft.value.headersText, 'Headers')
  if (!parsedHeaders.ok) {
    if (!options.silent) toast.error(parsedHeaders.message)
    return false
  }

  const parsedExtraBody = parseObject(providerDraft.value.extraBodyText, 'Extra Body')
  if (!parsedExtraBody.ok) {
    if (!options.silent) toast.error(parsedExtraBody.message)
    return false
  }

  const request: SaveProviderRequest = {
    provider: {
      id: providerDraft.value.id.trim(),
      name: providerDraft.value.name.trim(),
      type: providerDraft.value.type,
      api: providerDraft.value.api,
      baseUrl: providerDraft.value.baseUrl.trim(),
      enabled: providerDraft.value.enabled,
      credentialRef: providerDraft.value.credentialRef || `${providerDraft.value.id.trim()}:default`,
      authHeader: providerDraft.value.authHeader.trim() || 'Authorization',
      headers: parsedHeaders.value,
      extraBody: parsedExtraBody.value,
      defaultModelId: providerDraft.value.defaultModelId || providerDraft.value.models[0]?.id,
      capabilities: { ...providerDraft.value.capabilities },
      createdAt: providerDraft.value.createdAt,
      updatedAt: providerDraft.value.updatedAt,
      models: providerDraft.value.models.map(toProviderModel),
    },
  }

  if (providerDraft.value.compat.reasoningFormat !== 'none'
    || providerDraft.value.compat.maxTokensField !== 'max_tokens'
    || !providerDraft.value.compat.supportsSystemRole
    || providerDraft.value.compat.supportsDeveloperRole
    || providerDraft.value.compat.supportsJsonMode
  ) {
    request.provider.compat = { ...providerDraft.value.compat }
  }

  const credential = buildCredential()
  if (credential) {
    request.credential = credential
  }

  try {
    suppressDraftReload = Boolean(options.silent)
    const saved = await providerStore.saveProvider(request)
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
    toast.error(error, options.silent
      ? { id: 'provider-autosave-error', description: 'Provider 自动保存失败' }
      : undefined)
    return false
  } finally {
    suppressDraftReload = false
    if (autosaveQueued) {
      autosaveQueued = false
      scheduleAutosave()
    }
  }
}

function scheduleAutosave() {
  clearAutosaveTimer()

  autosaveTimer = window.setTimeout(() => {
    autosaveTimer = undefined
    autosavePromise = handleSaveProvider({ silent: true }).finally(() => {
      autosavePromise = undefined
    })
  }, 500)
}

function clearAutosaveTimer() {
  if (!autosaveTimer) return
  window.clearTimeout(autosaveTimer)
  autosaveTimer = undefined
}

async function flushAutosave(): Promise<boolean> {
  clearAutosaveTimer()

  if (autosavePromise) {
    const saved = await autosavePromise
    clearAutosaveTimer()
    if (!saved) return false
  }

  if (!isExistingProvider.value || !persistenceAvailable.value || loadingDraft.value) {
    return true
  }

  return handleSaveProvider({ silent: true })
}

async function handleDeleteProvider() {
  const target = deleteProviderTarget.value
  if (!target || target.unsaved || !persistenceAvailable.value) return

  clearMessages()
  if (target.id !== originalProviderId.value) {
    const savedCurrent = await flushAutosave()
    if (!savedCurrent) return
  } else {
    clearAutosaveTimer()
  }

  try {
    await providerStore.deleteProvider({ providerId: target.id })
    deleteDialogOpen.value = false
    deleteProviderTarget.value = undefined

    if (target.id === originalProviderId.value) {
      const nextProvider = rawProviders.value.find((provider) => provider.id !== target.id)
      if (nextProvider) {
        await selectProvider(nextProvider.id)
      } else {
        startNewProvider()
      }
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
    loadingDraft.value = true
    providerDraft.value.models = models.map(draftFromModel)
    if (!providerDraft.value.models.some((model) => model.id === providerDraft.value.defaultModelId)) {
      providerDraft.value.defaultModelId = providerDraft.value.models[0]?.id || ''
    }
    await nextTick()
    loadingDraft.value = false
    toast.success(wasExistingProvider ? '模型列表已更新。' : 'Provider 已保存，模型列表已更新。')
  } catch (error) {
    toast.error(error)
  } finally {
    refreshingModels.value = false
    loadingDraft.value = false
  }
}

function addModel() {
  const id = uniqueId('model')
  providerDraft.value.models.push({
    id,
    name: 'New Model',
    remoteId: id,
    enabled: true,
    input: ['text'],
    supportsStreaming: true,
    supportsTools: false,
    supportsReasoning: false,
  })
  providerDraft.value.defaultModelId ||= id
}

function removeModel(index: number) {
  const removed = providerDraft.value.models[index]
  providerDraft.value.models.splice(index, 1)
  if (removed?.id === providerDraft.value.defaultModelId) {
    providerDraft.value.defaultModelId = providerDraft.value.models[0]?.id || ''
  }
}

function updateProviderType(value: ProviderType) {
  providerDraft.value.type = value
  providerDraft.value.api = apiFromType(value)
  if (value === 'ollama') providerDraft.value.baseUrl ||= 'http://localhost:11434/v1'
  if (value === 'openai-compatible') providerDraft.value.baseUrl ||= 'https://api.openai.com/v1'
}

function updateModelInput(model: ProviderModelDraft, input: ModelInput, checked: boolean | 'indeterminate') {
  const next = new Set(model.input)
  if (checked === true) {
    next.add(input)
  } else {
    next.delete(input)
  }

  if (!next.size) next.add('text')
  model.input = [...next]
}

function setOptionalNumber(model: ProviderModelDraft, key: 'contextWindow' | 'maxOutputTokens', value: string | number) {
  const text = String(value).trim()
  if (!text) {
    model[key] = undefined
    return
  }

  const next = Number(text)
  model[key] = Number.isFinite(next) && next >= 0 ? Math.round(next) : undefined
}

function clearMessages() {
}

function createEmptyProviderDraft(): ProviderDraft {
  const id = uniqueId('provider')
  return {
    id,
    name: 'New Provider',
    type: 'openai-compatible',
    api: 'openai-chat-completions',
    baseUrl: 'https://api.openai.com/v1',
    enabled: true,
    authHeader: 'Authorization',
    headersText: '{}',
    extraBodyText: '{}',
    defaultModelId: '',
    capabilities: {
      listModels: true,
      streaming: true,
      tools: true,
      vision: true,
    },
    compat: {
      maxTokensField: 'max_tokens',
      supportsSystemRole: true,
      supportsDeveloperRole: false,
      supportsJsonMode: true,
      reasoningFormat: 'none',
    },
    models: [],
  }
}

function draftFromProvider(provider: BridgeProviderConfig): ProviderDraft {
  const models = (provider.models?.length ? provider.models : []).map(draftFromModel)
  const firstModelId = models[0]?.id || ''
  const type = providerType(provider.type || provider.api)

  return {
    id: provider.id,
    name: provider.name,
    type,
    api: provider.api || apiFromType(type),
    baseUrl: provider.baseUrl || '',
    enabled: provider.enabled !== false,
    credentialRef: typeof provider.credentialRef === 'string' ? provider.credentialRef : undefined,
    authHeader: typeof provider.authHeader === 'string' ? provider.authHeader : 'Authorization',
    headersText: formatJson(isRecord(provider.headers) ? provider.headers : {}),
    extraBodyText: formatJson(isRecord(provider.extraBody) ? provider.extraBody : {}),
    defaultModelId: provider.defaultModelId || firstModelId,
    capabilities: normalizeCapabilities(provider.capabilities),
    compat: normalizeCompat(provider.compat),
    models,
    createdAt: typeof provider.createdAt === 'number' ? provider.createdAt : undefined,
    updatedAt: typeof provider.updatedAt === 'number' ? provider.updatedAt : undefined,
  }
}

function draftFromModel(model: BridgeProviderModel | ProviderModel): ProviderModelDraft {
  const capabilities = isRecord(model.capabilities) ? model.capabilities : {}
  return {
    id: model.id,
    name: model.displayName || model.name || model.id,
    remoteId: model.remoteId || model.id,
    enabled: model.enabled !== false,
    input: normalizeInput(model.input ?? capabilities.input),
    supportsStreaming: model.supportsStreaming !== false,
    supportsTools: Boolean(model.supportsTools || capabilities.tools || capabilities.toolCall),
    supportsReasoning: Boolean(model.supportsReasoning || capabilities.reasoning),
    contextWindow: typeof model.contextWindow === 'number' ? model.contextWindow : undefined,
    maxOutputTokens: typeof model.maxOutputTokens === 'number' ? model.maxOutputTokens : undefined,
    compat: isRecord(model.compat) ? model.compat : undefined,
  }
}

function toProviderModel(model: ProviderModelDraft): ProviderModel {
  return {
    id: model.id.trim(),
    name: model.name.trim() || model.id.trim(),
    remoteId: model.remoteId.trim() || model.id.trim(),
    enabled: model.enabled,
    input: [...model.input],
    supportsStreaming: model.supportsStreaming,
    supportsTools: model.supportsTools,
    supportsReasoning: model.supportsReasoning,
    contextWindow: model.contextWindow,
    maxOutputTokens: model.maxOutputTokens,
    compat: model.compat ? { ...model.compat } : undefined,
  }
}

function buildCredential(): SaveProviderRequest['credential'] | undefined {
  const value = credentialValue.value.trim()
  if (credentialMode.value === 'none' || !value) return undefined

  if (credentialMode.value === 'env') {
    return {
      type: 'env',
      label: 'Environment variable',
      envVar: value,
    }
  }

  return {
    type: 'api-key',
    label: 'Default API Key',
    value,
  }
}

function validateDraft() {
  if (!providerDraft.value.id.trim()) return 'Provider ID 不能为空。'
  if (!providerDraft.value.name.trim()) return 'Provider 名称不能为空。'
  if (!providerDraft.value.baseUrl.trim()) return 'Base URL 不能为空。'

  const modelIds = new Set<string>()
  for (const model of providerDraft.value.models) {
    if (!model.id.trim()) return '模型 ID 不能为空。'
    if (modelIds.has(model.id.trim())) return `模型 ID 重复：${model.id.trim()}`
    if (modelIdBelongsToOtherProvider(model.id.trim())) return `模型 ID 已被其他 Provider 使用：${model.id.trim()}`
    modelIds.add(model.id.trim())
  }

  if (providerDraft.value.defaultModelId && !modelIds.has(providerDraft.value.defaultModelId)) {
    return '默认模型必须来自当前模型列表。'
  }

  return ''
}

function parseStringRecord(text: string, label: string):
  | { ok: true; value: Record<string, string> }
  | { ok: false; message: string } {
  const parsed = parseObject(text, label)
  if (!parsed.ok) return parsed
  if (Object.values(parsed.value).some((value) => typeof value !== 'string')) {
    return { ok: false, message: `${label} 的值必须都是字符串。` }
  }
  return { ok: true, value: parsed.value as Record<string, string> }
}

function parseObject(text: string, label: string):
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; message: string } {
  const trimmed = text.trim()
  if (!trimmed) return { ok: true, value: {} }

  try {
    const value = JSON.parse(trimmed)
    if (!isRecord(value)) {
      return { ok: false, message: `${label} 必须是 JSON 对象。` }
    }
    return { ok: true, value }
  } catch (error) {
    return { ok: false, message: `${label} JSON 无法解析：${errorToText(error)}` }
  }
}

function normalizeCapabilities(value: unknown): Required<ProviderCapabilities> {
  const record = isRecord(value) ? value : {}
  return {
    listModels: Boolean(record.listModels),
    streaming: record.streaming !== false,
    tools: Boolean(record.tools),
    vision: Boolean(record.vision),
  }
}

function normalizeCompat(value: unknown): Required<ProviderCompat> {
  const record = isRecord(value) ? value : {}
  return {
    maxTokensField: record.maxTokensField === 'max_completion_tokens' ? 'max_completion_tokens' : 'max_tokens',
    supportsSystemRole: record.supportsSystemRole !== false,
    supportsDeveloperRole: Boolean(record.supportsDeveloperRole),
    supportsJsonMode: record.supportsJsonMode !== false,
    reasoningFormat: normalizeReasoningFormat(record.reasoningFormat),
  }
}

function normalizeReasoningFormat(value: unknown): Required<ProviderCompat>['reasoningFormat'] {
  if (value === 'openai' || value === 'deepseek' || value === 'qwen') return value
  return 'none'
}

function normalizeInput(value: unknown): ModelInput[] {
  if (!Array.isArray(value)) return ['text']
  const input = value.filter((item): item is ModelInput =>
    item === 'text' || item === 'image' || item === 'audio' || item === 'file',
  )
  return input.length ? input : ['text']
}

function providerType(value?: string): ProviderType {
  if (value === 'ollama') return 'ollama'
  if (value === 'omniinfer') return 'omniinfer'
  return 'openai-compatible'
}

function apiFromType(type: ProviderType): ProviderApi {
  if (type === 'ollama') return 'ollama'
  if (type === 'omniinfer') return 'omniinfer'
  return 'openai-chat-completions'
}

function modelIdBelongsToOtherProvider(modelId: string) {
  return rawProviders.value.some((provider) =>
    provider.id !== originalProviderId.value
    && provider.models?.some((model) => model.id === modelId),
  )
}

function uniqueId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}`
}

function formatJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

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
      <div class="flex flex-col gap-4 p-4">
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
      </div>
    </SettingsSection>

    <Dialog v-model:open="deleteDialogOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>删除 Provider</DialogTitle>
          <DialogDescription>
            删除 {{ deleteProviderTarget?.name || '该 Provider' }} 后，其下模型也会从配置中移除。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            @click="deleteDialogOpen = false"
          >
            取消
          </Button>
          <Button
            variant="destructive"
            :disabled="saving"
            @click="handleDeleteProvider"
          >
            删除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

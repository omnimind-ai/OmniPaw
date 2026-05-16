<script setup lang="ts">
import { storeToRefs } from 'pinia'
import {
  CloudIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
} from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import SettingsSection from '@/components/settings/SettingsSection.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type {
  BridgeProviderConfig,
  BridgeProviderModel,
  BridgeProviderPreset,
} from '@/bridge/app'
import { useProviderStore } from '@/stores/provider'
import type {
  ProviderApi,
  ProviderCapabilities,
  ProviderCompat,
  ProviderModel,
  ProviderType,
  SaveProviderRequest,
} from '@shared/types/provider'

type ProviderDraftTab = 'basic' | 'models' | 'advanced'
type CredentialMode = 'api-key' | 'env' | 'none'
type ModelInput = 'text' | 'image' | 'audio' | 'file'

interface ProviderDraft {
  id: string
  name: string
  type: ProviderType
  api: ProviderApi
  baseUrl: string
  enabled: boolean
  credentialRef?: string
  authHeader: string
  headersText: string
  extraBodyText: string
  defaultModelId: string
  capabilities: Required<ProviderCapabilities>
  compat: Required<ProviderCompat>
  models: ProviderModelDraft[]
  createdAt?: number
  updatedAt?: number
}

interface ProviderModelDraft {
  id: string
  name: string
  remoteId: string
  enabled: boolean
  input: ModelInput[]
  supportsStreaming: boolean
  supportsTools: boolean
  supportsReasoning: boolean
  contextWindow?: number
  maxOutputTokens?: number
  compat?: ProviderCompat
}

interface ProviderSidebarItem {
  id: string
  name: string
  baseUrl: string
  type?: string
  enabled?: boolean
  unsaved?: boolean
}

const providerStore = useProviderStore()
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
const errorMessage = ref('')
const successMessage = ref('')
const loadingDraft = ref(false)
let autosaveTimer: ReturnType<typeof window.setTimeout> | undefined
let autosavePromise: Promise<boolean> | undefined
let autosaveQueued = false
let suppressDraftReload = false

const currentProvider = computed(() =>
  rawProviders.value.find((provider) => provider.id === originalProviderId.value),
)
const isExistingProvider = computed(() => Boolean(currentProvider.value))
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
    successMessage.value = `${saved?.name || preset.name} 已添加。`
  } catch (error) {
    errorMessage.value = errorToText(error)
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
  } else {
    errorMessage.value = ''
  }

  const validation = validateDraft()
  if (validation) {
    errorMessage.value = validation
    return false
  }

  const parsedHeaders = parseStringRecord(providerDraft.value.headersText, 'Headers')
  if (!parsedHeaders.ok) {
    errorMessage.value = parsedHeaders.message
    return false
  }

  const parsedExtraBody = parseObject(providerDraft.value.extraBodyText, 'Extra Body')
  if (!parsedExtraBody.ok) {
    errorMessage.value = parsedExtraBody.message
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
      successMessage.value = 'Provider 已保存。'
    }
    return true
  } catch (error) {
    errorMessage.value = errorToText(error)
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
  if (!isExistingProvider.value) return

  clearAutosaveTimer()
  clearMessages()
  try {
    await providerStore.deleteProvider({ providerId: originalProviderId.value })
    deleteDialogOpen.value = false
    const nextProvider = rawProviders.value.find((provider) => provider.id !== originalProviderId.value)
    if (nextProvider) {
      await selectProvider(nextProvider.id)
    } else {
      startNewProvider()
    }
    successMessage.value = 'Provider 已删除。'
  } catch (error) {
    errorMessage.value = errorToText(error)
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

function isModelInputChecked(model: ProviderModelDraft, input: ModelInput) {
  return model.input.includes(input)
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
  errorMessage.value = ''
  successMessage.value = ''
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

function draftFromModel(model: BridgeProviderModel): ProviderModelDraft {
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

function errorToText(error: unknown) {
  if (!error) return '未知错误'
  if (error instanceof Error) return error.message
  if (isRecord(error) && typeof error.message === 'string') return error.message
  return String(error)
}
</script>

<template>
  <div class="flex min-h-0 w-full flex-1 flex-col gap-4 lg:flex-row">
    <aside class="flex min-h-0 w-full shrink-0 flex-col rounded-md border bg-sidebar text-sidebar-foreground lg:sticky lg:top-6 lg:h-[calc(100svh-3rem)] lg:w-80">
      <div class="flex items-center gap-2 border-b p-3">
        <InputGroup class="min-w-0 flex-1">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            v-model="providerSearchQuery"
            aria-label="搜索 Provider"
            placeholder="搜索模型平台..."
          />
        </InputGroup>

        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button
              variant="outline"
              size="icon"
              aria-label="添加 Provider"
              :disabled="saving || presetsLoading"
            >
              <PlusIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            class="w-64"
          >
            <DropdownMenuGroup>
              <DropdownMenuItem
                v-if="presetsLoading"
                disabled
              >
                正在加载...
              </DropdownMenuItem>
              <DropdownMenuItem
                v-else-if="!providerPresets.length"
                disabled
              >
                暂无 Provider 预设。
              </DropdownMenuItem>
              <template v-else>
                <DropdownMenuItem
                  v-for="preset in providerPresets"
                  :key="preset.id"
                  class="items-start gap-2"
                  @select="createProviderFromPreset(preset)"
                >
                  <CloudIcon class="mt-0.5" />
                  <span class="min-w-0 flex-1">
                    <span class="block truncate font-medium">{{ preset.name }}</span>
                    <span class="block truncate text-xs text-muted-foreground">{{ preset.baseUrl }}</span>
                  </span>
                </DropdownMenuItem>
              </template>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto p-2">
        <div
          v-if="loading"
          class="rounded-lg border px-3 py-2 text-sm text-muted-foreground"
        >
          正在加载...
        </div>

        <div
          v-else-if="!providerSidebarList.length"
          class="rounded-lg border px-3 py-2 text-sm text-muted-foreground"
        >
          暂无匹配 Provider。
        </div>

        <div
          v-else
          class="flex flex-col gap-1"
        >
          <button
            v-for="provider in providerSidebarList"
            :key="provider.unsaved ? `draft-${provider.id}` : provider.id"
            type="button"
            :class="cn(
              'flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm transition-colors',
              provider.id === activeProviderId
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
            )"
            @click="selectProviderSidebarItem(provider)"
          >
            <CloudIcon />
            <span class="min-w-0 flex-1 truncate font-medium">
              {{ provider.name }}
            </span>
            <Badge
              v-if="provider.unsaved"
              variant="secondary"
            >
              新增
            </Badge>
            <Badge
              v-else-if="provider.enabled === false"
              variant="outline"
            >
              禁用
            </Badge>
          </button>
        </div>
      </div>

    </aside>

    <SettingsSection
      title="模型服务"
      class="min-w-0 flex-1 self-stretch"
    >
      <div class="flex flex-col gap-4 p-4">
        <div
          v-if="errorMessage"
          class="rounded-lg border border-destructive/40 px-3 py-2 text-sm text-destructive"
        >
          {{ errorMessage }}
        </div>
        <div
          v-if="successMessage"
          class="rounded-lg border px-3 py-2 text-sm text-muted-foreground"
        >
          {{ successMessage }}
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
            <FieldGroup>
              <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Field>
                  <FieldLabel for="provider-name">名称</FieldLabel>
                  <Input
                    id="provider-name"
                    v-model="providerDraft.name"
                  />
                </Field>

                <Field>
                  <FieldLabel for="provider-id">Provider ID</FieldLabel>
                  <Input
                    id="provider-id"
                    v-model="providerDraft.id"
                    :disabled="isExistingProvider"
                  />
                </Field>
              </div>

              <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Field>
                  <FieldLabel for="provider-type">类型</FieldLabel>
                  <Select
                    :model-value="providerDraft.type"
                    @update:model-value="updateProviderType($event as ProviderType)"
                  >
                    <SelectTrigger
                      id="provider-type"
                      class="w-full"
                    >
                      <SelectValue placeholder="选择类型" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="openai-compatible">OpenAI Compatible</SelectItem>
                        <SelectItem value="ollama">Ollama</SelectItem>
                        <SelectItem value="omniinfer">OmniInfer</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>

                <Field>
                  <FieldLabel for="provider-api">API</FieldLabel>
                  <Select v-model="providerDraft.api">
                    <SelectTrigger
                      id="provider-api"
                      class="w-full"
                    >
                      <SelectValue placeholder="选择 API" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="openai-chat-completions">OpenAI Chat Completions</SelectItem>
                        <SelectItem value="openai-responses">OpenAI Responses</SelectItem>
                        <SelectItem value="ollama">Ollama</SelectItem>
                        <SelectItem value="omniinfer">OmniInfer</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <Field>
                <FieldLabel for="provider-base-url">Base URL</FieldLabel>
                <InputGroup>
                  <InputGroupAddon>
                    <CloudIcon />
                  </InputGroupAddon>
                  <InputGroupInput
                    id="provider-base-url"
                    v-model="providerDraft.baseUrl"
                    placeholder="https://api.openai.com/v1"
                  />
                </InputGroup>
              </Field>

              <Field
                orientation="horizontal"
                class="items-center rounded-lg border px-3 py-2"
              >
                <Switch
                  id="provider-enabled"
                  v-model="providerDraft.enabled"
                  aria-label="启用 Provider"
                />
                <FieldContent>
                  <FieldLabel for="provider-enabled">启用 Provider</FieldLabel>
                  <FieldDescription>禁用后该 Provider 下模型不会出现在可选列表中。</FieldDescription>
                </FieldContent>
              </Field>

              <Separator />

              <FieldSet>
                <FieldLegend>凭证</FieldLegend>
                <FieldDescription>留空会保留已有凭证。</FieldDescription>

                <div class="grid grid-cols-1 gap-4 lg:grid-cols-[12rem_minmax(0,1fr)]">
                  <Field>
                    <FieldLabel for="credential-mode">凭证类型</FieldLabel>
                    <Select v-model="credentialMode">
                      <SelectTrigger
                        id="credential-mode"
                        class="w-full"
                      >
                        <SelectValue placeholder="选择凭证类型" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="api-key">API Key</SelectItem>
                          <SelectItem value="env">环境变量</SelectItem>
                          <SelectItem value="none">不更新</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field :data-disabled="credentialMode === 'none'">
                    <FieldLabel for="credential-value">
                      {{ credentialMode === 'env' ? '环境变量名' : 'API Key' }}
                    </FieldLabel>
                    <Input
                      id="credential-value"
                      v-model="credentialValue"
                      :disabled="credentialMode === 'none'"
                      :type="credentialMode === 'api-key' ? 'password' : 'text'"
                      placeholder="留空保留已有值"
                    />
                  </Field>
                </div>
              </FieldSet>
            </FieldGroup>
          </TabsContent>

          <TabsContent
            value="models"
            class="mt-0"
          >
            <div class="flex flex-col gap-4">
              <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <Field class="md:max-w-sm">
                  <FieldLabel for="provider-default-model">当前 Provider 默认模型</FieldLabel>
                  <Select
                    v-model="providerDraft.defaultModelId"
                    :disabled="!enabledModels.length"
                  >
                    <SelectTrigger
                      id="provider-default-model"
                      class="w-full"
                    >
                      <SelectValue placeholder="选择模型" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem
                          v-for="model in enabledModels"
                          :key="model.id"
                          :value="model.id"
                        >
                          {{ model.name || model.id }}
                        </SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>

                <Button
                  variant="outline"
                  @click="addModel"
                >
                  <PlusIcon data-icon="inline-start" />
                  添加模型
                </Button>
              </div>

              <div
                v-if="!providerDraft.models.length"
                class="rounded-lg border px-3 py-4 text-sm text-muted-foreground"
              >
                还没有模型，先添加一个模型或刷新远程模型列表。
              </div>

              <div
                v-for="(model, index) in providerDraft.models"
                :key="`${model.id}-${index}`"
                class="flex flex-col gap-4 rounded-lg border p-4"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <div class="flex items-center gap-2">
                      <h3 class="truncate text-sm font-medium">
                        {{ model.name || model.id || '未命名模型' }}
                      </h3>
                      <Badge
                        v-if="model.id === providerDraft.defaultModelId"
                        variant="secondary"
                      >
                        默认
                      </Badge>
                    </div>
                    <p class="mt-1 truncate text-xs text-muted-foreground">
                      {{ model.remoteId || model.id }}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="删除模型"
                    @click="removeModel(index)"
                  >
                    <Trash2Icon />
                  </Button>
                </div>

                <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
                  <Field>
                    <FieldLabel :for="`model-id-${index}`">模型 ID</FieldLabel>
                    <Input
                      :id="`model-id-${index}`"
                      v-model="model.id"
                    />
                  </Field>
                  <Field>
                    <FieldLabel :for="`model-name-${index}`">显示名称</FieldLabel>
                    <Input
                      :id="`model-name-${index}`"
                      v-model="model.name"
                    />
                  </Field>
                  <Field>
                    <FieldLabel :for="`model-remote-${index}`">Remote ID</FieldLabel>
                    <Input
                      :id="`model-remote-${index}`"
                      v-model="model.remoteId"
                    />
                  </Field>
                </div>

                <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <Field>
                    <FieldLabel :for="`model-context-${index}`">上下文窗口</FieldLabel>
                    <Input
                      :id="`model-context-${index}`"
                      type="number"
                      min="0"
                      :model-value="model.contextWindow ?? ''"
                      @update:model-value="setOptionalNumber(model, 'contextWindow', $event)"
                    />
                  </Field>
                  <Field>
                    <FieldLabel :for="`model-output-${index}`">最大输出 Token</FieldLabel>
                    <Input
                      :id="`model-output-${index}`"
                      type="number"
                      min="0"
                      :model-value="model.maxOutputTokens ?? ''"
                      @update:model-value="setOptionalNumber(model, 'maxOutputTokens', $event)"
                    />
                  </Field>
                </div>

                <FieldSet>
                  <FieldLegend variant="label">输入能力</FieldLegend>
                  <FieldGroup
                    data-slot="checkbox-group"
                    class="grid grid-cols-2 gap-3 md:grid-cols-4"
                  >
                    <Field
                      v-for="input in ['text', 'image', 'audio', 'file'] as ModelInput[]"
                      :key="input"
                      orientation="horizontal"
                      class="items-center"
                    >
                      <Checkbox
                        :id="`model-${index}-${input}`"
                        :model-value="isModelInputChecked(model, input)"
                        @update:model-value="updateModelInput(model, input, $event)"
                      />
                      <FieldLabel :for="`model-${index}-${input}`">
                        {{ input }}
                      </FieldLabel>
                    </Field>
                  </FieldGroup>
                </FieldSet>

                <div class="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <Field
                    orientation="horizontal"
                    class="items-center"
                  >
                    <Switch
                      :id="`model-enabled-${index}`"
                      v-model="model.enabled"
                      aria-label="启用模型"
                    />
                    <FieldLabel :for="`model-enabled-${index}`">启用</FieldLabel>
                  </Field>
                  <Field
                    orientation="horizontal"
                    class="items-center"
                  >
                    <Switch
                      :id="`model-streaming-${index}`"
                      v-model="model.supportsStreaming"
                      aria-label="支持流式输出"
                    />
                    <FieldLabel :for="`model-streaming-${index}`">流式</FieldLabel>
                  </Field>
                  <Field
                    orientation="horizontal"
                    class="items-center"
                  >
                    <Switch
                      :id="`model-tools-${index}`"
                      v-model="model.supportsTools"
                      aria-label="支持工具"
                    />
                    <FieldLabel :for="`model-tools-${index}`">工具</FieldLabel>
                  </Field>
                  <Field
                    orientation="horizontal"
                    class="items-center"
                  >
                    <Switch
                      :id="`model-reasoning-${index}`"
                      v-model="model.supportsReasoning"
                      aria-label="支持推理"
                    />
                    <FieldLabel :for="`model-reasoning-${index}`">推理</FieldLabel>
                  </Field>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent
            value="advanced"
            class="mt-0"
          >
            <FieldGroup>
              <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Field>
                  <FieldLabel for="provider-auth-header">认证 Header</FieldLabel>
                  <Input
                    id="provider-auth-header"
                    v-model="providerDraft.authHeader"
                  />
                </Field>

                <Field>
                  <FieldLabel for="provider-max-token-field">Max Tokens 字段</FieldLabel>
                  <Select v-model="providerDraft.compat.maxTokensField">
                    <SelectTrigger
                      id="provider-max-token-field"
                      class="w-full"
                    >
                      <SelectValue placeholder="选择字段" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="max_tokens">max_tokens</SelectItem>
                        <SelectItem value="max_completion_tokens">max_completion_tokens</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Field
                  orientation="horizontal"
                  class="items-center rounded-lg border px-3 py-2"
                >
                  <Switch
                    id="provider-list-models"
                    v-model="providerDraft.capabilities.listModels"
                    aria-label="支持列出模型"
                  />
                  <FieldLabel for="provider-list-models">支持列出模型</FieldLabel>
                </Field>
                <Field
                  orientation="horizontal"
                  class="items-center rounded-lg border px-3 py-2"
                >
                  <Switch
                    id="provider-tools"
                    v-model="providerDraft.capabilities.tools"
                    aria-label="默认支持工具"
                  />
                  <FieldLabel for="provider-tools">默认支持工具</FieldLabel>
                </Field>
                <Field
                  orientation="horizontal"
                  class="items-center rounded-lg border px-3 py-2"
                >
                  <Switch
                    id="provider-system-role"
                    v-model="providerDraft.compat.supportsSystemRole"
                    aria-label="支持 system role"
                  />
                  <FieldLabel for="provider-system-role">System role</FieldLabel>
                </Field>
                <Field
                  orientation="horizontal"
                  class="items-center rounded-lg border px-3 py-2"
                >
                  <Switch
                    id="provider-json-mode"
                    v-model="providerDraft.compat.supportsJsonMode"
                    aria-label="支持 JSON mode"
                  />
                  <FieldLabel for="provider-json-mode">JSON mode</FieldLabel>
                </Field>
              </div>

              <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Field>
                  <FieldLabel for="provider-headers">Headers JSON</FieldLabel>
                  <Textarea
                    id="provider-headers"
                    v-model="providerDraft.headersText"
                    class="min-h-40 font-mono text-xs"
                  />
                </Field>

                <Field>
                  <FieldLabel for="provider-extra-body">Extra Body JSON</FieldLabel>
                  <Textarea
                    id="provider-extra-body"
                    v-model="providerDraft.extraBodyText"
                    class="min-h-40 font-mono text-xs"
                  />
                </Field>
              </div>
            </FieldGroup>
          </TabsContent>
        </Tabs>

        <Separator />

        <div class="flex justify-start">
          <Button
            variant="destructive"
            :disabled="!isExistingProvider || saving || !persistenceAvailable"
            @click="deleteDialogOpen = true"
          >
            <Trash2Icon data-icon="inline-start" />
            删除 Provider
          </Button>
        </div>
      </div>
    </SettingsSection>

    <Dialog v-model:open="deleteDialogOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>删除 Provider</DialogTitle>
          <DialogDescription>
            删除后该 Provider 下的模型也会从配置中移除。
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

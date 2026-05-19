import type {
  ProviderApi,
  ProviderCapabilities,
  ProviderCompat,
  ProviderModel,
  ProviderType,
  SaveProviderRequest,
} from '@shared/types/provider'
import { nextTick, type Ref, ref } from 'vue'
import type { BridgeProviderConfig, BridgeProviderModel } from '@/bridge/app'
import type {
  CredentialMode,
  ModelInput,
  ProviderDraft,
  ProviderModelDraft,
} from '@/components/settings/provider-settings/types'
import { errorToText } from '@/utils/toast'

export type ProviderSaveDraftResult =
  | {
      ok: true
      request: SaveProviderRequest
    }
  | {
      ok: false
      message: string
    }

export function useProviderDraft(options: {
  rawProviders: Ref<BridgeProviderConfig[]>
  originalProviderId: Ref<string>
}) {
  const providerDraft = ref<ProviderDraft>(createEmptyProviderDraft())
  const credentialMode = ref<CredentialMode>('api-key')
  const credentialValue = ref('')
  const loadingDraft = ref(false)

  function loadProviderDraft(provider: BridgeProviderConfig) {
    loadingDraft.value = true
    providerDraft.value = draftFromProvider(provider)
    options.originalProviderId.value = provider.id
    resetCredentialDraft()
    void nextTick(() => {
      loadingDraft.value = false
    })
  }

  function startNewProviderDraft() {
    const draft = createEmptyProviderDraft()
    loadingDraft.value = true
    providerDraft.value = draft
    options.originalProviderId.value = ''
    resetCredentialDraft()
    void nextTick(() => {
      loadingDraft.value = false
    })
    return draft
  }

  function ensureDefaultModelId() {
    if (
      !providerDraft.value.models.some((model) => model.id === providerDraft.value.defaultModelId)
    ) {
      providerDraft.value.defaultModelId = providerDraft.value.models[0]?.id || ''
    }
  }

  function buildSaveRequest(): ProviderSaveDraftResult {
    const validation = validateDraft()
    if (validation) return { ok: false, message: validation }

    const parsedHeaders = parseStringRecord(providerDraft.value.headersText, 'Headers')
    if (!parsedHeaders.ok) return { ok: false, message: parsedHeaders.message }

    const parsedExtraBody = parseObject(providerDraft.value.extraBodyText, 'Extra Body')
    if (!parsedExtraBody.ok) return { ok: false, message: parsedExtraBody.message }

    const request: SaveProviderRequest = {
      provider: {
        id: providerDraft.value.id.trim(),
        name: providerDraft.value.name.trim(),
        type: providerDraft.value.type,
        api: providerDraft.value.api,
        baseUrl: providerDraft.value.baseUrl.trim(),
        enabled: providerDraft.value.enabled,
        credentialRef:
          providerDraft.value.credentialRef || `${providerDraft.value.id.trim()}:default`,
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

    if (
      providerDraft.value.compat.reasoningFormat !== 'none' ||
      providerDraft.value.compat.maxTokensField !== 'max_tokens' ||
      !providerDraft.value.compat.supportsSystemRole ||
      providerDraft.value.compat.supportsDeveloperRole ||
      providerDraft.value.compat.supportsJsonMode
    ) {
      request.provider.compat = { ...providerDraft.value.compat }
    }

    const credential = buildCredential()
    if (credential) {
      request.credential = credential
    }

    return { ok: true, request }
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

  function replaceModels(models: Array<BridgeProviderModel | ProviderModel>) {
    loadingDraft.value = true
    providerDraft.value.models = models.map(draftFromModel)
    ensureDefaultModelId()
    void nextTick(() => {
      loadingDraft.value = false
    })
  }

  function updateProviderType(value: ProviderType) {
    providerDraft.value.type = value
    providerDraft.value.api = apiFromType(value)
    if (value === 'ollama') {
      providerDraft.value.baseUrl ||= 'http://localhost:11434/v1'
      providerDraft.value.capabilities.listModels = true
    }
    if (value === 'openai-compatible') {
      providerDraft.value.baseUrl ||= 'https://api.openai.com/v1'
      providerDraft.value.capabilities.listModels = true
    }
  }

  function updateModelInput(
    model: ProviderModelDraft,
    input: ModelInput,
    checked: boolean | 'indeterminate'
  ) {
    const next = new Set(model.input)
    if (checked === true) {
      next.add(input)
    } else {
      next.delete(input)
    }

    if (!next.size) next.add('text')
    model.input = [...next]
  }

  function setOptionalNumber(
    model: ProviderModelDraft,
    key: 'contextWindow' | 'maxOutputTokens',
    value: string | number
  ) {
    const text = String(value).trim()
    if (!text) {
      model[key] = undefined
      return
    }

    const next = Number(text)
    model[key] = Number.isFinite(next) && next >= 0 ? Math.round(next) : undefined
  }

  function resetCredentialDraft() {
    credentialMode.value = 'api-key'
    credentialValue.value = ''
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
      if (modelIdBelongsToOtherProvider(model.id.trim()))
        return `模型 ID 已被其他 Provider 使用：${model.id.trim()}`
      modelIds.add(model.id.trim())
    }

    if (providerDraft.value.defaultModelId && !modelIds.has(providerDraft.value.defaultModelId)) {
      return '默认模型必须来自当前模型列表。'
    }

    return ''
  }

  function modelIdBelongsToOtherProvider(modelId: string) {
    return options.rawProviders.value.some(
      (provider) =>
        provider.id !== options.originalProviderId.value &&
        provider.models?.some((model) => model.id === modelId)
    )
  }

  return {
    providerDraft,
    credentialMode,
    credentialValue,
    loadingDraft,
    addModel,
    buildSaveRequest,
    ensureDefaultModelId,
    loadProviderDraft,
    removeModel,
    replaceModels,
    setOptionalNumber,
    startNewProviderDraft,
    updateModelInput,
    updateProviderType,
  }
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

function parseStringRecord(
  text: string,
  label: string
): { ok: true; value: Record<string, string> } | { ok: false; message: string } {
  const parsed = parseObject(text, label)
  if (!parsed.ok) return parsed
  if (Object.values(parsed.value).some((value) => typeof value !== 'string')) {
    return { ok: false, message: `${label} 的值必须都是字符串。` }
  }
  return { ok: true, value: parsed.value as Record<string, string> }
}

function parseObject(
  text: string,
  label: string
): { ok: true; value: Record<string, unknown> } | { ok: false; message: string } {
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
    maxTokensField:
      record.maxTokensField === 'max_completion_tokens' ? 'max_completion_tokens' : 'max_tokens',
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
  const input = value.filter(
    (item): item is ModelInput =>
      item === 'text' || item === 'image' || item === 'audio' || item === 'file'
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

function uniqueId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}`
}

function formatJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

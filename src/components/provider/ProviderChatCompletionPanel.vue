<template>
  <div class="provider-panel" :class="{ 'with-border': showBorder }">
    <aside class="provider-sidebar">
      <div class="provider-sidebar__header">
        <div>
          <p class="provider-panel__eyebrow">Provider</p>
          <h2>模型配置</h2>
        </div>
        <v-btn icon="mdi-plus" size="small" variant="tonal" color="primary" @click="createProvider" />
      </div>

      <v-text-field
        v-model="searchQuery"
        prepend-inner-icon="mdi-magnify"
        density="compact"
        variant="outlined"
        hide-details
        placeholder="搜索 provider 或模型"
        class="provider-search"
      />

      <div class="provider-list">
        <button
          v-for="provider in filteredProviders"
          :key="provider.id"
          type="button"
          class="provider-list-item"
          :class="{ active: selectedProviderId === provider.id, draft: provider.isDraft }"
          @click="selectProvider(provider)"
        >
          <span class="provider-list-item__name">
            {{ provider.name }}
            <span v-if="provider.isDraft" class="draft-pill">未保存</span>
          </span>
          <span class="provider-list-item__meta">
            {{ provider.models?.length || 0 }} models · {{ provider.enabled ? 'Enabled' : 'Disabled' }}
          </span>
        </button>

        <div v-if="!loading && !filteredProviders.length" class="provider-empty">
          暂无 provider
        </div>

        <div v-if="loading" class="provider-loading">
          <v-progress-circular indeterminate size="18" width="2" />
          <span>Loading providers</span>
        </div>
      </div>
    </aside>

    <main class="provider-editor">
      <div class="provider-editor__top">
        <div>
          <p class="provider-panel__eyebrow">Chat Completion</p>
          <h3>{{ isNewProvider ? '新建 Provider' : form.name || form.id }}</h3>
          <p v-if="isNewProvider" class="draft-hint">
            新 provider 还没有写入数据库。调整配置后点击保存，或取消草稿。
          </p>
        </div>
        <div class="provider-editor__actions">
          <v-btn
            v-if="isNewProvider"
            variant="text"
            prepend-icon="mdi-close"
            @click="cancelDraft"
          >
            取消草稿
          </v-btn>
          <v-btn
            variant="outlined"
            prepend-icon="mdi-refresh"
            :disabled="!persistenceAvailable || !form.id || isNewProvider"
            :loading="refreshing"
            @click="refreshModels"
          >
            刷新模型
          </v-btn>
          <v-btn
            variant="outlined"
            prepend-icon="mdi-connection"
            :disabled="!persistenceAvailable || !form.id || isNewProvider"
            :loading="testing"
            @click="testProvider"
          >
            测试
          </v-btn>
          <v-btn
            color="primary"
            prepend-icon="mdi-content-save"
            :disabled="!persistenceAvailable"
            :loading="saving"
            @click="saveProvider"
          >
            保存
          </v-btn>
        </div>
      </div>

      <v-alert
        v-if="!persistenceAvailable"
        class="bridge-warning"
        type="warning"
        variant="tonal"
        density="compact"
      >
        当前未连接 Electron 主进程，Provider 保存不可用。请在 Electron 窗口中操作。
      </v-alert>

      <section class="editor-section">
        <div class="section-heading">
          <v-icon size="18">mdi-server-network</v-icon>
          <span>连接</span>
        </div>

        <div class="form-grid">
          <v-text-field
            ref="providerIdInputRef"
            v-model.trim="form.id"
            label="Provider ID"
            variant="outlined"
            density="comfortable"
            :disabled="!isNewProvider"
          />
          <v-text-field v-model.trim="form.name" label="名称" variant="outlined" density="comfortable" />
          <v-select
            v-model="form.api"
            :items="apiOptions"
            label="API"
            variant="outlined"
            density="comfortable"
            hide-details
          />
          <v-switch v-model="form.enabled" label="启用" color="primary" hide-details inset />
          <v-text-field v-model.trim="form.baseUrl" class="span-2" label="Base URL" variant="outlined" density="comfortable" />
        </div>
      </section>

      <section class="editor-section">
        <div class="section-heading">
          <v-icon size="18">mdi-key-variant</v-icon>
          <span>鉴权</span>
        </div>

        <div class="form-grid">
          <v-select
            v-model="credentialType"
            :items="credentialTypeOptions"
            label="凭据类型"
            variant="outlined"
            density="comfortable"
            hide-details
          />
          <v-text-field v-model.trim="credentialLabel" label="凭据标签" variant="outlined" density="comfortable" />
          <v-text-field
            v-if="credentialType === 'env'"
            v-model.trim="credentialEnvVar"
            label="环境变量"
            variant="outlined"
            density="comfortable"
            placeholder="OPENAI_API_KEY"
          />
          <v-text-field
            v-else
            v-model="credentialValue"
            label="API Key / Token"
            variant="outlined"
            density="comfortable"
            type="password"
            placeholder="留空则不更新已保存凭据"
          />
        </div>
      </section>

      <section class="editor-section">
        <div class="section-heading">
          <v-icon size="18">mdi-toggle-switch-outline</v-icon>
          <span>能力</span>
        </div>

        <div class="capability-row">
          <v-checkbox v-model="form.capabilities.listModels" label="列出模型" hide-details />
          <v-checkbox v-model="form.capabilities.streaming" label="流式输出" hide-details />
          <v-checkbox v-model="form.capabilities.vision" label="图像输入" hide-details />
          <v-checkbox v-model="form.capabilities.tools" label="工具调用" hide-details />
        </div>
      </section>

      <section class="editor-section">
        <div class="section-heading">
          <v-icon size="18">mdi-cube-outline</v-icon>
          <span>模型</span>
          <v-spacer />
          <v-btn size="small" variant="tonal" prepend-icon="mdi-plus" @click="addModel">
            添加模型
          </v-btn>
        </div>

        <div class="model-list">
          <article v-for="(model, index) in form.models" :key="model.localKey" class="model-card">
            <div class="model-card__header">
              <v-radio
                :model-value="form.defaultModelId"
                :value="model.id"
                hide-details
                density="compact"
                @update:model-value="form.defaultModelId = String($event)"
              />
              <v-text-field v-model.trim="model.id" label="Model ID" variant="outlined" density="compact" hide-details />
              <v-switch v-model="model.enabled" label="启用" density="compact" color="primary" hide-details />
              <v-btn icon="mdi-delete-outline" size="small" variant="text" color="error" @click="removeModel(index)" />
            </div>

            <div class="model-card__grid">
              <v-text-field v-model.trim="model.name" label="显示名称" variant="outlined" density="compact" hide-details />
              <v-text-field v-model.trim="model.remoteId" label="Remote ID" variant="outlined" density="compact" hide-details />
              <v-text-field v-model.number="model.contextWindow" label="上下文窗口" type="number" min="0" variant="outlined" density="compact" hide-details />
              <v-text-field v-model.number="model.maxOutputTokens" label="最大输出" type="number" min="0" variant="outlined" density="compact" hide-details />
            </div>

            <div class="model-flags">
              <v-checkbox v-model="model.inputText" label="Text" hide-details density="compact" />
              <v-checkbox v-model="model.inputImage" label="Image" hide-details density="compact" />
              <v-checkbox v-model="model.supportsStreaming" label="Streaming" hide-details density="compact" />
              <v-checkbox v-model="model.supportsTools" label="Tools" hide-details density="compact" />
              <v-checkbox v-model="model.supportsReasoning" label="Reasoning" hide-details density="compact" />
            </div>
          </article>

          <div v-if="!form.models.length" class="provider-empty model-empty">
            至少添加一个模型，或使用“刷新模型”从远端读取。
          </div>
        </div>
      </section>

      <section class="editor-section">
        <div class="section-heading">
          <v-icon size="18">mdi-code-json</v-icon>
          <span>高级请求参数</span>
        </div>

        <div class="form-grid">
          <v-textarea
            v-model="headersJson"
            label="Headers JSON"
            variant="outlined"
            rows="3"
            auto-grow
            placeholder='{"X-Custom": "value"}'
          />
          <v-textarea
            v-model="extraBodyJson"
            label="Extra Body JSON"
            variant="outlined"
            rows="3"
            auto-grow
            placeholder='{"temperature": 0.7}'
          />
        </div>
      </section>

      <div class="danger-row">
        <v-btn
          variant="text"
          color="error"
          prepend-icon="mdi-delete-outline"
          :disabled="!persistenceAvailable || isNewProvider || !form.id"
          @click="deleteProvider"
        >
          删除 Provider
        </v-btn>
      </div>
    </main>

    <v-snackbar v-model="notice.show" :color="notice.color" :timeout="2800" location="top">
      {{ notice.message }}
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useProviderStore } from '@/stores/provider'
import type { ProviderApi, ProviderConfig, ProviderModel, ProviderCredential } from '@shared/types/provider'

const props = defineProps<{ showBorder?: boolean }>()

interface EditableModel {
  localKey: string
  id: string
  name: string
  remoteId: string
  enabled: boolean
  inputText: boolean
  inputImage: boolean
  supportsStreaming: boolean
  supportsTools: boolean
  supportsReasoning: boolean
  contextWindow?: number
  maxOutputTokens?: number
}

interface ProviderForm {
  id: string
  name: string
  api: ProviderApi
  baseUrl: string
  enabled: boolean
  credentialRef?: string
  defaultModelId: string
  capabilities: {
    listModels: boolean
    streaming: boolean
    vision: boolean
    tools: boolean
  }
  models: EditableModel[]
  createdAt?: number
}

interface ProviderListItem extends ProviderConfig {
  isDraft?: boolean
}

const providerStore = useProviderStore()
const { rawProviders, loading, saving, persistenceAvailable } = storeToRefs(providerStore)
const searchQuery = ref('')
const selectedProviderId = ref('')
const newProviderSequence = ref(1)
const providerIdInputRef = ref<{ focus?: () => void } | null>(null)
const refreshing = ref(false)
const testing = ref(false)
const notice = reactive({
  show: false,
  message: '',
  color: 'success',
})
const credentialType = ref<ProviderCredential['type']>('api-key')
const credentialLabel = ref('Default')
const credentialValue = ref('')
const credentialEnvVar = ref('')
const headersJson = ref('')
const extraBodyJson = ref('')

const apiOptions: Array<{ title: string; value: ProviderApi }> = [
  { title: 'OpenAI Chat Completions', value: 'openai-chat-completions' },
  { title: 'OpenAI Responses (未实现)', value: 'openai-responses' },
  { title: 'Ollama (未实现)', value: 'ollama' },
  { title: 'OmniInfer (未实现)', value: 'omniinfer' },
]

const credentialTypeOptions: Array<{ title: string; value: ProviderCredential['type'] }> = [
  { title: 'API Key', value: 'api-key' },
  { title: 'Bearer Token', value: 'bearer-token' },
  { title: '环境变量', value: 'env' },
]

const form = reactive<ProviderForm>(blankForm())

const draftProvider = computed<ProviderListItem | null>(() => {
  if (!isNewProvider.value || !form.id) {
    return null
  }

  return {
    id: selectedProviderId.value,
    name: form.name.trim() || form.id,
    api: form.api,
    type: providerTypeFromApi(form.api),
    baseUrl: form.baseUrl,
    enabled: form.enabled,
    defaultModelId: form.defaultModelId,
    capabilities: { ...form.capabilities },
    models: form.models.map(editableToModel),
    isDraft: true,
  }
})

const displayedProviders = computed<ProviderListItem[]>(() => {
  const saved = rawProviders.value.map((provider) => ({ ...provider, isDraft: false }))
  return draftProvider.value ? [draftProvider.value, ...saved] : saved
})

const filteredProviders = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) {
    return displayedProviders.value
  }

  return displayedProviders.value.filter((provider) =>
    [
      provider.id,
      provider.name,
      provider.baseUrl,
      ...(provider.models ?? []).flatMap((model) => [model.id, model.name, model.remoteId]),
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query)),
  )
})

const isNewProvider = computed(() => selectedProviderId.value.startsWith('__draft__:'))

function blankForm(): ProviderForm {
  return {
    id: '',
    name: '',
    api: 'openai-chat-completions',
    baseUrl: 'https://api.openai.com/v1',
    enabled: true,
    credentialRef: undefined,
    defaultModelId: '',
    capabilities: {
      listModels: true,
      streaming: true,
      vision: true,
      tools: true,
    },
    models: [],
  }
}

function createProvider() {
  const providerId = uniqueProviderId(newProviderSequence.value)
  newProviderSequence.value += 1
  selectedProviderId.value = `__draft__:${providerId}`
  assignForm({
    ...blankForm(),
    id: providerId,
    name: 'OpenAI Compatible',
    models: [
      modelToEditable({
        id: 'gpt-4o-mini',
        name: 'GPT-4o mini',
        remoteId: 'gpt-4o-mini',
        enabled: true,
        input: ['text', 'image'],
        supportsStreaming: true,
        supportsTools: true,
        supportsReasoning: false,
        contextWindow: 128000,
        maxOutputTokens: 16384,
      }),
    ],
    defaultModelId: 'gpt-4o-mini',
  })
  credentialType.value = 'api-key'
  credentialLabel.value = 'Default'
  credentialValue.value = ''
  credentialEnvVar.value = ''
  headersJson.value = ''
  extraBodyJson.value = ''
  showNotice(
    persistenceAvailable.value
      ? '已创建未保存草稿，保存后写入数据库。'
      : '当前未连接 Electron 主进程，Provider 保存不可用。',
    persistenceAvailable.value ? 'success' : 'warning',
  )
  void focusProviderIdInput()
}

function selectProvider(provider: ProviderListItem) {
  if (provider.isDraft) {
    void focusProviderIdInput()
    return
  }

  selectedProviderId.value = provider.id
  assignForm({
    id: provider.id,
    name: provider.name,
    api: provider.api ?? 'openai-chat-completions',
    baseUrl: provider.baseUrl,
    enabled: provider.enabled !== false,
    credentialRef: provider.credentialRef,
    defaultModelId: provider.defaultModelId ?? provider.models?.[0]?.id ?? '',
    capabilities: {
      listModels: provider.capabilities?.listModels ?? true,
      streaming: provider.capabilities?.streaming ?? true,
      vision: provider.capabilities?.vision ?? false,
      tools: provider.capabilities?.tools ?? false,
    },
    models: (provider.models ?? []).map(modelToEditable),
    createdAt: provider.createdAt,
  })
  credentialType.value = provider.credentialRef?.includes(':env') ? 'env' : 'api-key'
  credentialLabel.value = 'Default'
  credentialValue.value = ''
  credentialEnvVar.value = ''
  headersJson.value = stringifyJson(provider.headers)
  extraBodyJson.value = stringifyJson(provider.extraBody)
}

function cancelDraft() {
  const next = rawProviders.value[0]
  if (next) {
    selectProvider(next)
    return
  }

  selectedProviderId.value = ''
  assignForm(blankForm())
}

function assignForm(next: ProviderForm) {
  form.id = next.id
  form.name = next.name
  form.api = next.api
  form.baseUrl = next.baseUrl
  form.enabled = next.enabled
  form.credentialRef = next.credentialRef
  form.defaultModelId = next.defaultModelId
  form.capabilities = { ...next.capabilities }
  form.models = next.models.map((model) => ({ ...model }))
  form.createdAt = next.createdAt
}

function modelToEditable(model: Partial<ProviderModel>): EditableModel {
  const input = model.input ?? ['text']
  return {
    localKey: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    id: model.id ?? '',
    name: model.name ?? model.id ?? '',
    remoteId: model.remoteId ?? model.id ?? '',
    enabled: model.enabled !== false,
    inputText: input.includes('text'),
    inputImage: input.includes('image'),
    supportsStreaming: model.supportsStreaming !== false,
    supportsTools: Boolean(model.supportsTools),
    supportsReasoning: Boolean(model.supportsReasoning),
    contextWindow: model.contextWindow,
    maxOutputTokens: model.maxOutputTokens,
  }
}

function editableToModel(model: EditableModel): ProviderModel {
  const input: ProviderModel['input'] = []
  if (model.inputText) input.push('text')
  if (model.inputImage) input.push('image')

  return {
    id: model.id.trim(),
    providerId: form.id.trim(),
    name: model.name.trim() || model.id.trim(),
    remoteId: model.remoteId.trim() || model.id.trim(),
    enabled: model.enabled,
    input: input.length ? input : ['text'],
    supportsStreaming: model.supportsStreaming,
    supportsTools: model.supportsTools,
    supportsReasoning: model.supportsReasoning,
    contextWindow: normalizedNumber(model.contextWindow),
    maxOutputTokens: normalizedNumber(model.maxOutputTokens),
  }
}

function addModel() {
  const id = nextModelId()
  form.models.push(modelToEditable({
    id,
    name: id,
    remoteId: id,
    enabled: true,
    input: ['text'],
    supportsStreaming: true,
  }))
  if (!form.defaultModelId) {
    form.defaultModelId = id
  }
}

function removeModel(index: number) {
  const removed = form.models[index]
  form.models.splice(index, 1)
  if (removed?.id === form.defaultModelId) {
    form.defaultModelId = form.models[0]?.id ?? ''
  }
}

async function saveProvider() {
  try {
    const providerId = form.id.trim()
    if (!providerId) {
      throw new Error('Provider ID is required.')
    }

    const models = form.models.map(editableToModel).filter((model) => model.id)
    if (!models.length) {
      throw new Error('At least one model is required.')
    }

    const headers = parseJsonObject(headersJson.value, 'Headers JSON')
    const extraBody = parseJsonObject(extraBodyJson.value, 'Extra Body JSON')
    const defaultModelId = models.some((model) => model.id === form.defaultModelId)
      ? form.defaultModelId
      : models[0].id

    const credential =
      credentialType.value === 'env'
        ? credentialEnvVar.value.trim()
          ? {
              type: credentialType.value,
              label: credentialLabel.value.trim() || 'Default',
              envVar: credentialEnvVar.value.trim(),
            }
          : undefined
        : credentialValue.value
          ? {
              type: credentialType.value,
              label: credentialLabel.value.trim() || 'Default',
              value: credentialValue.value,
            }
          : undefined

    const saved = await providerStore.saveProvider({
      provider: {
        id: providerId,
        name: form.name.trim() || providerId,
        api: form.api,
        type: providerTypeFromApi(form.api),
        baseUrl: form.baseUrl.trim(),
        enabled: form.enabled,
        credentialRef: credential ? `${providerId}:default` : form.credentialRef,
        defaultModelId,
        capabilities: { ...form.capabilities },
        headers,
        extraBody,
        models,
        createdAt: form.createdAt,
      },
      credential,
    })

    if (saved) {
      selectProvider(saved)
      showNotice('Provider 已保存。')
    }
  } catch (error) {
    showNotice(error instanceof Error ? error.message : String(error), 'error')
  }
}

async function refreshModels() {
  if (!persistenceAvailable.value || !form.id || isNewProvider.value) return
  refreshing.value = true
  try {
    const models = await providerStore.refreshModels(form.id)
    const refreshed = rawProviders.value.find((provider) => provider.id === form.id)
    if (refreshed) {
      selectProvider(refreshed)
    } else if (Array.isArray(models)) {
      form.models = models.map(modelToEditable)
    }
    showNotice('模型列表已刷新。')
  } catch (error) {
    showNotice(error instanceof Error ? error.message : String(error), 'error')
  } finally {
    refreshing.value = false
  }
}

async function testProvider() {
  if (!persistenceAvailable.value || !form.id || isNewProvider.value) return
  testing.value = true
  try {
    const result = await providerStore.testProvider(form.id, form.defaultModelId || undefined)
    if (result?.ok === false) {
      throw new Error(result.error?.message || 'Provider test failed.')
    }
    showNotice('Provider 测试通过。')
  } catch (error) {
    showNotice(error instanceof Error ? error.message : String(error), 'error')
  } finally {
    testing.value = false
  }
}

async function deleteProvider() {
  if (!persistenceAvailable.value || !form.id || isNewProvider.value) return
  try {
    await providerStore.deleteProvider(form.id)
    showNotice('Provider 已删除。')
    const next = rawProviders.value[0]
    if (next) {
      selectProvider(next)
    } else {
      createProvider()
    }
  } catch (error) {
    showNotice(error instanceof Error ? error.message : String(error), 'error')
  }
}

function showNotice(message: string, color = 'success') {
  notice.message = message
  notice.color = color
  notice.show = true
}

async function focusProviderIdInput() {
  await nextTick()
  providerIdInputRef.value?.focus?.()
}

function uniqueProviderId(startIndex = 1) {
  const base = 'openai-compatible'
  const usedIds = new Set(rawProviders.value.map((provider) => provider.id))

  if (startIndex <= 1 && !usedIds.has(base)) {
    return base
  }

  let index = Math.max(2, startIndex)
  while (usedIds.has(`${base}-${index}`)) {
    index += 1
  }
  return `${base}-${index}`
}

function nextModelId() {
  let index = form.models.length + 1
  let id = `model-${index}`
  while (form.models.some((model) => model.id === id)) {
    index += 1
    id = `model-${index}`
  }
  return id
}

function parseJsonObject(value: string, label: string): Record<string, unknown> | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const parsed = JSON.parse(trimmed)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`)
  }
  return parsed as Record<string, unknown>
}

function stringifyJson(value: unknown) {
  return value && typeof value === 'object' ? JSON.stringify(value, null, 2) : ''
}

function normalizedNumber(value?: number) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

function providerTypeFromApi(api: ProviderApi): ProviderConfig['type'] {
  if (api === 'ollama') return 'ollama'
  if (api === 'omniinfer') return 'omniinfer'
  return 'openai-compatible'
}

onMounted(async () => {
  await providerStore.loadProviders()
  if (rawProviders.value.length) {
    selectProvider(rawProviders.value[0])
  } else {
    createProvider()
  }
})
</script>

<style scoped>
.provider-panel {
  display: grid;
  grid-template-columns: minmax(260px, 320px) minmax(0, 1fr);
  width: 100%;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  color: rgb(var(--v-theme-on-surface));
  background: rgb(var(--v-theme-background));
}

.provider-panel.with-border {
  border: 1px solid rgba(var(--v-border-color), 0.16);
  border-radius: 8px;
}

.provider-sidebar {
  min-height: 0;
  overflow: hidden;
  border-right: 1px solid rgba(var(--v-border-color), 0.16);
  background: rgba(var(--v-theme-on-surface), 0.025);
  display: flex;
  flex-direction: column;
  padding: 18px;
}

.provider-sidebar__header,
.provider-editor__top,
.section-heading,
.model-card__header,
.model-flags,
.danger-row {
  display: flex;
  align-items: center;
}

.provider-sidebar__header,
.provider-editor__top {
  justify-content: space-between;
  gap: 16px;
}

.provider-panel__eyebrow {
  margin: 0 0 5px;
  color: rgba(var(--v-theme-primary), 0.92);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h2,
h3 {
  margin: 0;
  font-weight: 750;
}

h2 {
  font-size: 22px;
}

h3 {
  font-size: 24px;
}

.provider-search {
  margin: 18px 0 12px;
}

.provider-list {
  min-height: 0;
  overflow-y: auto;
}

.provider-list-item {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 58px;
  padding: 10px 12px;
  border: 0;
  border-radius: 8px;
  margin-bottom: 6px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.provider-list-item:hover,
.provider-list-item.active {
  background: rgba(var(--v-theme-on-surface), 0.06);
}

.provider-list-item.draft {
  border: 1px dashed rgba(var(--v-theme-primary), 0.42);
  background: rgba(var(--v-theme-primary), 0.055);
}

.provider-list-item__name,
.provider-list-item__meta {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.provider-list-item__name {
  font-size: 14px;
  font-weight: 650;
}

.draft-pill {
  display: inline-flex;
  align-items: center;
  height: 18px;
  margin-left: 8px;
  padding: 0 7px;
  border-radius: 999px;
  background: rgba(var(--v-theme-primary), 0.12);
  color: rgb(var(--v-theme-primary));
  font-size: 11px;
  font-weight: 700;
  vertical-align: 1px;
}

.draft-hint {
  margin: 7px 0 0;
  color: rgba(var(--v-theme-on-surface), 0.62);
  font-size: 13px;
}

.provider-list-item__meta,
.provider-empty,
.provider-loading {
  color: rgba(var(--v-theme-on-surface), 0.58);
  font-size: 12px;
}

.provider-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
}

.provider-editor {
  min-height: 0;
  overflow-y: auto;
  padding: 24px;
}

.provider-editor__top {
  margin-bottom: 20px;
}

.bridge-warning {
  margin-bottom: 18px;
}

.provider-editor__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.editor-section {
  padding: 18px 0;
  border-top: 1px solid rgba(var(--v-border-color), 0.14);
}

.section-heading {
  gap: 8px;
  margin-bottom: 14px;
  font-size: 13px;
  font-weight: 750;
}

.form-grid,
.model-card__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.span-2 {
  grid-column: 1 / -1;
}

.capability-row,
.model-flags {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px 18px;
}

.model-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.model-card {
  border: 1px solid rgba(var(--v-border-color), 0.16);
  border-radius: 8px;
  padding: 12px;
  background: rgba(var(--v-theme-surface), 0.72);
}

.model-card__header {
  gap: 10px;
  margin-bottom: 12px;
}

.model-card__header :deep(.v-input) {
  min-width: 0;
}

.model-card__header :deep(.v-radio) {
  flex: 0 0 auto;
}

.model-flags {
  margin-top: 10px;
}

.model-empty {
  padding: 14px 4px;
}

.danger-row {
  justify-content: flex-end;
  border-top: 1px solid rgba(var(--v-border-color), 0.14);
  padding-top: 16px;
}

@media (max-width: 960px) {
  .provider-panel {
    grid-template-columns: 1fr;
    overflow-y: auto;
  }

  .provider-sidebar {
    border-right: 0;
    border-bottom: 1px solid rgba(var(--v-border-color), 0.16);
    max-height: 340px;
  }

  .provider-editor {
    overflow: visible;
  }
}

@media (max-width: 680px) {
  .provider-editor {
    padding: 18px;
  }

  .provider-editor__top,
  .provider-editor__actions {
    align-items: stretch;
    flex-direction: column;
  }

  .form-grid,
  .model-card__grid {
    grid-template-columns: 1fr;
  }

  .model-card__header {
    align-items: stretch;
    flex-wrap: wrap;
  }
}
</style>

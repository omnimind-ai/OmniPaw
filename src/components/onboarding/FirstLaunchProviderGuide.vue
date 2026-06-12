<script setup lang="ts">
import type {
  ProviderCapabilities,
  ProviderCompat,
  ProviderModel,
  SaveProviderRequest,
} from '@shared/types/provider'
import { CloudIcon, KeyRoundIcon, LaptopIcon, Loader2Icon, SparklesIcon } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import { type Component, computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import type { BridgeProviderConfig, BridgeProviderPreset } from '@/bridge/app'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useOmniInferStore } from '@/stores/omniinfer'
import { useProviderStore } from '@/stores/provider'
import { useSettingsStore } from '@/stores/settings'
import { errorToText, useToast } from '@/utils/toast'

type ProviderChoiceId = 'omniinfer-local' | 'ollama' | 'openai-compatible'

interface ProviderChoice {
  id: ProviderChoiceId
  title: string
  badge: string
  badgeVariant: 'secondary' | 'outline'
  description: string
  icon: Component
  disabled?: boolean
}

const providerStore = useProviderStore()
const settingsStore = useSettingsStore()
const omniInferStore = useOmniInferStore()
const router = useRouter()
const toast = useToast()
const { rawProviders, providerPresets, loading, presetsLoading } = storeToRefs(providerStore)
const { processState: omniInferProcessState } = storeToRefs(omniInferStore)

const selectedChoiceId = ref<ProviderChoiceId>('ollama')
const submitting = ref(false)
const cloudBaseUrl = ref('https://api.openai.com/v1')
const cloudApiKey = ref('')
const cloudModelId = ref('gpt-4o-mini')

const omniInferBadge = computed((): { label: string; disabled: boolean; description: string } => {
  switch (omniInferProcessState.value) {
    case 'not_bundled':
      return {
        label: '未内置',
        disabled: true,
        description: '当前安装包未内置 OmniInfer；可在"本地模型"设置中查看放置位置',
      }
    case 'starting':
      return { label: '启动中', disabled: true, description: 'OmniInfer 正在启动，请稍候' }
    case 'running':
      return { label: '本地', disabled: false, description: '使用本地 OmniInfer 服务运行小模型' }
    case 'unhealthy':
      return {
        label: '不健康',
        disabled: false,
        description: 'OmniInfer 已启动但未就绪，可在"本地模型"页查看日志',
      }
    case 'crashed':
      return { label: '已崩溃', disabled: false, description: 'OmniInfer 进程已退出，可尝试重启' }
    default:
      return { label: '已停止', disabled: false, description: 'OmniInfer 服务尚未启动' }
  }
})

const choices = computed((): ProviderChoice[] => [
  {
    id: 'omniinfer-local',
    title: 'OmniInfer',
    badge: omniInferBadge.value.label,
    badgeVariant: 'secondary',
    description: omniInferBadge.value.description,
    icon: LaptopIcon,
    disabled: omniInferBadge.value.disabled,
  },
  {
    id: 'ollama',
    title: 'Ollama',
    badge: '本地',
    badgeVariant: 'secondary',
    description: '使用这台 Mac 上的 Ollama 模型',
    icon: SparklesIcon,
  },
  {
    id: 'openai-compatible',
    title: 'Cloud API',
    badge: 'API Key',
    badgeVariant: 'outline',
    description: '使用 OpenAI-compatible API keys',
    icon: KeyRoundIcon,
  },
])

const selectedChoice = computed(
  () => choices.value.find((choice) => choice.id === selectedChoiceId.value) ?? choices.value[0]
)
const busy = computed(() => submitting.value || loading.value || presetsLoading.value)

onMounted(async () => {
  if (omniInferStore.available) {
    omniInferStore.subscribe()
    await omniInferStore.refreshStatus().catch(() => {})
  }
  await Promise.allSettled([providerStore.loadProviders(), providerStore.loadProviderPresets()])
})

async function continueSetup() {
  if (busy.value) return
  submitting.value = true
  try {
    const choice = selectedChoice.value
    if (choice.disabled) {
      return
    }

    const preset = providerPresets.value.find((item) => item.id === choice.id)
    if (!preset) {
      throw new Error(`Provider preset not found: ${choice.id}`)
    }

    if (choice.id === 'openai-compatible') {
      await saveCloudProvider(preset)
    } else {
      const existing = findExistingProvider(preset)
      const provider = existing ?? (await providerStore.createProviderFromPreset(choice.id))
      if (choice.id === 'ollama' && provider?.id) {
        await providerStore.refreshModels(provider.id)
      }

      await providerStore.loadProviders()
    }

    await markInitializationCompleted()
    toast.success('模型服务已配置。')
  } catch (error) {
    toast.error(errorToText(error, '模型服务配置失败。'))
  } finally {
    submitting.value = false
  }
}

async function openAdvancedSettings() {
  try {
    await markInitializationCompleted()
  } catch (error) {
    toast.error(errorToText(error, '初始化状态保存失败。'))
  }
  await router.push({ name: 'settings', query: { tab: 'providers' } })
}

function findExistingProvider(preset: BridgeProviderPreset) {
  return rawProviders.value.find(
    (provider) => provider.id === preset.id || provider.type === preset.type
  )
}

async function saveCloudProvider(preset: BridgeProviderPreset) {
  const baseUrl = cloudBaseUrl.value.trim()
  const apiKey = cloudApiKey.value.trim()
  const modelId = cloudModelId.value.trim()

  if (!baseUrl) {
    throw new Error('Cloud API Base URL 不能为空。')
  }
  if (!apiKey) {
    throw new Error('Cloud API Key 不能为空。')
  }
  if (!modelId) {
    throw new Error('Cloud API Model ID 不能为空。')
  }

  const existing = findExistingProvider(preset)
  const providerId = existing?.id || preset.id
  const models = mergeCloudModels(existing?.models ?? [], modelId)
  const capabilities = normalizeCapabilities(preset, existing)
  const compat = normalizeCompat(preset, existing)
  const request: SaveProviderRequest = {
    provider: {
      id: providerId,
      name: existing?.name || preset.name || 'OpenAI Compatible',
      type: 'openai-compatible',
      api: 'openai-chat-completions',
      baseUrl,
      enabled: true,
      credentialRef:
        stringValue(existing?.credentialRef) || preset.credentialRef || `${providerId}:default`,
      authHeader: stringValue(existing?.authHeader) || preset.authHeader || 'Authorization',
      headers: mergeStringRecords(preset.headers, existing?.headers),
      extraBody: mergeObjectRecords(preset.extraBody, existing?.extraBody),
      defaultModelId: modelId,
      capabilities,
      compat,
      models,
    },
    credential: {
      type: 'api-key',
      label: 'Default API Key',
      value: apiKey,
    },
  }

  await providerStore.saveProvider(request)
  await providerStore.setDefaultModelKey(`${providerId}:${modelId}`)
  await providerStore.loadProviders()
}

async function markInitializationCompleted() {
  await settingsStore.load()
  settingsStore.updateAppSetting('initialized', true)
  await settingsStore.save()
}

function mergeCloudModels(models: ProviderModel[], modelId: string): ProviderModel[] {
  const normalizedModel: ProviderModel = {
    id: modelId,
    name: modelId,
    remoteId: modelId,
    enabled: true,
    input: ['text', 'image'],
    supportsStreaming: true,
    supportsTools: true,
    supportsReasoning: false,
  }

  if (!models.some((model) => model.id === modelId)) {
    return [...models, normalizedModel]
  }

  return models.map((model) =>
    model.id === modelId
      ? {
          ...model,
          name: model.name || modelId,
          remoteId: model.remoteId || modelId,
          enabled: true,
          input: model.input?.length ? model.input : normalizedModel.input,
          supportsStreaming: model.supportsStreaming ?? true,
          supportsTools: model.supportsTools ?? true,
        }
      : model
  )
}

function choiceButtonClass(choice: ProviderChoice) {
  return cn(
    'group flex min-h-[86px] w-full items-start gap-3 rounded-md border bg-background px-4 py-3 text-left transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50',
    selectedChoiceId.value === choice.id
      ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
      : 'border-border'
  )
}

function choiceIndicatorClass(choice: ProviderChoice) {
  return cn(
    'mt-1 flex size-4 shrink-0 items-center justify-center rounded-full border',
    selectedChoiceId.value === choice.id
      ? 'border-primary bg-primary'
      : 'border-muted-foreground/40 bg-background'
  )
}

function choiceIconClass(choice: ProviderChoice) {
  return cn(
    'flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground [&>svg]:size-5',
    selectedChoiceId.value === choice.id && 'bg-primary/10 text-primary'
  )
}

function normalizeCapabilities(
  preset: BridgeProviderPreset,
  existing?: BridgeProviderConfig
): ProviderCapabilities {
  return {
    listModels: booleanValue(
      [preset.capabilities?.listModels, existing?.capabilities?.listModels],
      true
    ),
    streaming: booleanValue(
      [preset.capabilities?.streaming, existing?.capabilities?.streaming],
      true
    ),
    tools: booleanValue([preset.capabilities?.tools, existing?.capabilities?.tools], true),
    vision: booleanValue([preset.capabilities?.vision, existing?.capabilities?.vision], true),
  }
}

function normalizeCompat(
  preset: BridgeProviderPreset,
  existing?: BridgeProviderConfig
): ProviderCompat {
  return {
    maxTokensField: maxTokensFieldValue(
      preset.compat?.maxTokensField,
      existing?.compat?.maxTokensField
    ),
    supportsSystemRole: booleanValue(
      [preset.compat?.supportsSystemRole, existing?.compat?.supportsSystemRole],
      true
    ),
    supportsDeveloperRole: booleanValue(
      [preset.compat?.supportsDeveloperRole, existing?.compat?.supportsDeveloperRole],
      false
    ),
    supportsJsonMode: booleanValue(
      [preset.compat?.supportsJsonMode, existing?.compat?.supportsJsonMode],
      true
    ),
    reasoningFormat: reasoningFormatValue(
      preset.compat?.reasoningFormat,
      existing?.compat?.reasoningFormat
    ),
  }
}

function booleanValue(values: unknown[], fallback: boolean): boolean {
  const value = values.find((item): item is boolean => typeof item === 'boolean')
  return value ?? fallback
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function maxTokensFieldValue(...values: unknown[]): ProviderCompat['maxTokensField'] {
  return (
    values.find(
      (value): value is NonNullable<ProviderCompat['maxTokensField']> =>
        value === 'max_tokens' || value === 'max_completion_tokens'
    ) ?? 'max_tokens'
  )
}

function reasoningFormatValue(...values: unknown[]): ProviderCompat['reasoningFormat'] {
  return (
    values.find(
      (value): value is NonNullable<ProviderCompat['reasoningFormat']> =>
        value === 'none' || value === 'openai' || value === 'deepseek' || value === 'qwen'
    ) ?? 'none'
  )
}

function mergeStringRecords(...values: unknown[]): Record<string, string> {
  return Object.assign({}, ...values.map(toStringRecord))
}

function toStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  )
}

function mergeObjectRecords(...values: unknown[]): Record<string, unknown> {
  return Object.assign({}, ...values.map(toObjectRecord))
}

function toObjectRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return { ...value }
}
</script>

<template>
  <div
    class="flex min-h-full flex-1 items-center justify-center overflow-auto bg-muted/40 px-4 py-6 md:px-6"
  >
    <Card class="w-full max-w-4xl rounded-md py-0">
      <CardHeader class="border-b px-5 py-4 md:px-6">
        <div class="flex flex-col gap-2">
          <Badge
            variant="outline"
            class="w-fit"
          >
            <CloudIcon data-icon="inline-start" />
            首次启动
          </Badge>
          <div class="flex flex-col gap-1">
            <h1 class="text-xl font-semibold tracking-normal md:text-2xl">
              选择模型服务
            </h1>
            <p class="max-w-2xl text-sm leading-6 text-muted-foreground">
              配置 Agent 使用的 Provider。稍后可以在设置中继续调整模型、密钥和高级兼容选项。
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent class="flex flex-col gap-4 p-5 md:p-6">
        <div class="flex flex-col gap-3">
          <button
            v-for="choice in choices"
            :key="choice.id"
            type="button"
            :disabled="choice.disabled"
            :aria-pressed="selectedChoiceId === choice.id"
            :class="choiceButtonClass(choice)"
            @click="!choice.disabled && (selectedChoiceId = choice.id)"
          >
            <span :class="choiceIndicatorClass(choice)">
              <span
                v-if="selectedChoiceId === choice.id"
                class="size-1.5 rounded-full bg-primary-foreground"
              />
            </span>

            <span :class="choiceIconClass(choice)">
              <component
                :is="choice.icon"
                aria-hidden="true"
              />
            </span>

            <span class="flex min-w-0 flex-1 flex-col gap-1">
              <span class="flex min-w-0 flex-wrap items-center gap-2">
                <span class="truncate text-sm font-medium">{{ choice.title }}</span>
                <Badge :variant="choice.badgeVariant">
                  {{ choice.badge }}
                </Badge>
              </span>
              <span class="text-sm leading-6 text-muted-foreground">
                {{ choice.description }}
              </span>
            </span>
          </button>
        </div>

        <div
          v-if="selectedChoiceId === 'openai-compatible'"
          class="rounded-md border bg-muted/30 p-4"
        >
          <FieldGroup class="gap-3">
            <div class="grid gap-3 md:grid-cols-[1.2fr_1fr]">
              <Field>
                <FieldLabel for="onboarding-cloud-base-url">Base URL</FieldLabel>
                <Input
                  id="onboarding-cloud-base-url"
                  v-model="cloudBaseUrl"
                  placeholder="https://api.openai.com/v1"
                />
              </Field>

              <Field>
                <FieldLabel for="onboarding-cloud-model-id">Model ID</FieldLabel>
                <Input
                  id="onboarding-cloud-model-id"
                  v-model="cloudModelId"
                  placeholder="gpt-4o-mini"
                />
              </Field>
            </div>

            <Field>
              <FieldLabel for="onboarding-cloud-api-key">API Key</FieldLabel>
              <Input
                id="onboarding-cloud-api-key"
                v-model="cloudApiKey"
                type="password"
                placeholder="sk-..."
              />
            </Field>
          </FieldGroup>
        </div>

        <div
          class="flex items-center justify-between gap-3 border-t pt-4"
        >
          <Button
            type="button"
            variant="outline"
            size="lg"
            class="min-w-0 flex-1 sm:min-w-32 sm:flex-none"
            @click="openAdvancedSettings"
          >
            进入高级设置
          </Button>

          <Button
            type="button"
            size="lg"
            class="min-w-0 flex-1 sm:min-w-32 sm:flex-none"
            :disabled="busy"
            @click="continueSetup"
          >
            <Loader2Icon
              v-if="busy"
              data-icon="inline-start"
              class="animate-spin"
            />
            继续
          </Button>
        </div>
      </CardContent>
    </Card>
  </div>
</template>

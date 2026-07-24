<script setup lang="ts">
import { ArrowRightIcon, CheckIcon, KeyRoundIcon, LaptopIcon, Loader2Icon } from '@lucide/vue'
import type {
  ProviderCapabilities,
  ProviderCompat,
  ProviderModel,
  SaveProviderRequest,
} from '@shared/types/provider'
import { storeToRefs } from 'pinia'
import { type Component, computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  appBridge,
  type BridgeAppLanguage,
  type BridgeProviderConfig,
  type BridgeProviderPreset,
} from '@/bridge/app'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useOmniInferStore } from '@/stores/omniinfer'
import { useProviderStore } from '@/stores/provider'
import { useSettingsStore } from '@/stores/settings'
import { errorToText, useToast } from '@/utils/toast'

type ProviderChoiceId = 'omniinfer-local' | 'openai-compatible'

interface ProviderChoice {
  id: ProviderChoiceId
  title: string
  badge: string
  description: string
  icon: Component
}

const emit = defineEmits<{
  completed: []
}>()
const providerStore = useProviderStore()
const settingsStore = useSettingsStore()
const omniInferStore = useOmniInferStore()
const { t } = useI18n()
const toast = useToast()
const { rawProviders, providerPresets, loading, presetsLoading } = storeToRefs(providerStore)
const {
  config: settingsConfig,
  draft: settingsDraft,
  saving: settingsSaving,
} = storeToRefs(settingsStore)
const { processState: omniInferProcessState } = storeToRefs(omniInferStore)

const selectedChoiceId = ref<ProviderChoiceId>('openai-compatible')
const omniInferPackaged = ref(false)
const submitting = ref(false)
const languageSaving = ref(false)
const cloudBaseUrl = ref('https://api.openai.com/v1')
const cloudApiKey = ref('')
const cloudModelId = ref('gpt-4o-mini')

const selectedLanguage = computed<BridgeAppLanguage>({
  get: () => settingsDraft.value?.app.language ?? settingsConfig.value?.app.language ?? 'system',
  set: (value) => {
    void saveLanguage(value)
  },
})
const omniInferBadge = computed((): { label: string; description: string } => {
  switch (omniInferProcessState.value) {
    case 'not_bundled':
      return {
        label: t('onboarding.provider.omniInfer.status.notBundled.label'),
        description: t('onboarding.provider.omniInfer.status.notBundled.description'),
      }
    case 'starting':
      return {
        label: t('onboarding.provider.omniInfer.status.starting.label'),
        description: t('onboarding.provider.omniInfer.status.starting.description'),
      }
    case 'running':
      return {
        label: t('onboarding.provider.omniInfer.status.running.label'),
        description: t('onboarding.provider.omniInfer.status.running.description'),
      }
    case 'unhealthy':
      return {
        label: t('onboarding.provider.omniInfer.status.unhealthy.label'),
        description: t('onboarding.provider.omniInfer.status.unhealthy.description'),
      }
    case 'crashed':
      return {
        label: t('onboarding.provider.omniInfer.status.crashed.label'),
        description: t('onboarding.provider.omniInfer.status.crashed.description'),
      }
    default:
      return {
        label: t('onboarding.provider.omniInfer.status.stopped.label'),
        description: t('onboarding.provider.omniInfer.status.stopped.description'),
      }
  }
})

const choices = computed((): ProviderChoice[] => {
  const options: ProviderChoice[] = []
  if (omniInferPackaged.value) {
    options.push({
      id: 'omniinfer-local',
      title: t('onboarding.provider.omniInfer.title'),
      badge: omniInferBadge.value.label,
      description: omniInferBadge.value.description,
      icon: LaptopIcon,
    })
  }
  options.push({
    id: 'openai-compatible',
    title: t('onboarding.provider.cloud.title'),
    badge: t('onboarding.provider.cloud.badge'),
    description: t('onboarding.provider.cloud.description'),
    icon: KeyRoundIcon,
  })
  return options
})

const selectedChoice = computed(
  () => choices.value.find((choice) => choice.id === selectedChoiceId.value) ?? choices.value[0]
)
const languageBusy = computed(() => languageSaving.value || settingsSaving.value)
const busy = computed(
  () => submitting.value || loading.value || presetsLoading.value || languageBusy.value
)

onMounted(async () => {
  let omniInferStatusPromise: Promise<void> = Promise.resolve()
  const appInfoPromise = appBridge.app
    .getInfo()
    .then((info) => {
      omniInferPackaged.value = info.omniInferPackaged
    })
    .catch(() => {
      omniInferPackaged.value = false
    })
  if (omniInferStore.available) {
    omniInferStore.subscribe()
    omniInferStatusPromise = omniInferStore.refreshStatus().catch(() => {})
  }
  await Promise.allSettled([
    appInfoPromise,
    omniInferStatusPromise,
    settingsStore.load(),
    providerStore.loadProviders(),
    providerStore.loadProviderPresets(),
  ])
  if (omniInferPackaged.value) {
    selectedChoiceId.value = 'omniinfer-local'
  }
})

async function saveLanguage(language: BridgeAppLanguage) {
  if (languageBusy.value) return
  languageSaving.value = true
  try {
    await settingsStore.load()
    settingsStore.updateAppSetting('language', language)
    await settingsStore.save()
  } catch (error) {
    toast.error(errorToText(error, t('onboarding.language.saveFailed')))
  } finally {
    languageSaving.value = false
  }
}

async function continueSetup() {
  if (busy.value) return
  submitting.value = true
  try {
    const choice = selectedChoice.value
    const preset = providerPresets.value.find((item) => item.id === choice.id)
    if (!preset) {
      throw new Error(t('onboarding.errors.providerPresetNotFound', { id: choice.id }))
    }

    if (choice.id === 'openai-compatible') {
      await saveCloudProvider(preset)
    } else {
      const existing = findExistingProvider(preset)
      if (!existing) {
        await providerStore.createProviderFromPreset(choice.id)
      }

      await providerStore.loadProviders()
    }

    await markInitializationCompleted()
    toast.success(t('onboarding.toasts.configured'))
    emit('completed')
  } catch (error) {
    toast.error(errorToText(error, t('onboarding.errors.configureFailed')))
  } finally {
    submitting.value = false
  }
}

async function skipSetup() {
  try {
    await markInitializationCompleted()
    emit('completed')
  } catch (error) {
    toast.error(errorToText(error, t('onboarding.errors.initializationSaveFailed')))
  }
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
    throw new Error(t('onboarding.errors.cloudBaseUrlRequired'))
  }
  if (!apiKey) {
    throw new Error(t('onboarding.errors.cloudApiKeyRequired'))
  }
  if (!modelId) {
    throw new Error(t('onboarding.errors.cloudModelIdRequired'))
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
    'relative isolate flex min-h-32 w-full flex-col overflow-hidden rounded-xl border bg-card px-5 py-4 text-left transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    selectedChoiceId.value === choice.id
      ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
      : 'border-border'
  )
}

function choiceIndicatorClass(choice: ProviderChoice) {
  return cn(
    'absolute right-4 top-4 flex size-5 shrink-0 items-center justify-center rounded-full border',
    selectedChoiceId.value === choice.id
      ? 'border-primary bg-primary text-primary-foreground'
      : 'border-muted-foreground/40 bg-background text-transparent'
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
  <div class="h-full min-h-0 overflow-auto bg-background">
    <main
      class="mx-auto flex min-h-full w-full max-w-[840px] flex-col justify-center px-6 py-12 sm:px-8 md:py-16"
    >
      <header class="text-center">
        <h1
          class="text-4xl font-semibold tracking-[-0.02em] [word-spacing:0.18em] sm:text-5xl md:text-6xl"
        >
          {{ t('onboarding.welcome.title') }}
        </h1>
        <p class="mt-6 text-base text-muted-foreground sm:text-lg">
          {{ t('onboarding.welcome.description') }}
        </p>
      </header>

      <section class="mt-12">
        <FieldLabel
          for="onboarding-language"
          class="mb-3 block text-base font-medium"
        >
          {{ t('onboarding.language.title') }}
        </FieldLabel>
        <Select
          v-model="selectedLanguage"
          :disabled="languageBusy"
        >
          <SelectTrigger
            id="onboarding-language"
            class="h-12 w-full bg-background px-4 text-base"
          >
            <SelectValue :placeholder="t('onboarding.language.placeholder')" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="system">{{ t('onboarding.language.system') }}</SelectItem>
              <SelectItem value="zh-CN">{{ t('onboarding.language.zhCN') }}</SelectItem>
              <SelectItem value="en-US">{{ t('onboarding.language.enUS') }}</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </section>

      <section class="mt-8">
        <h2 class="text-base font-medium">
          {{ t('onboarding.provider.sectionLabel') }}
        </h2>

        <div
          :class="[
            'mx-auto mt-3 grid w-full gap-4',
            choices.length > 1 ? 'sm:grid-cols-2' : 'max-w-sm grid-cols-1',
          ]"
          role="group"
          :aria-label="t('onboarding.provider.heading')"
        >
          <button
            v-for="choice in choices"
            :key="choice.id"
            type="button"
            :aria-pressed="selectedChoiceId === choice.id"
            :class="choiceButtonClass(choice)"
            @click="selectedChoiceId = choice.id"
          >
            <span :class="choiceIndicatorClass(choice)">
              <CheckIcon class="size-3" />
            </span>

            <component
              :is="choice.icon"
              class="pointer-events-none absolute -right-1 -bottom-3 z-0 size-24 -rotate-6 text-primary opacity-[0.07]"
              aria-hidden="true"
            />

            <span class="relative z-10 mt-auto flex min-w-0 flex-col">
              <span class="flex min-w-0 flex-wrap items-center gap-2 pr-6">
                <span class="truncate text-sm font-semibold">{{ choice.title }}</span>
                <span class="text-xs text-muted-foreground">
                  {{ choice.badge }}
                </span>
              </span>
              <span class="mt-1.5 line-clamp-2 text-xs leading-5 text-muted-foreground">
                {{ choice.description }}
              </span>
            </span>
          </button>
        </div>

        <div
          v-if="selectedChoiceId === 'openai-compatible'"
          class="mt-5 rounded-xl border bg-card p-5"
        >
          <FieldGroup class="w-full gap-3">
            <div>
              <h3 class="text-sm font-medium">
                {{ t('onboarding.cloud.heading') }}
              </h3>
              <p class="mt-1 text-xs text-muted-foreground">
                {{ t('onboarding.cloud.description') }}
              </p>
            </div>
            <div class="grid gap-3 md:grid-cols-[1.2fr_1fr]">
              <Field>
                <FieldLabel for="onboarding-cloud-base-url">
                  {{ t('onboarding.cloud.baseUrl') }}
                </FieldLabel>
                <Input
                  id="onboarding-cloud-base-url"
                  v-model="cloudBaseUrl"
                  placeholder="https://api.openai.com/v1"
                />
              </Field>

              <Field>
                <FieldLabel for="onboarding-cloud-model-id">
                  {{ t('onboarding.cloud.modelId') }}
                </FieldLabel>
                <Input
                  id="onboarding-cloud-model-id"
                  v-model="cloudModelId"
                  placeholder="gpt-4o-mini"
                />
              </Field>
            </div>

            <Field>
              <FieldLabel for="onboarding-cloud-api-key">
                {{ t('onboarding.cloud.apiKey') }}
              </FieldLabel>
              <Input
                id="onboarding-cloud-api-key"
                v-model="cloudApiKey"
                type="password"
                placeholder="sk-..."
              />
            </Field>
          </FieldGroup>
        </div>
      </section>

      <footer class="mt-6 flex items-center justify-between gap-4">
          <Button
            type="button"
            variant="ghost"
            class="px-1 text-muted-foreground underline underline-offset-4 hover:bg-transparent hover:text-foreground"
            :disabled="busy"
            @click="skipSetup"
          >
            {{ t('onboarding.actions.skip') }}
          </Button>

          <Button
            type="button"
            size="lg"
            class="min-w-40"
            :disabled="busy"
            @click="continueSetup"
          >
            <Loader2Icon
              v-if="busy"
              data-icon="inline-start"
              class="animate-spin"
            />
            {{ t('onboarding.actions.continue') }}
            <ArrowRightIcon
              v-if="!busy"
              data-icon="inline-end"
            />
          </Button>
      </footer>
    </main>
  </div>
</template>

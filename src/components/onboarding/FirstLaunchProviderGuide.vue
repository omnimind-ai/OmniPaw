<script setup lang="ts">
import type { ProviderModel, SaveProviderRequest } from '@shared/types/provider'
import { CloudIcon, KeyRoundIcon, LaptopIcon, Loader2Icon, SparklesIcon } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import type { BridgeProviderPreset } from '@/bridge/app'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useProviderStore } from '@/stores/provider'
import { errorToText, useToast } from '@/utils/toast'

type ProviderChoiceId = 'omniinfer-local' | 'ollama' | 'openai-compatible'

interface ProviderChoice {
  id: ProviderChoiceId
  title: string
  badge: string
  badgeClass: string
  description: string
  icon: typeof SparklesIcon
  disabled?: boolean
}

const providerStore = useProviderStore()
const router = useRouter()
const toast = useToast()
const { rawProviders, providerPresets, loading, presetsLoading } = storeToRefs(providerStore)

const selectedChoiceId = ref<ProviderChoiceId>('ollama')
const submitting = ref(false)
const cloudBaseUrl = ref('https://api.openai.com/v1')
const cloudApiKey = ref('')
const cloudModelId = ref('gpt-4o-mini')

const choices: ProviderChoice[] = [
  {
    id: 'omniinfer-local',
    title: 'OmniInfer',
    badge: '占位',
    badgeClass: 'bg-slate-100 text-slate-500',
    description: '即将支持的一键本地推理服务',
    icon: LaptopIcon,
    disabled: true,
  },
  {
    id: 'ollama',
    title: 'Ollama',
    badge: '本地',
    badgeClass: 'bg-emerald-100 text-emerald-700',
    description: '使用这台 Mac 上的 Ollama 模型',
    icon: SparklesIcon,
  },
  {
    id: 'openai-compatible',
    title: 'Cloud API',
    badge: 'API Key',
    badgeClass: 'bg-slate-100 text-slate-700',
    description: '使用 OpenAI-compatible API keys',
    icon: KeyRoundIcon,
  },
]

const selectedChoice = computed(
  () => choices.find((choice) => choice.id === selectedChoiceId.value) ?? choices[0]
)
const busy = computed(() => submitting.value || loading.value || presetsLoading.value)

onMounted(async () => {
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
      return
    }

    const existing = findExistingProvider(preset)
    const provider = existing ?? (await providerStore.createProviderFromPreset(choice.id))
    if (choice.id === 'ollama' && provider?.id) {
      await providerStore.refreshModels(provider.id)
    }

    await providerStore.loadProviders()
    toast.success('模型服务已配置。')
  } catch (error) {
    toast.error(errorToText(error, '模型服务配置失败。'))
  } finally {
    submitting.value = false
  }
}

async function openAdvancedSettings() {
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
  const request: SaveProviderRequest = {
    provider: {
      id: providerId,
      name: existing?.name || preset.name || 'OpenAI Compatible',
      type: 'openai-compatible',
      api: 'openai-chat-completions',
      baseUrl,
      enabled: true,
      credentialRef: existing?.credentialRef || `${providerId}:default`,
      authHeader: existing?.authHeader || preset.authHeader || 'Authorization',
      headers: existing?.headers || preset.headers || {},
      extraBody: existing?.extraBody || preset.extraBody || {},
      defaultModelId: modelId,
      capabilities: {
        listModels: preset.capabilities?.listModels ?? existing?.capabilities?.listModels ?? true,
        streaming: preset.capabilities?.streaming ?? existing?.capabilities?.streaming ?? true,
        tools: preset.capabilities?.tools ?? existing?.capabilities?.tools ?? true,
        vision: preset.capabilities?.vision ?? existing?.capabilities?.vision ?? true,
      },
      compat: {
        maxTokensField:
          preset.compat?.maxTokensField || existing?.compat?.maxTokensField || 'max_tokens',
        supportsSystemRole:
          preset.compat?.supportsSystemRole ?? existing?.compat?.supportsSystemRole ?? true,
        supportsDeveloperRole:
          preset.compat?.supportsDeveloperRole ?? existing?.compat?.supportsDeveloperRole ?? false,
        supportsJsonMode:
          preset.compat?.supportsJsonMode ?? existing?.compat?.supportsJsonMode ?? true,
        reasoningFormat:
          preset.compat?.reasoningFormat || existing?.compat?.reasoningFormat || 'none',
      },
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
  toast.success('Cloud API 已配置。')
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
</script>

<template>
  <div class="flex min-h-full flex-1 items-center justify-center overflow-auto bg-white px-6 py-5">
    <section class="relative w-full max-w-3xl bg-white px-4 py-4 md:px-6">
      <div class="mx-auto max-w-3xl text-center">
        <p class="mb-2 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3.5 py-1 text-sm font-semibold text-blue-700">
          <CloudIcon class="h-4 w-4" />
          只需要这一步配置！
        </p>
        <h1 class="text-3xl font-bold tracking-normal text-zinc-950 md:text-4xl">
          Choose your model provider
        </h1>
        <p class="mt-2 text-base font-medium leading-6 text-slate-500">
          选择 Agent 的运行方式。完成这一步后，就可以直接和桌面角色互动。
        </p>
      </div>

      <div class="mx-auto mt-6 flex max-w-3xl flex-col gap-3">
        <button
          v-for="choice in choices"
          :key="choice.id"
          type="button"
          :disabled="choice.disabled"
          class="group flex min-h-24 w-full items-center gap-4 rounded-2xl border bg-white px-5 py-4 text-left shadow-sm transition hover:border-blue-300 hover:bg-blue-50/30"
          :class="
            selectedChoiceId === choice.id
              ? 'border-blue-500 bg-blue-50/40 shadow-blue-100 ring-1 ring-blue-500'
              : choice.disabled
                ? 'cursor-not-allowed border-zinc-200 opacity-60'
                : 'border-zinc-200'
          "
          @click="!choice.disabled && (selectedChoiceId = choice.id)"
        >
          <span
            class="grid h-7 w-7 shrink-0 place-items-center rounded-full border-2"
            :class="
              selectedChoiceId === choice.id
                ? 'border-blue-500 bg-blue-500'
                : 'border-zinc-300 bg-white'
            "
          >
            <span
              v-if="selectedChoiceId === choice.id"
              class="h-3 w-3 rounded-full bg-white"
            />
          </span>

          <span class="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-slate-50 text-slate-700 ring-1 ring-slate-200">
            <component
              :is="choice.icon"
              class="h-8 w-8 stroke-[1.8]"
            />
          </span>

          <span class="min-w-0 flex-1">
            <span class="flex flex-wrap items-center gap-3">
              <span class="text-xl font-bold tracking-normal text-zinc-950">{{ choice.title }}</span>
              <span
                class="rounded-full px-2.5 py-0.5 text-xs font-bold"
                :class="choice.badgeClass"
              >
                {{ choice.badge }}
              </span>
            </span>
            <span class="mt-2 block text-base font-medium leading-6 text-slate-500">
              {{ choice.description }}
            </span>
          </span>
        </button>
      </div>

      <div
        v-if="selectedChoiceId === 'openai-compatible'"
        class="mx-auto mt-4 max-w-3xl rounded-2xl border border-blue-100 bg-blue-50/40 p-4 text-left"
      >
        <div class="grid gap-3 md:grid-cols-[1.2fr_1fr]">
          <div class="space-y-2">
            <Label for="onboarding-cloud-base-url">Base URL</Label>
            <Input
              id="onboarding-cloud-base-url"
              v-model="cloudBaseUrl"
              class="h-10 rounded-xl bg-white text-base"
              placeholder="https://api.openai.com/v1"
            />
          </div>

          <div class="space-y-2">
            <Label for="onboarding-cloud-model-id">Model ID</Label>
            <Input
              id="onboarding-cloud-model-id"
              v-model="cloudModelId"
              class="h-10 rounded-xl bg-white text-base"
              placeholder="gpt-4o-mini"
            />
          </div>
        </div>

        <div class="mt-3 space-y-2">
          <Label for="onboarding-cloud-api-key">API Key</Label>
          <Input
            id="onboarding-cloud-api-key"
            v-model="cloudApiKey"
            type="password"
            class="h-10 rounded-xl bg-white text-base"
            placeholder="sk-..."
          />
        </div>
      </div>

      <div class="mx-auto mt-5 flex max-w-3xl items-center justify-between gap-4">
        <Button
          type="button"
          variant="outline"
          size="lg"
          class="h-11 min-w-36 rounded-xl border-zinc-200 px-6 text-base font-semibold shadow-sm"
          @click="openAdvancedSettings"
        >
          Advanced
        </Button>

        <Button
          type="button"
          size="lg"
          class="h-11 min-w-44 rounded-xl bg-blue-600 px-8 text-base font-semibold text-white shadow-lg shadow-blue-200 hover:bg-blue-700"
          :disabled="busy"
          @click="continueSetup"
        >
          <Loader2Icon
            v-if="busy"
            class="mr-2 h-5 w-5 animate-spin"
          />
          Continue
        </Button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia'
import type { AcceptableValue } from 'reka-ui'
import { computed } from 'vue'
import type { BridgeDesktopSettingsConfig } from '@/bridge/app'
import SettingEntry from '@/components/settings/common/SettingEntry.vue'
import SettingsSection from '@/components/settings/common/SettingsSection.vue'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { type ProviderModelOption, useProviderStore } from '@/stores/provider'

const NONE_VALUE = '__none__'

const props = defineProps<{
  draft: BridgeDesktopSettingsConfig
}>()

const providerStore = useProviderStore()
const {
  defaultModelKey,
  fallbackModelKeys,
  modelOptions,
  observationReactionModelKey,
  observationVisionModelKey,
  persistenceAvailable,
  registrySettings,
  saving,
  titleModelKey,
} = storeToRefs(providerStore)

const enabledOptions = computed(() => modelOptions.value.filter((option) => option.enabled))
const enabledTextOptions = computed(() =>
  enabledOptions.value.filter((option) => option.input.includes('text'))
)
const enabledImageOptions = computed(() =>
  enabledOptions.value.filter((option) => option.input.includes('image'))
)
const streaming = computed(() => registrySettings.value.streaming)
const chatContext = computed(() => props.draft.app.chatContext)
const compactModelKey = computed(() => {
  const configuredModelId = chatContext.value.compactModelId
  if (!configuredModelId) return NONE_VALUE
  return (
    enabledTextOptions.value.find(
      (option) => option.modelId === configuredModelId || option.key === configuredModelId
    )?.key ?? NONE_VALUE
  )
})

function fallbackChecked(modelKey: string) {
  return fallbackModelKeys.value.includes(modelKey)
}

function updateDefaultModel(value: AcceptableValue) {
  const normalizedValue = typeof value === 'string' ? value : ''
  void providerStore.setDefaultModelKey(normalizedValue === NONE_VALUE ? '' : normalizedValue)
}

function updateFallback(modelKey: string, checked: boolean | 'indeterminate') {
  const selected = checked === true
  const current = new Set(fallbackModelKeys.value)

  if (selected) {
    current.add(modelKey)
  } else {
    current.delete(modelKey)
  }

  current.delete(defaultModelKey.value)
  void providerStore.setFallbackModelKeys([...current])
}

function updateTitleModel(value: AcceptableValue) {
  const normalizedValue = typeof value === 'string' ? value : ''
  void providerStore.setTitleModelKey(normalizedValue === NONE_VALUE ? '' : normalizedValue)
}

function updateObservationVisionModel(value: AcceptableValue) {
  const normalizedValue = typeof value === 'string' ? value : ''
  void providerStore.setObservationModelKeys(
    normalizedValue === NONE_VALUE ? '' : normalizedValue,
    observationReactionModelKey.value
  )
}

function updateObservationReactionModel(value: AcceptableValue) {
  const normalizedValue = typeof value === 'string' ? value : ''
  void providerStore.setObservationModelKeys(
    observationVisionModelKey.value,
    normalizedValue === NONE_VALUE ? '' : normalizedValue
  )
}

function updateCompactModel(value: AcceptableValue) {
  const normalizedValue = typeof value === 'string' ? value : ''
  const selected = enabledTextOptions.value.find((option) => option.key === normalizedValue)
  chatContext.value.compactModelId = selected?.modelId
}

function updateStreaming(value: boolean) {
  void providerStore.setStreaming(value)
}

function modelLabel(option: ProviderModelOption) {
  return `${option.providerName} / ${option.modelName}`
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <SettingsSection title="默认模型">
      <FieldGroup class="gap-0">
        <SettingEntry
          control-id="settings-default-model"
          title="默认模型"
          description="新会话默认使用的模型。"
        >
          <Select
            :model-value="defaultModelKey || NONE_VALUE"
            :disabled="saving || !enabledOptions.length || !persistenceAvailable"
            @update:model-value="updateDefaultModel"
          >
            <SelectTrigger
              id="settings-default-model"
              class="w-full md:w-72"
            >
              <SelectValue placeholder="未设置默认模型" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem :value="NONE_VALUE">不设置</SelectItem>
                <SelectItem
                  v-for="option in enabledOptions"
                  :key="option.key"
                  :value="option.key"
                >
                  {{ modelLabel(option) }}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </SettingEntry>

        <SettingEntry
          control-id="settings-title-model"
          title="标题总结模型"
          description="新聊天首次出现明确主题时，用于生成侧栏标题。"
        >
          <Select
            :model-value="titleModelKey || NONE_VALUE"
            :disabled="saving || !enabledTextOptions.length || !persistenceAvailable"
            @update:model-value="updateTitleModel"
          >
            <SelectTrigger
              id="settings-title-model"
              class="w-full md:w-72"
            >
              <SelectValue placeholder="使用默认模型" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem :value="NONE_VALUE">使用默认模型</SelectItem>
                <SelectItem
                  v-for="option in enabledTextOptions"
                  :key="option.key"
                  :value="option.key"
                >
                  {{ modelLabel(option) }}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </SettingEntry>

        <SettingEntry
          control-id="settings-context-compact-model"
          title="压缩默认模型"
          description="上下文压缩时默认使用的模型，留空时使用当前会话模型。"
        >
          <Select
            :model-value="compactModelKey"
            :disabled="saving || !enabledTextOptions.length || !persistenceAvailable"
            @update:model-value="updateCompactModel"
          >
            <SelectTrigger
              id="settings-context-compact-model"
              class="w-full md:w-72"
            >
              <SelectValue placeholder="使用当前会话模型" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem :value="NONE_VALUE">使用当前会话模型</SelectItem>
                <SelectItem
                  v-for="option in enabledTextOptions"
                  :key="option.key"
                  :value="option.key"
                >
                  {{ modelLabel(option) }}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </SettingEntry>

        <SettingEntry
          control-id="settings-streaming"
          title="流式输出"
          description="模型回复时逐步返回内容。"
        >
          <Switch
            id="settings-streaming"
            :model-value="streaming"
            aria-label="流式输出"
            :disabled="saving || !persistenceAvailable"
            @update:model-value="updateStreaming"
          />
        </SettingEntry>
      </FieldGroup>
    </SettingsSection>

    <SettingsSection title="主动视觉观察模型">
      <FieldGroup class="gap-0">
        <SettingEntry control-id="settings-observation-vision-model" title="视觉观察模型">
          <template #description>
            用于理解截图。未选择时会从当前会话、默认模型和备用模型中寻找图片模型。
          </template>
          <Select
            :model-value="observationVisionModelKey || NONE_VALUE"
            :disabled="saving || !enabledOptions.length || !persistenceAvailable"
            @update:model-value="updateObservationVisionModel"
          >
            <SelectTrigger
              id="settings-observation-vision-model"
              class="w-full md:w-72"
            >
              <SelectValue placeholder="自动选择图片模型" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem :value="NONE_VALUE">自动选择图片模型</SelectItem>
                <SelectItem
                  v-for="option in enabledImageOptions"
                  :key="option.key"
                  :value="option.key"
                >
                  {{ modelLabel(option) }}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </SettingEntry>

        <SettingEntry control-id="settings-observation-reaction-model" title="Reaction 模型">
          <template #description>
            用于把视觉摘要转成短反应。选择支持图片的模型时也可承担完整链路。
          </template>
          <Select
            :model-value="observationReactionModelKey || NONE_VALUE"
            :disabled="saving || !enabledTextOptions.length || !persistenceAvailable"
            @update:model-value="updateObservationReactionModel"
          >
            <SelectTrigger
              id="settings-observation-reaction-model"
              class="w-full md:w-72"
            >
              <SelectValue placeholder="复用视觉模型" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem :value="NONE_VALUE">复用视觉模型</SelectItem>
                <SelectItem
                  v-for="option in enabledTextOptions"
                  :key="option.key"
                  :value="option.key"
                >
                  {{ modelLabel(option) }}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </SettingEntry>

        <SettingEntry
          :description="
            enabledImageOptions.length
              ? '只选择一个支持图片输入的模型时，它会承担截图理解和 reaction。'
              : '还没有启用支持图片输入的模型。'
          "
        />
      </FieldGroup>
    </SettingsSection>

    <SettingsSection title="备用模型">
      <FieldSet class="px-4 py-4">
        <FieldDescription v-if="!enabledOptions.length">
          还没有可用模型。
        </FieldDescription>
        <FieldGroup
          v-else
          data-slot="checkbox-group"
          class="gap-3"
        >
          <Field
            v-for="option in enabledOptions"
            :key="option.key"
            orientation="horizontal"
            class="items-center"
            :data-disabled="option.key === defaultModelKey"
          >
            <Checkbox
              :id="`fallback-${option.key}`"
              :model-value="fallbackChecked(option.key)"
              :disabled="option.key === defaultModelKey || saving || !persistenceAvailable"
              @update:model-value="updateFallback(option.key, $event)"
            />
            <FieldContent>
              <FieldLabel :for="`fallback-${option.key}`">
                {{ option.modelName }}
                <Badge
                  v-if="option.key === defaultModelKey"
                  variant="secondary"
                >
                  默认
                </Badge>
              </FieldLabel>
              <FieldDescription>{{ option.providerName }}</FieldDescription>
            </FieldContent>
          </Field>
        </FieldGroup>
      </FieldSet>
    </SettingsSection>
  </div>
</template>

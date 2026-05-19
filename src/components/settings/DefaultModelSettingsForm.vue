<script setup lang="ts">
import { storeToRefs } from 'pinia'
import type { AcceptableValue } from 'reka-ui'
import { computed } from 'vue'
import SettingsSection from '@/components/settings/SettingsSection.vue'
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

const providerStore = useProviderStore()
const {
  defaultModelKey,
  fallbackModelKeys,
  modelOptions,
  persistenceAvailable,
  registrySettings,
  saving,
} = storeToRefs(providerStore)

const enabledOptions = computed(() => modelOptions.value.filter((option) => option.enabled))
const streaming = computed(() => registrySettings.value.streaming)

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
        <Field
          orientation="responsive"
          class="border-b px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="settings-default-model">默认模型</FieldLabel>
            <FieldDescription>新会话默认使用的模型。</FieldDescription>
          </FieldContent>
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
        </Field>

        <Field
          orientation="responsive"
          class="px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="settings-streaming">流式输出</FieldLabel>
            <FieldDescription>模型回复时逐步返回内容。</FieldDescription>
          </FieldContent>
          <Switch
            id="settings-streaming"
            :model-value="streaming"
            aria-label="流式输出"
            :disabled="saving || !persistenceAvailable"
            @update:model-value="updateStreaming"
          />
        </Field>
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

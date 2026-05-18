<script setup lang="ts">
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
import type { BridgeDesktopSettingsConfig } from '@/bridge/app'
import type { ProviderModelOption } from '@/stores/provider'

const props = defineProps<{
  draft: BridgeDesktopSettingsConfig
  modelOptions: ProviderModelOption[]
}>()

const enabledOptions = computed(() => props.modelOptions.filter((option) => option.enabled))

const defaultModelId = computed({
  get: () => props.draft.providers.settings.defaultModelId,
  set: (value: string) => {
    props.draft.providers.settings.defaultModelId = value
    props.draft.providers.settings.fallbackModelIds =
      props.draft.providers.settings.fallbackModelIds.filter((modelId) => modelId !== value)
  },
})

const streaming = computed({
  get: () => props.draft.providers.settings.streaming,
  set: (value: boolean) => {
    props.draft.providers.settings.streaming = value
  },
})

function fallbackChecked(modelId: string) {
  return props.draft.providers.settings.fallbackModelIds.includes(modelId)
}

function updateFallback(modelId: string, checked: boolean | 'indeterminate') {
  const selected = checked === true
  const current = new Set(props.draft.providers.settings.fallbackModelIds)

  if (selected) {
    current.add(modelId)
  } else {
    current.delete(modelId)
  }

  current.delete(defaultModelId.value)
  props.draft.providers.settings.fallbackModelIds = [...current].filter((item) =>
    enabledOptions.value.some((option) => option.modelId === item)
  )
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
            v-model="defaultModelId"
            :disabled="!enabledOptions.length"
          >
            <SelectTrigger
              id="settings-default-model"
              class="w-full md:w-72"
            >
              <SelectValue placeholder="选择默认模型" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem
                  v-for="option in enabledOptions"
                  :key="option.key"
                  :value="option.modelId"
                >
                  {{ option.providerName }} / {{ option.modelName }}
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
            v-model="streaming"
            aria-label="流式输出"
          />
        </Field>
      </FieldGroup>
    </SettingsSection>

    <SettingsSection title="备用模型">
      <FieldSet class="px-4 py-4">
        <FieldLegend>失败回退顺序</FieldLegend>
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
            :data-disabled="option.modelId === defaultModelId"
          >
            <Checkbox
              :id="`fallback-${option.key}`"
              :model-value="fallbackChecked(option.modelId)"
              :disabled="option.modelId === defaultModelId"
              @update:model-value="updateFallback(option.modelId, $event)"
            />
            <FieldContent>
              <FieldLabel :for="`fallback-${option.key}`">
                {{ option.modelName }}
                <Badge
                  v-if="option.modelId === defaultModelId"
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

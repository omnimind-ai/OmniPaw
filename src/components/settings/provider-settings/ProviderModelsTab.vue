<script setup lang="ts">
import {
  ChevronDownIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
} from 'lucide-vue-next'
import { ref, watch } from 'vue'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import type {
  ModelInput,
  ProviderDraft,
  ProviderModelDraft,
} from './types'

const props = defineProps<{
  draft: ProviderDraft
  canRefreshModels: boolean
  enabledModels: ProviderModelDraft[]
  refreshingModels: boolean
}>()

const emit = defineEmits<{
  'add-model': []
  'refresh-models': []
  'remove-model': [index: number]
  'set-optional-number': [
    model: ProviderModelDraft,
    key: 'contextWindow' | 'maxOutputTokens',
    value: string | number,
  ]
  'update-model-input': [
    model: ProviderModelDraft,
    input: ModelInput,
    checked: boolean | 'indeterminate',
  ]
}>()

const modelInputs: ModelInput[] = ['text', 'image', 'audio', 'file']
const openModelIds = ref<string[]>([])

watch(
  () => props.draft.models.map((model) => model.id),
  (modelIds) => {
    if (!modelIds.length) {
      openModelIds.value = []
      return
    }

    const existingOpen = openModelIds.value.filter((modelId) => modelIds.includes(modelId))
    openModelIds.value = existingOpen.length ? existingOpen : [modelIds[0]]
  },
  { immediate: true },
)

function isModelInputChecked(model: ProviderModelDraft, input: ModelInput) {
  return model.input.includes(input)
}

function isModelOpen(model: ProviderModelDraft) {
  return openModelIds.value.includes(model.id)
}

function setModelOpen(model: ProviderModelDraft, open: boolean) {
  const next = new Set(openModelIds.value)
  if (open) {
    next.add(model.id)
  } else {
    next.delete(model.id)
  }
  openModelIds.value = [...next]
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <Field class="md:max-w-sm">
        <FieldLabel for="provider-default-model">当前 Provider 默认模型</FieldLabel>
        <Select
          v-model="draft.defaultModelId"
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

      <div class="flex shrink-0 items-center gap-2">
        <Button
          type="button"
          variant="outline"
          :disabled="refreshingModels || !canRefreshModels"
          @click="emit('refresh-models')"
        >
          <RefreshCwIcon data-icon="inline-start" />
          {{ refreshingModels ? '探测中...' : '探测模型' }}
        </Button>

        <Button
          type="button"
          variant="outline"
          @click="emit('add-model')"
        >
          <PlusIcon data-icon="inline-start" />
          添加模型
        </Button>
      </div>
    </div>

    <div
      v-if="!draft.models.length"
      class="rounded-lg border px-3 py-4 text-sm text-muted-foreground"
    >
      还没有模型，先添加一个模型或探测远程模型列表。
    </div>

    <Collapsible
      v-for="(model, index) in draft.models"
      :key="`${model.id}-${index}`"
      :open="isModelOpen(model)"
      class="rounded-lg border"
      @update:open="setModelOpen(model, $event)"
    >
      <div class="flex items-center gap-2 p-3">
        <CollapsibleTrigger as-child>
          <button
            type="button"
            class="group flex min-w-0 flex-1 items-center gap-3 text-left"
          >
            <ChevronDownIcon
              class="shrink-0 transition-transform group-data-[state=closed]:-rotate-90"
              aria-hidden="true"
            />
            <span class="min-w-0 flex-1">
              <span class="flex min-w-0 items-center gap-2">
                <span class="truncate text-sm font-medium">
                  {{ model.name || model.id || '未命名模型' }}
                </span>
                <Badge
                  v-if="model.id === draft.defaultModelId"
                  variant="secondary"
                >
                  默认
                </Badge>
                <Badge
                  v-if="model.enabled === false"
                  variant="outline"
                >
                  禁用
                </Badge>
              </span>
              <span class="mt-1 block truncate text-xs text-muted-foreground">
                {{ model.remoteId || model.id }}
              </span>
            </span>
          </button>
        </CollapsibleTrigger>

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="删除模型"
          @click="emit('remove-model', index)"
        >
          <Trash2Icon />
        </Button>
      </div>

      <CollapsibleContent>
        <div class="flex flex-col gap-4 border-t p-4">
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
                @update:model-value="emit('set-optional-number', model, 'contextWindow', $event)"
              />
            </Field>
            <Field>
              <FieldLabel :for="`model-output-${index}`">最大输出 Token</FieldLabel>
              <Input
                :id="`model-output-${index}`"
                type="number"
                min="0"
                :model-value="model.maxOutputTokens ?? ''"
                @update:model-value="emit('set-optional-number', model, 'maxOutputTokens', $event)"
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
                v-for="input in modelInputs"
                :key="input"
                orientation="horizontal"
                class="items-center"
              >
                <Checkbox
                  :id="`model-${index}-${input}`"
                  :model-value="isModelInputChecked(model, input)"
                  @update:model-value="emit('update-model-input', model, input, $event)"
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
      </CollapsibleContent>
    </Collapsible>
  </div>
</template>

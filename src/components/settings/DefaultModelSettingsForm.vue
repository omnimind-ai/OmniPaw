<script setup lang="ts">
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BotIcon,
  EyeIcon,
  GripVerticalIcon,
  ListChecksIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import type { AcceptableValue } from 'reka-ui'
import { computed, ref } from 'vue'
import type { BridgeDesktopSettingsConfig } from '@/bridge/app'
import SettingEntry from '@/components/settings/common/SettingEntry.vue'
import SettingsSection from '@/components/settings/common/SettingsSection.vue'
import FallbackModelPickerModal from '@/components/settings/default-model-settings/FallbackModelPickerModal.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
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
import { cn } from '@/lib/utils'
import { type ProviderModelOption, useProviderStore } from '@/stores/provider'

const NONE_VALUE = '__none__'

const props = defineProps<{
  draft: BridgeDesktopSettingsConfig
}>()

const providerStore = useProviderStore()
const {
  defaultModelKey,
  embeddingModelKey,
  fallbackModelKeys,
  modelOptions,
  observationReactionModelKey,
  observationVisionModelKey,
  persistenceAvailable,
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
const fallbackPickerOpen = ref(false)
const draggedFallbackModelKey = ref('')
const dragOverFallbackModelKey = ref('')
const fallbackControlsDisabled = computed(() => saving.value || !persistenceAvailable.value)
const selectedFallbackKeySet = computed(() => new Set(fallbackModelKeys.value))
const fallbackOptions = computed(() =>
  fallbackModelKeys.value
    .map((key) => enabledOptions.value.find((option) => option.key === key))
    .filter((option): option is ProviderModelOption => Boolean(option))
)
const fallbackOptionKeys = computed(() => fallbackOptions.value.map((option) => option.key))
const addableFallbackOptions = computed(() =>
  enabledOptions.value.filter(
    (option) =>
      option.key !== defaultModelKey.value && !selectedFallbackKeySet.value.has(option.key)
  )
)

function updateDefaultModel(value: AcceptableValue) {
  const normalizedValue = typeof value === 'string' ? value : ''
  void providerStore.setDefaultModelKey(normalizedValue === NONE_VALUE ? '' : normalizedValue)
}

function updateTitleModel(value: AcceptableValue) {
  const normalizedValue = typeof value === 'string' ? value : ''
  void providerStore.setTitleModelKey(normalizedValue === NONE_VALUE ? '' : normalizedValue)
}

function updateEmbeddingModel(value: AcceptableValue) {
  const normalizedValue = typeof value === 'string' ? value : ''
  void providerStore.setEmbeddingModelKey(normalizedValue === NONE_VALUE ? '' : normalizedValue)
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

function addFallbackModels(modelKeys: string[]) {
  const current = new Set(fallbackModelKeys.value)
  const nextKeys = [...fallbackModelKeys.value]
  for (const modelKey of modelKeys) {
    if (modelKey && modelKey !== defaultModelKey.value && !current.has(modelKey)) {
      current.add(modelKey)
      nextKeys.push(modelKey)
    }
  }
  void providerStore.setFallbackModelKeys(nextKeys)
}

function removeFallbackModel(modelKey: string) {
  void providerStore.setFallbackModelKeys(fallbackModelKeys.value.filter((key) => key !== modelKey))
}

function clearFallbackModels() {
  void providerStore.setFallbackModelKeys([])
}

function moveFallbackModel(modelKey: string, offset: -1 | 1) {
  const current = [...fallbackOptionKeys.value]
  const index = current.indexOf(modelKey)
  const nextIndex = index + offset
  if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return

  current.splice(index, 1)
  current.splice(nextIndex, 0, modelKey)
  void providerStore.setFallbackModelKeys(current)
}

function startFallbackDrag(event: DragEvent, modelKey: string) {
  if (fallbackControlsDisabled.value) return

  draggedFallbackModelKey.value = modelKey
  event.dataTransfer?.setData('text/plain', modelKey)
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
  }
}

function enterFallbackDropTarget(modelKey: string) {
  if (!draggedFallbackModelKey.value || draggedFallbackModelKey.value === modelKey) return
  dragOverFallbackModelKey.value = modelKey
}

function dropFallbackModel(event: DragEvent, targetKey: string) {
  const sourceKey = draggedFallbackModelKey.value || event.dataTransfer?.getData('text/plain') || ''
  draggedFallbackModelKey.value = ''
  dragOverFallbackModelKey.value = ''
  if (!sourceKey || sourceKey === targetKey) return

  const current = [...fallbackOptionKeys.value]
  const sourceIndex = current.indexOf(sourceKey)
  const targetIndex = current.indexOf(targetKey)
  if (sourceIndex < 0 || targetIndex < 0) return

  current.splice(sourceIndex, 1)
  current.splice(sourceIndex < targetIndex ? targetIndex - 1 : targetIndex, 0, sourceKey)
  void providerStore.setFallbackModelKeys(current)
}

function endFallbackDrag() {
  draggedFallbackModelKey.value = ''
  dragOverFallbackModelKey.value = ''
}

function modelLabel(option: ProviderModelOption) {
  return `${option.providerName} / ${option.modelName}`
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <SettingsSection
      title="默认模型"
      description="设置新会话与辅助任务的首选模型。"
      :icon="BotIcon"
    >
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
          control-id="settings-memory-embedding-model"
          title="记忆 Embedding 模型"
          description="用于长期记忆的语义检索；留空时使用本地 hashing embedding。"
        >
          <Select
            :model-value="embeddingModelKey || NONE_VALUE"
            :disabled="saving || !enabledTextOptions.length || !persistenceAvailable"
            @update:model-value="updateEmbeddingModel"
          >
            <SelectTrigger
              id="settings-memory-embedding-model"
              class="w-full md:w-72"
            >
              <SelectValue placeholder="使用本地 embedding" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem :value="NONE_VALUE">使用本地 embedding</SelectItem>
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

      </FieldGroup>
    </SettingsSection>

    <SettingsSection
      title="主动视觉观察模型"
      description="指定视觉理解和短反应的模型链路。"
      :icon="EyeIcon"
    >
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

    <SettingsSection
      title="备用模型"
      description="添加默认模型不可用时的候选，列表顺序就是回退尝试顺序。"
    >
      <template #action>
        <div class="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            :disabled="fallbackControlsDisabled || !addableFallbackOptions.length"
            @click="fallbackPickerOpen = true"
          >
            <PlusIcon data-icon="inline-start" />
            添加
          </Button>
          <Button
            type="button"
            variant="outline"
            :disabled="fallbackControlsDisabled || !fallbackOptions.length"
            @click="clearFallbackModels"
          >
            <Trash2Icon data-icon="inline-start" />
            清空列表
          </Button>
        </div>
      </template>

      <FieldSet class="flex flex-col gap-4 px-4 py-4">
        <FieldDescription v-if="!enabledOptions.length">
          还没有可用模型。
        </FieldDescription>
        <FieldDescription v-else-if="!fallbackOptions.length">
          还没有备用模型。请先从上方添加候选。
        </FieldDescription>
        <FieldGroup
          v-else
          class="gap-2"
        >
          <Field
            v-for="(option, index) in fallbackOptions"
            :key="option.key"
            orientation="responsive"
            :class="cn(
              'rounded-md border px-3 py-2 transition-colors',
              fallbackControlsDisabled ? 'opacity-60' : 'cursor-grab hover:bg-muted/25',
              draggedFallbackModelKey === option.key ? 'opacity-40' : '',
              dragOverFallbackModelKey === option.key ? 'border-primary bg-muted/35' : '',
            )"
            :draggable="!fallbackControlsDisabled"
            @dragstart="startFallbackDrag($event, option.key)"
            @dragenter.prevent="enterFallbackDropTarget(option.key)"
            @dragover.prevent
            @drop.prevent="dropFallbackModel($event, option.key)"
            @dragend="endFallbackDrag"
          >
            <div class="flex min-w-0 items-center gap-3">
              <span
                class="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground"
                aria-hidden="true"
              >
                <GripVerticalIcon />
              </span>

              <Badge
                variant="secondary"
                class="shrink-0 tabular-nums"
              >
                {{ index + 1 }}
              </Badge>

              <FieldContent class="min-w-0 gap-1">
                <FieldLabel class="truncate">
                  {{ option.modelName }}
                </FieldLabel>
                <FieldDescription class="truncate">{{ option.providerName }}</FieldDescription>
              </FieldContent>
            </div>

            <div class="flex w-full items-center justify-end gap-1 @md/field-group:w-auto">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                :disabled="fallbackControlsDisabled || index === 0"
                aria-label="上移备用模型"
                @click="moveFallbackModel(option.key, -1)"
              >
                <ArrowUpIcon />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                :disabled="fallbackControlsDisabled || index === fallbackOptions.length - 1"
                aria-label="下移备用模型"
                @click="moveFallbackModel(option.key, 1)"
              >
                <ArrowDownIcon />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                :disabled="fallbackControlsDisabled"
                aria-label="移除备用模型"
                @click="removeFallbackModel(option.key)"
              >
                <Trash2Icon />
              </Button>
            </div>
          </Field>
        </FieldGroup>
      </FieldSet>
    </SettingsSection>

    <FallbackModelPickerModal
      v-model:open="fallbackPickerOpen"
      :options="addableFallbackOptions"
      :disabled="fallbackControlsDisabled"
      @confirm="addFallbackModels"
    />
  </div>
</template>

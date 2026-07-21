<script setup lang="ts">
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BotIcon,
  GripVerticalIcon,
  ListChecksIcon,
  PlusIcon,
  Trash2Icon,
} from '@lucide/vue'
import { storeToRefs } from 'pinia'
import type { AcceptableValue } from 'reka-ui'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
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

const { t } = useI18n()
const providerStore = useProviderStore()
const {
  defaultModelKey,
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

function updateEmbeddingModel(_value: AcceptableValue) {
  void providerStore.setEmbeddingModelKey('')
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
      :title="t('settings.defaultModel.title')"
      :icon="BotIcon"
    >
      <FieldGroup class="gap-0">
        <SettingEntry
          control-id="settings-default-model"
          :title="t('settings.defaultModel.model.title')"
          :description="t('settings.defaultModel.model.description')"
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
              <SelectValue :placeholder="t('settings.defaultModel.model.placeholder')" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem :value="NONE_VALUE">{{ t('settings.defaultModel.model.none') }}</SelectItem>
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
          :title="t('settings.defaultModel.titleModel.title')"
          :description="t('settings.defaultModel.titleModel.description')"
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
              <SelectValue :placeholder="t('settings.defaultModel.titleModel.placeholder')" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem :value="NONE_VALUE">{{ t('settings.defaultModel.titleModel.useDefault') }}</SelectItem>
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
          :title="t('settings.defaultModel.compactModel.title')"
          :description="t('settings.defaultModel.compactModel.description')"
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
              <SelectValue :placeholder="t('settings.defaultModel.compactModel.placeholder')" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem :value="NONE_VALUE">{{ t('settings.defaultModel.compactModel.useCurrent') }}</SelectItem>
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
          :title="t('settings.defaultModel.embeddingModel.title')"
          :description="t('settings.defaultModel.embeddingModel.description')"
        >
          <Select
            :model-value="NONE_VALUE"
            :disabled="saving || !persistenceAvailable"
            @update:model-value="updateEmbeddingModel"
          >
            <SelectTrigger
              id="settings-memory-embedding-model"
              class="w-full md:w-72"
            >
              <SelectValue :placeholder="t('settings.defaultModel.embeddingModel.placeholder')" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem :value="NONE_VALUE">{{ t('settings.defaultModel.embeddingModel.useLocal') }}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </SettingEntry>

        <SettingEntry control-id="settings-observation-vision-model" :title="t('settings.defaultModel.observation.visionModel.title')">
          <template #description>
            {{ t('settings.defaultModel.observation.visionModel.description') }}
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
              <SelectValue :placeholder="t('settings.defaultModel.observation.visionModel.placeholder')" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem :value="NONE_VALUE">{{ t('settings.defaultModel.observation.visionModel.auto') }}</SelectItem>
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

        <SettingEntry control-id="settings-observation-reaction-model" :title="t('settings.defaultModel.observation.reactionModel.title')">
          <template #description>
            {{ t('settings.defaultModel.observation.reactionModel.description') }}
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
              <SelectValue :placeholder="t('settings.defaultModel.observation.reactionModel.placeholder')" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem :value="NONE_VALUE">{{ t('settings.defaultModel.observation.reactionModel.reuseVision') }}</SelectItem>
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
              ? t('settings.defaultModel.observation.singleImageModelHint')
              : t('settings.defaultModel.observation.noImageModelsHint')
          "
        />
      </FieldGroup>
    </SettingsSection>

    <SettingsSection
      :title="t('settings.defaultModel.fallback.title')"
      :icon="ListChecksIcon"
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
            {{ t('settings.defaultModel.fallback.addButton') }}
          </Button>
          <Button
            type="button"
            variant="outline"
            :disabled="fallbackControlsDisabled || !fallbackOptions.length"
            @click="clearFallbackModels"
          >
            <Trash2Icon data-icon="inline-start" />
            {{ t('settings.defaultModel.fallback.clearButton') }}
          </Button>
        </div>
      </template>

      <FieldSet class="flex flex-col gap-4 px-4 py-4">
        <FieldDescription v-if="!enabledOptions.length">
          {{ t('settings.defaultModel.fallback.emptyNoModels') }}
        </FieldDescription>
        <FieldDescription v-else-if="!fallbackOptions.length">
          {{ t('settings.defaultModel.fallback.emptyNoFallback') }}
        </FieldDescription>
        <FieldGroup
          v-else
          class="gap-2"
        >
          <Field
            v-for="(option, index) in fallbackOptions"
            :key="option.key"
            orientation="horizontal"
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
            <div class="flex min-w-0 flex-1 items-center gap-3">
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

            <div class="ml-auto flex shrink-0 items-center justify-end gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                :disabled="fallbackControlsDisabled || index === 0"
                :aria-label="t('settings.defaultModel.fallback.moveUpAriaLabel')"
                @click="moveFallbackModel(option.key, -1)"
              >
                <ArrowUpIcon />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                :disabled="fallbackControlsDisabled || index === fallbackOptions.length - 1"
                :aria-label="t('settings.defaultModel.fallback.moveDownAriaLabel')"
                @click="moveFallbackModel(option.key, 1)"
              >
                <ArrowDownIcon />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                :disabled="fallbackControlsDisabled"
                :aria-label="t('settings.defaultModel.fallback.removeAriaLabel')"
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

<script setup lang="ts">
import { PlusIcon, RefreshCwIcon } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import SettingsSearchBar from '@/components/settings/common/SettingsSearchBar.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import ProviderModelItem from './ProviderModelItem.vue'
import type { ModelInput, ProviderDraft, ProviderModelDraft } from './types'

const { t } = useI18n()

const props = defineProps<{
  draft: ProviderDraft
  canRefreshModels: boolean
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

const searchQuery = ref('')
const openModelKeys = ref<string[]>([])

const filteredModels = computed(() => {
  const entries = props.draft.models.map((model, index) => ({ model, index }))
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return entries
  return entries.filter(({ model }) => {
    return (
      model.name?.toLowerCase().includes(query) || model.remoteId?.toLowerCase().includes(query)
    )
  })
})

watch(
  () => props.draft.models.map((model) => model.localKey),
  (modelKeys) => {
    if (!modelKeys.length) {
      openModelKeys.value = []
      return
    }

    const existingOpen = openModelKeys.value.filter((modelKey) => modelKeys.includes(modelKey))
    openModelKeys.value = existingOpen.length ? existingOpen : [modelKeys[0]]
  },
  { immediate: true }
)

function isModelOpen(model: ProviderModelDraft) {
  return openModelKeys.value.includes(model.localKey)
}

function setModelOpen(model: ProviderModelDraft, open: boolean) {
  const next = new Set(openModelKeys.value)
  if (open) {
    next.add(model.localKey)
  } else {
    next.delete(model.localKey)
  }
  openModelKeys.value = [...next]
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <SettingsSearchBar
      v-model="searchQuery"
      :placeholder="t('settings.provider.models.searchPlaceholder')"
      :label="t('settings.provider.models.search')"
      class="border-b-0 px-0 sm:px-0"
    >
      <template #summary>
        <Badge variant="secondary">
          {{
            searchQuery.trim()
              ? `${filteredModels.length}/${draft.models.length}`
              : draft.models.length
          }}
        </Badge>
      </template>
      <template #actions>
        <Button
          type="button"
          variant="outline"
          :disabled="refreshingModels || !canRefreshModels"
          @click="emit('refresh-models')"
        >
          <RefreshCwIcon data-icon="inline-start" />
          {{ refreshingModels ? t('settings.provider.models.refreshing') : t('settings.provider.models.refreshButton') }}
        </Button>

        <Button
          type="button"
          variant="outline"
          @click="emit('add-model')"
        >
          <PlusIcon data-icon="inline-start" />
          {{ t('settings.provider.models.addButton') }}
        </Button>
      </template>
    </SettingsSearchBar>

    <div
      v-if="!draft.models.length"
      class="rounded-lg border px-3 py-4 text-sm text-muted-foreground"
    >
      {{ t('settings.provider.models.empty') }}
    </div>

    <div
      v-else-if="!filteredModels.length"
      class="rounded-lg border px-3 py-4 text-sm text-muted-foreground"
    >
      {{ t('settings.provider.models.noResults', { query: searchQuery }) }}
    </div>

    <ProviderModelItem
      v-for="{ model, index } in filteredModels"
      :key="model.localKey"
      :model="model"
      :index="index"
      :open="isModelOpen(model)"
      @update:open="setModelOpen(model, $event)"
      @remove="emit('remove-model', index)"
      @set-optional-number="(key, value) => emit('set-optional-number', model, key, value)"
      @update-model-input="(input, checked) => emit('update-model-input', model, input, checked)"
    />
  </div>
</template>

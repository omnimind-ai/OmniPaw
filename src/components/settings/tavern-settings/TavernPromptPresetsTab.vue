<script setup lang="ts">
import type { TavernPromptPreset } from '@shared/types/tavern'
import { PencilIcon, PlusIcon, ScrollTextIcon, Trash2Icon } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsPanelItem from '@/components/settings/common/SettingsPanelItem.vue'
import SettingsSearchBar from '@/components/settings/common/SettingsSearchBar.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const { t } = useI18n()

const props = defineProps<{
  promptPresets: TavernPromptPreset[]
  createPromptPreset: () => void
  editPromptPreset: (preset: TavernPromptPreset) => void
  deletePromptPreset: (preset: TavernPromptPreset) => void
}>()

const searchQuery = ref('')
const filteredPromptPresets = computed(() => {
  const query = normalizeSearchText(searchQuery.value)
  if (!query) return props.promptPresets
  return props.promptPresets.filter((preset) => {
    const searchable = [
      preset.name,
      preset.description,
      preset.slots.map((slot) => `${slot.label} ${slot.text}`).join(' '),
    ].join(' ')
    return normalizeSearchText(searchable).includes(query)
  })
})
const searchEmpty = computed(
  () => props.promptPresets.length > 0 && filteredPromptPresets.value.length === 0
)

function normalizeSearchText(value: string) {
  return value.trim().toLocaleLowerCase()
}

function clearSearch() {
  searchQuery.value = ''
}
</script>

<template>
  <div class="flex min-h-full flex-1 flex-col">
    <SettingsSearchBar
      v-model="searchQuery"
      class="-mx-4 -mt-4 border-b-0 sm:-mx-5"
      :label="t('settings.tavern.presetsTab.searchLabel')"
      :placeholder="t('settings.tavern.presetsTab.searchPlaceholder')"
      :clear-label="t('settings.tavern.presetsTab.clearLabel')"
      @clear="clearSearch"
    >
      <template #summary>
        <Badge variant="secondary">{{ t('settings.tavern.presetsTab.presetCountBadge', { count: promptPresets.length }) }}</Badge>
      </template>
      <template #actions>
        <Button
          type="button"
          @click="createPromptPreset"
        >
          <PlusIcon data-icon="inline-start" />
          {{ t('settings.tavern.presetsTab.createButton') }}
        </Button>
      </template>
    </SettingsSearchBar>

    <div class="flex min-h-0 flex-1 flex-col gap-3 py-4">
      <p
        v-if="!promptPresets.length"
        class="flex flex-1 items-center justify-center rounded-md border border-dashed px-3 py-10 text-center text-sm text-muted-foreground"
      >
        {{ t('settings.tavern.presetsTab.emptyStateTitle') }}
      </p>

      <div
        v-else-if="searchEmpty"
        class="flex flex-1 flex-col items-center justify-center gap-3 rounded-md border border-dashed px-3 py-10 text-center text-sm text-muted-foreground"
      >
        <p>{{ t('settings.tavern.presetsTab.noMatchTitle') }}</p>
        <Button
          type="button"
          variant="outline"
          @click="clearSearch"
        >
          {{ t('settings.tavern.presetsTab.clearSearchButton') }}
        </Button>
      </div>

      <div
        v-else
        class="flex flex-col gap-3"
      >
        <SettingsPanelItem
          v-for="preset in filteredPromptPresets"
          :key="preset.id"
          :title="preset.name"
          :description="preset.description"
          :icon="ScrollTextIcon"
        >
          <template #badges>
            <Badge variant="outline">{{ t('settings.tavern.presetsTab.slotCountBadge', { count: preset.slots.length }) }}</Badge>
            <Badge
              v-if="!preset.enabled"
              variant="secondary"
            >
              {{ t('settings.tavern.presetsTab.disabledBadge') }}
            </Badge>
          </template>

          <template #actions>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              @click="editPromptPreset(preset)"
            >
              <PencilIcon data-icon="inline-start" />
              {{ t('settings.tavern.presetsTab.editButton') }}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              :aria-label="t('settings.tavern.presetsTab.deleteAriaLabel')"
              @click="deletePromptPreset(preset)"
            >
              <Trash2Icon data-icon />
            </Button>
          </template>
        </SettingsPanelItem>
      </div>
    </div>
  </div>
</template>

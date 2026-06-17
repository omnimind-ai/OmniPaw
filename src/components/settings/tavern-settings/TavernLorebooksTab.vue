<script setup lang="ts">
import type { TavernLorebook } from '@shared/types/tavern'
import { BookOpenIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsPanelItem from '@/components/settings/common/SettingsPanelItem.vue'
import SettingsSearchBar from '@/components/settings/common/SettingsSearchBar.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const { t } = useI18n()

const props = defineProps<{
  lorebooks: TavernLorebook[]
  createLorebook: () => void
  editLorebook: (lorebook: TavernLorebook) => void
  deleteLorebook: (lorebook: TavernLorebook) => void
}>()

const searchQuery = ref('')
const filteredLorebooks = computed(() => {
  const query = normalizeSearchText(searchQuery.value)
  if (!query) return props.lorebooks
  return props.lorebooks.filter((lorebook) => {
    const searchable = [
      lorebook.name,
      lorebook.description,
      lorebook.entries.map((entry) => `${entry.keys.join(' ')} ${entry.content}`).join(' '),
    ].join(' ')
    return normalizeSearchText(searchable).includes(query)
  })
})
const searchEmpty = computed(
  () => props.lorebooks.length > 0 && filteredLorebooks.value.length === 0
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
      :label="t('settings.tavern.lorebooksTab.searchLabel')"
      :placeholder="t('settings.tavern.lorebooksTab.searchPlaceholder')"
      :clear-label="t('settings.tavern.lorebooksTab.clearSearchLabel')"
      @clear="clearSearch"
    >
      <template #summary>
        <Badge variant="secondary">{{ t('settings.tavern.lorebooksTab.totalBadge', { count: lorebooks.length }) }}</Badge>
      </template>
      <template #actions>
        <Button
          type="button"
          @click="createLorebook"
        >
          <PlusIcon data-icon="inline-start" />
          {{ t('settings.tavern.lorebooksTab.createButton') }}
        </Button>
      </template>
    </SettingsSearchBar>

    <div class="flex min-h-0 flex-1 flex-col gap-3 py-4">
      <p
        v-if="!lorebooks.length"
        class="flex flex-1 items-center justify-center rounded-md border border-dashed px-3 py-10 text-center text-sm text-muted-foreground"
      >
        {{ t('settings.tavern.lorebooksTab.emptyMessage') }}
      </p>

      <div
        v-else-if="searchEmpty"
        class="flex flex-1 flex-col items-center justify-center gap-3 rounded-md border border-dashed px-3 py-10 text-center text-sm text-muted-foreground"
      >
        <p>{{ t('settings.tavern.lorebooksTab.noMatchMessage') }}</p>
        <Button
          type="button"
          variant="outline"
          @click="clearSearch"
        >
          {{ t('settings.tavern.lorebooksTab.clearSearchButton') }}
        </Button>
      </div>

      <div
        v-else
        class="flex flex-col gap-3"
      >
        <SettingsPanelItem
          v-for="lorebook in filteredLorebooks"
          :key="lorebook.id"
          :title="lorebook.name"
          :description="lorebook.description"
          :icon="BookOpenIcon"
        >
          <template #badges>
            <Badge variant="outline">{{ t('settings.tavern.lorebooksTab.entryCountBadge', { count: lorebook.entries.length }) }}</Badge>
          </template>

          <template #actions>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              @click="editLorebook(lorebook)"
            >
              <PencilIcon data-icon="inline-start" />
              {{ t('settings.tavern.lorebooksTab.editButton') }}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              :aria-label="t('settings.tavern.lorebooksTab.deleteAriaLabel')"
              @click="deleteLorebook(lorebook)"
            >
              <Trash2Icon data-icon />
            </Button>
          </template>
        </SettingsPanelItem>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TavernCharacter } from '@shared/types/tavern'
import { PencilIcon, PlusIcon, Trash2Icon, UserRoundIcon } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsPanelItem from '@/components/settings/common/SettingsPanelItem.vue'
import SettingsSearchBar from '@/components/settings/common/SettingsSearchBar.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const { t } = useI18n()

const props = defineProps<{
  characters: TavernCharacter[]
  createCharacter: () => void
  editCharacter: (character: TavernCharacter) => void
  deleteCharacter: (character: TavernCharacter) => void
}>()

const searchQuery = ref('')
const filteredCharacters = computed(() => {
  const query = normalizeSearchText(searchQuery.value)
  if (!query) return props.characters
  return props.characters.filter((character) => {
    const searchable = [
      character.name,
      character.description,
      character.personality,
      character.scenario,
      character.tags.join(' '),
    ].join(' ')
    return normalizeSearchText(searchable).includes(query)
  })
})
const searchEmpty = computed(
  () => props.characters.length > 0 && filteredCharacters.value.length === 0
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
      :label="t('settings.tavern.charactersTab.searchLabel')"
      :placeholder="t('settings.tavern.charactersTab.searchPlaceholder')"
      :clear-label="t('settings.tavern.charactersTab.clearLabel')"
      @clear="clearSearch"
    >
      <template #summary>
        <Badge variant="secondary">{{ t('settings.tavern.charactersTab.countBadge', { count: characters.length }) }}</Badge>
      </template>
      <template #actions>
        <Button
          type="button"
          @click="createCharacter"
        >
          <PlusIcon data-icon="inline-start" />
          {{ t('settings.tavern.charactersTab.createButton') }}
        </Button>
      </template>
    </SettingsSearchBar>

    <div class="flex min-h-0 flex-1 flex-col gap-3 py-4">
      <p
        v-if="!characters.length"
        class="flex flex-1 items-center justify-center rounded-md border border-dashed px-3 py-10 text-center text-sm text-muted-foreground"
      >
        {{ t('settings.tavern.charactersTab.emptyState') }}
      </p>

      <div
        v-else-if="searchEmpty"
        class="flex flex-1 flex-col items-center justify-center gap-3 rounded-md border border-dashed px-3 py-10 text-center text-sm text-muted-foreground"
      >
        <p>{{ t('settings.tavern.charactersTab.noMatch') }}</p>
        <Button
          type="button"
          variant="outline"
          @click="clearSearch"
        >
          {{ t('settings.tavern.charactersTab.clearSearchButton') }}
        </Button>
      </div>

      <div
        v-else
        class="flex flex-col gap-3"
      >
        <SettingsPanelItem
          v-for="character in filteredCharacters"
          :key="character.id"
          :title="character.name"
          :description="character.description"
          :icon="UserRoundIcon"
        >
          <template #badges>
            <Badge
              v-if="character.defaultLorebookIds.length"
              variant="outline"
            >
              {{ t('settings.tavern.charactersTab.lorebookBadge', { count: character.defaultLorebookIds.length }) }}
            </Badge>
          </template>

          <template #actions>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              @click="editCharacter(character)"
            >
              <PencilIcon data-icon="inline-start" />
              {{ t('settings.tavern.charactersTab.editButton') }}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              :aria-label="t('settings.tavern.charactersTab.deleteAriaLabel')"
              @click="deleteCharacter(character)"
            >
              <Trash2Icon data-icon />
            </Button>
          </template>
        </SettingsPanelItem>
      </div>
    </div>
  </div>
</template>

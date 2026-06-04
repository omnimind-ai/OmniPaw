<script setup lang="ts">
import type { TavernCharacter } from '@shared/types/tavern'
import { PencilIcon, PlusIcon, Trash2Icon, UserRoundIcon } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import SettingsPanelItem from '@/components/settings/SettingsPanelItem.vue'
import SettingsSearchBar from '@/components/settings/SettingsSearchBar.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

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
      label="搜索角色"
      placeholder="搜索角色名称、描述或标签"
      clear-label="清除角色搜索"
      @clear="clearSearch"
    >
      <template #summary>
        <Badge variant="secondary">{{ characters.length }} 个角色</Badge>
      </template>
      <template #actions>
        <Button
          type="button"
          @click="createCharacter"
        >
          <PlusIcon data-icon="inline-start" />
          新建角色
        </Button>
      </template>
    </SettingsSearchBar>

    <div class="flex min-h-0 flex-1 flex-col gap-3 py-4">
      <p
        v-if="!characters.length"
        class="flex flex-1 items-center justify-center rounded-md border border-dashed px-3 py-10 text-center text-sm text-muted-foreground"
      >
        暂无角色
      </p>

      <div
        v-else-if="searchEmpty"
        class="flex flex-1 flex-col items-center justify-center gap-3 rounded-md border border-dashed px-3 py-10 text-center text-sm text-muted-foreground"
      >
        <p>没有匹配的角色。</p>
        <Button
          type="button"
          variant="outline"
          @click="clearSearch"
        >
          清空搜索
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
              世界书 {{ character.defaultLorebookIds.length }}
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
              编辑
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="删除角色"
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

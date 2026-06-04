<script setup lang="ts">
import type { TavernLorebook } from '@shared/types/tavern'
import { BookOpenIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import SettingsPanelItem from '@/components/settings/common/SettingsPanelItem.vue'
import SettingsSearchBar from '@/components/settings/common/SettingsSearchBar.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

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
      label="搜索世界书"
      placeholder="搜索世界书名称、描述或条目"
      clear-label="清除世界书搜索"
      @clear="clearSearch"
    >
      <template #summary>
        <Badge variant="secondary">{{ lorebooks.length }} 本世界书</Badge>
      </template>
      <template #actions>
        <Button
          type="button"
          @click="createLorebook"
        >
          <PlusIcon data-icon="inline-start" />
          新建世界书
        </Button>
      </template>
    </SettingsSearchBar>

    <div class="flex min-h-0 flex-1 flex-col gap-3 py-4">
      <p
        v-if="!lorebooks.length"
        class="flex flex-1 items-center justify-center rounded-md border border-dashed px-3 py-10 text-center text-sm text-muted-foreground"
      >
        暂无世界书
      </p>

      <div
        v-else-if="searchEmpty"
        class="flex flex-1 flex-col items-center justify-center gap-3 rounded-md border border-dashed px-3 py-10 text-center text-sm text-muted-foreground"
      >
        <p>没有匹配的世界书。</p>
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
          v-for="lorebook in filteredLorebooks"
          :key="lorebook.id"
          :title="lorebook.name"
          :description="lorebook.description"
          :icon="BookOpenIcon"
        >
          <template #badges>
            <Badge variant="outline">{{ lorebook.entries.length }} 条</Badge>
          </template>

          <template #actions>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              @click="editLorebook(lorebook)"
            >
              <PencilIcon data-icon="inline-start" />
              编辑
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="删除世界书"
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

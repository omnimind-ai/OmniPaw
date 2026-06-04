<script setup lang="ts">
import type { TavernPromptPreset } from '@shared/types/tavern'
import { PencilIcon, PlusIcon, ScrollTextIcon, Trash2Icon } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import SettingsPanelItem from '@/components/settings/SettingsPanelItem.vue'
import SettingsSearchBar from '@/components/settings/SettingsSearchBar.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

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
      label="搜索 preset"
      placeholder="搜索 preset 名称、描述或提示词"
      clear-label="清除 preset 搜索"
      @clear="clearSearch"
    >
      <template #summary>
        <Badge variant="secondary">{{ promptPresets.length }} 个 preset</Badge>
      </template>
      <template #actions>
        <Button
          type="button"
          @click="createPromptPreset"
        >
          <PlusIcon data-icon="inline-start" />
          新建 preset
        </Button>
      </template>
    </SettingsSearchBar>

    <div class="flex min-h-0 flex-1 flex-col gap-3 py-4">
      <p
        v-if="!promptPresets.length"
        class="flex flex-1 items-center justify-center rounded-md border border-dashed px-3 py-10 text-center text-sm text-muted-foreground"
      >
        暂无 prompt preset
      </p>

      <div
        v-else-if="searchEmpty"
        class="flex flex-1 flex-col items-center justify-center gap-3 rounded-md border border-dashed px-3 py-10 text-center text-sm text-muted-foreground"
      >
        <p>没有匹配的 preset。</p>
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
          v-for="preset in filteredPromptPresets"
          :key="preset.id"
          :title="preset.name"
          :description="preset.description"
          :icon="ScrollTextIcon"
        >
          <template #badges>
            <Badge variant="outline">{{ preset.slots.length }} 段</Badge>
            <Badge
              v-if="!preset.enabled"
              variant="secondary"
            >
              禁用
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
              编辑
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="删除 prompt preset"
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

<script setup lang="ts">
import { DramaIcon } from 'lucide-vue-next'
import { computed } from 'vue'
import { useChatWorkspaceContext } from '@/components/chat/chat-workspace-context'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const {
  activeTavernMetadata,
  activeTavernCharacter,
  activeTavernLorebookNames,
  activeTavernGreetingOptions,
  activeTavernCanReplaceGreeting,
  handleTavernGreetingChange,
} = useChatWorkspaceContext()

const selectedGreeting = computed(() =>
  String(activeTavernMetadata.value?.selectedGreetingIndex ?? 0)
)
const characterName = computed(
  () => activeTavernCharacter.value?.name || activeTavernMetadata.value?.characterName || '角色缺失'
)
const lorebookLabel = computed(() => {
  if (!activeTavernLorebookNames.value.length) return '未绑定世界书'
  return activeTavernLorebookNames.value.join(' / ')
})
</script>

<template>
  <div
    v-if="activeTavernMetadata?.enabled"
    class="flex min-h-11 flex-wrap items-center justify-between gap-3 border-b px-4 py-2 text-sm"
  >
    <div class="flex min-w-0 flex-wrap items-center gap-2">
      <DramaIcon class="shrink-0" />
      <span class="truncate font-medium">{{ characterName }}</span>
      <Badge variant="outline">{{ lorebookLabel }}</Badge>
    </div>

    <Select
      v-if="activeTavernCanReplaceGreeting && activeTavernGreetingOptions.length > 1"
      :model-value="selectedGreeting"
      @update:model-value="handleTavernGreetingChange"
    >
      <SelectTrigger class="w-44">
        <SelectValue placeholder="开场白" />
      </SelectTrigger>
      <SelectContent align="end">
        <SelectGroup>
          <SelectItem
            v-for="option in activeTavernGreetingOptions"
            :key="option.index"
            :value="String(option.index)"
          >
            {{ option.label }}
          </SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  </div>
</template>

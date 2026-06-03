<script setup lang="ts">
import { DramaIcon } from 'lucide-vue-next'
import { computed } from 'vue'
import { useChatWorkspaceContext } from '@/components/chat/chat-workspace-context'
import { Badge } from '@/components/ui/badge'

const {
  activeTavernMetadata,
  activeTavernCharacter,
  activeTavernLorebookNames,
  activeTavernPromptPreset,
  activeTavernUserProfile,
} = useChatWorkspaceContext()

const characterName = computed(
  () => activeTavernCharacter.value?.name || activeTavernMetadata.value?.characterName || '角色缺失'
)
const lorebookLabel = computed(() => {
  if (!activeTavernLorebookNames.value.length) return '未绑定世界书'
  return activeTavernLorebookNames.value.join(' / ')
})
const promptPresetLabel = computed(() => activeTavernPromptPreset.value?.name || '无 preset')
const userProfileLabel = computed(() => activeTavernUserProfile.value?.name || '无酒馆用户')
</script>

<template>
  <div
    v-if="activeTavernMetadata?.enabled"
    class="flex h-10 shrink-0 items-center gap-2 border-b px-4 text-sm"
  >
    <DramaIcon class="shrink-0" />
    <span class="min-w-0 truncate font-medium">{{ characterName }}</span>
    <Badge variant="outline">{{ lorebookLabel }}</Badge>
    <Badge
      variant="secondary"
      class="hidden sm:inline-flex"
    >
      {{ promptPresetLabel }}
    </Badge>
    <Badge
      variant="secondary"
      class="hidden sm:inline-flex"
    >
      {{ userProfileLabel }}
    </Badge>
  </div>
</template>

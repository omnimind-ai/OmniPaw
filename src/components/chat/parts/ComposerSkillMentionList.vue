<script setup lang="ts">
import { BoxIcon } from '@lucide/vue'
import type { LocalSkillSummary } from '@shared/types/skill'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'

defineProps<{
  skills: LocalSkillSummary[]
  disabled?: boolean
}>()

const emit = defineEmits<{
  remove: [skillId: string]
}>()

const { t } = useI18n()
</script>

<template>
  <div
    class="flex max-w-full flex-wrap items-center gap-1"
    role="list"
    :aria-label="t('chat.composer.skillMentionsAria')"
  >
    <Button
      v-for="skill in skills"
      :key="skill.id"
      type="button"
      variant="ghost"
      size="sm"
      class="h-7 max-w-64 shrink-0 gap-1 px-1 font-semibold text-prompt-blue hover:text-prompt-blue"
      role="listitem"
      :disabled="disabled"
      :aria-label="t('chat.composer.removeSkillMentionAria', { skill: skill.name || skill.id })"
      @mousedown.prevent
      @click="emit('remove', skill.id)"
    >
      <BoxIcon data-icon="inline-start" />
      <span class="truncate">{{ skill.name || skill.id }}</span>
    </Button>
  </div>
</template>

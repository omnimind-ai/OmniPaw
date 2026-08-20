<script setup lang="ts">
import { BoxIcon, XIcon } from '@lucide/vue'
import type { LocalSkillSummary } from '@shared/types/skill'
import { useI18n } from 'vue-i18n'
import { Badge } from '@/components/ui/badge'
import { InputGroupButton } from '@/components/ui/input-group'

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
    class="flex w-full flex-wrap items-center gap-1.5 px-2.5 pt-2"
    role="list"
    :aria-label="t('chat.composer.skillMentionsAria')"
  >
    <Badge
      v-for="skill in skills"
      :key="skill.id"
      variant="secondary"
      class="h-7 gap-1.5 rounded-md py-1 pl-2 pr-0.5 text-sm shadow-xs"
      role="listitem"
    >
      <BoxIcon data-icon="inline-start" />
      <span class="max-w-56 truncate">{{ skill.name || skill.id }}</span>
      <InputGroupButton
        size="icon-xs"
        :disabled="disabled"
        :aria-label="t('chat.composer.removeSkillMentionAria', { skill: skill.name || skill.id })"
        @mousedown.prevent
        @click="emit('remove', skill.id)"
      >
        <XIcon data-icon="inline-start" />
      </InputGroupButton>
    </Badge>
  </div>
</template>

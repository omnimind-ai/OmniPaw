<script setup lang="ts">
import { BoxIcon, PlugIcon } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import type { ChatCapabilityMention } from '../chat-slash-menu'

defineProps<{
  mentions: ChatCapabilityMention[]
  disabled?: boolean
}>()

const emit = defineEmits<{
  remove: [mention: ChatCapabilityMention]
}>()

const { t } = useI18n()
</script>

<template>
  <div
    class="flex max-w-full translate-y-0.5 flex-wrap items-center gap-1"
    role="list"
    :aria-label="t('chat.composer.capabilityMentionsAria')"
  >
    <Button
      v-for="mention in mentions"
      :key="mention.key"
      type="button"
      variant="ghost"
      size="sm"
      class="h-6 max-w-64 shrink-0 gap-1 px-1 text-base font-semibold leading-6 text-prompt-blue hover:bg-transparent hover:text-prompt-blue md:h-5 md:text-sm md:leading-5"
      role="listitem"
      :disabled="disabled"
      :aria-label="t('chat.composer.removeCapabilityMentionAria', { capability: mention.label })"
      @mousedown.prevent
      @click="emit('remove', mention)"
    >
      <BoxIcon
        v-if="mention.kind === 'skill'"
        data-icon="inline-start"
      />
      <PlugIcon
        v-else
        data-icon="inline-start"
      />
      <span class="truncate">{{ mention.label }}</span>
    </Button>
  </div>
</template>

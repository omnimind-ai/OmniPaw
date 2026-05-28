<script setup lang="ts">
import type { MessagePart } from '@/composables/useMessages'
import { cn } from '@/lib/utils'
import type { RefItem } from '../chat-display'
import MessagePartRenderer from './MessagePartRenderer.vue'

defineProps<{
  parts: MessagePart[]
  user?: boolean
}>()

const emit = defineEmits<{
  jumpMessage: [messageId: string]
  openRefs: [refs: RefItem[]]
  copyCode: [code: string]
}>()
</script>

<template>
  <div :class="cn('flex max-w-full flex-wrap gap-2', user ? 'justify-end' : 'justify-start')">
    <MessagePartRenderer
      v-for="(part, partIndex) in parts"
      :key="`${part.type}-${partIndex}`"
      :part="part"
      :user="user"
      compact-attachment
      @jump-message="emit('jumpMessage', $event)"
      @open-refs="emit('openRefs', $event)"
      @copy-code="emit('copyCode', $event)"
    />
  </div>
</template>

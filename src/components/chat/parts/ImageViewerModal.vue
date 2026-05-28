<script setup lang="ts">
import { computed } from 'vue'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  src: string
  title?: string
  alt?: string
}>()

const titleText = computed(() => props.title || props.alt || '图片预览')
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[calc(100vh-2rem)] overflow-hidden p-3 sm:max-w-[min(92vw,72rem)]">
      <DialogHeader class="pr-8">
        <DialogTitle class="truncate">
          {{ titleText }}
        </DialogTitle>
      </DialogHeader>

      <div class="min-h-0 overflow-auto rounded-lg bg-muted/40">
        <img
          :src="src"
          :alt="alt || titleText"
          class="mx-auto max-h-[calc(100vh-8rem)] max-w-full object-contain"
        >
      </div>
    </DialogContent>
  </Dialog>
</template>

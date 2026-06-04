<script setup lang="ts">
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'

defineProps<{
  open: boolean
  title: string
  description: string
}>()

defineEmits<{
  'update:open': [value: boolean]
}>()
</script>

<template>
  <Dialog
    :open="open"
    @update:open="$emit('update:open', $event)"
  >
    <DialogContent
      class="grid h-[calc(100vh-2rem)] max-h-[900px] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden p-0 sm:max-w-4xl"
    >
      <DialogHeader class="border-b px-5 py-4">
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription>{{ description }}</DialogDescription>
      </DialogHeader>

      <ScrollArea class="min-h-0">
        <div class="px-5 py-4">
          <slot />
        </div>
      </ScrollArea>

      <div class="flex shrink-0 justify-end border-t bg-background px-5 py-4">
        <slot name="footer" />
      </div>
    </DialogContent>
  </Dialog>
</template>

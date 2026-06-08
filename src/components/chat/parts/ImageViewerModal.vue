<script setup lang="ts">
import { XIcon } from 'lucide-vue-next'
import { DialogClose, DialogContent, DialogOverlay, DialogPortal, DialogTitle } from 'reka-ui'
import { computed } from 'vue'

import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  src: string
  title?: string
  alt?: string
}>()

const titleText = computed(() => props.title || props.alt || '图片预览')

function closeViewer() {
  open.value = false
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogPortal>
      <DialogOverlay
        class="fixed inset-x-0 bottom-0 isolate z-50 bg-transparent duration-100 data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0 supports-backdrop-filter:backdrop-blur-md"
        style="top: var(--app-topbar-height)"
      />
      <DialogContent
        class="fixed inset-x-0 bottom-0 z-50 flex min-h-0 flex-col overflow-hidden bg-transparent p-0 outline-none duration-100 data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0"
        style="top: var(--app-topbar-height)"
      >
        <DialogTitle class="sr-only">
          {{ titleText }}
        </DialogTitle>

        <div class="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <p class="pointer-events-auto min-w-0 truncate text-sm font-medium text-foreground">
            {{ titleText }}
          </p>

          <DialogClose as-child>
            <Button
              type="button"
              variant="outline"
              size="icon"
              class="pointer-events-auto rounded-full bg-background/80 shadow-sm backdrop-blur-md hover:bg-background"
              aria-label="关闭图片预览"
            >
              <XIcon />
              <span class="sr-only">关闭图片预览</span>
            </Button>
          </DialogClose>
        </div>

        <div
          class="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4 pt-16 sm:p-8 sm:pt-16"
          @click.self="closeViewer"
        >
          <img
            :src="src"
            :alt="alt || titleText"
            class="max-h-[calc(100svh-var(--app-topbar-height)-6rem)] max-w-full object-contain"
          >
        </div>
      </DialogContent>
    </DialogPortal>
  </Dialog>
</template>

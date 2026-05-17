<script setup lang="ts">
import { ExternalLinkIcon, XIcon } from 'lucide-vue-next'

import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import type { RefItem } from './chat-display'

defineProps<{
  open: boolean
  refs: RefItem[]
}>()

const emit = defineEmits<{
  'update:open': [open: boolean]
}>()
</script>

<template>
  <Sheet
    :open="open"
    @update:open="emit('update:open', $event)"
  >
    <SheetContent class="flex flex-col gap-4">
      <SheetHeader>
        <SheetTitle>引用来源</SheetTitle>
      </SheetHeader>

      <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
        <article
          v-for="refItem in refs"
          :key="refItem.id"
          class="flex flex-col gap-2 rounded-md border p-3"
        >
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <h3 class="truncate text-sm font-medium">
                {{ refItem.title || refItem.url || refItem.id }}
              </h3>
              <p
                v-if="refItem.url"
                class="truncate text-xs text-muted-foreground"
              >
                {{ refItem.url }}
              </p>
            </div>
            <a
              v-if="refItem.url"
              :href="refItem.url"
              target="_blank"
              rel="noreferrer"
              class="shrink-0"
            >
              <ExternalLinkIcon aria-hidden="true" />
              <span class="sr-only">打开引用来源</span>
            </a>
          </div>
          <p
            v-if="refItem.snippet"
            class="text-sm leading-6 text-muted-foreground"
          >
            {{ refItem.snippet }}
          </p>
        </article>

        <div
          v-if="!refs.length"
          class="flex flex-1 items-center justify-center rounded-md border border-dashed p-6 text-sm text-muted-foreground"
        >
          当前消息没有引用来源。
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        @click="emit('update:open', false)"
      >
        <XIcon data-icon="inline-start" />
        关闭
      </Button>
    </SheetContent>
  </Sheet>
</template>

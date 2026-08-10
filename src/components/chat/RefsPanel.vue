<script setup lang="ts">
import { ExternalLinkIcon, XIcon } from '@lucide/vue'
import { useI18n } from 'vue-i18n'

import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { type RefItem, refHostname } from './chat-display'

defineProps<{
  open: boolean
  refs: RefItem[]
}>()

const emit = defineEmits<{
  'update:open': [open: boolean]
}>()

const { t } = useI18n()
</script>

<template>
  <Sheet
    :open="open"
    @update:open="emit('update:open', $event)"
  >
    <SheetContent class="flex flex-col gap-4">
      <SheetHeader>
        <SheetTitle>{{ t('chat.references.title') }}</SheetTitle>
      </SheetHeader>

      <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
        <article
          v-for="refItem in refs"
          :key="refItem.id"
          class="flex flex-col gap-2 rounded-md border p-3"
        >
          <div class="flex items-start justify-between gap-2">
            <img
              v-if="refItem.favicon"
              :src="refItem.favicon"
              alt=""
              class="size-8 shrink-0 rounded-md border bg-background object-cover"
            >
            <div class="min-w-0 flex-1">
              <h3 class="truncate text-sm font-medium">
                {{ refItem.title || refItem.url || refItem.id }}
              </h3>
              <p
                v-if="refItem.url"
                class="truncate text-xs text-muted-foreground"
              >
                {{ refHostname(refItem.url) || refItem.url }}
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
              <span class="sr-only">{{ t('chat.references.open') }}</span>
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
          {{ t('chat.references.empty') }}
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        @click="emit('update:open', false)"
      >
        <XIcon data-icon="inline-start" />
        {{ t('chat.references.close') }}
      </Button>
    </SheetContent>
  </Sheet>
</template>

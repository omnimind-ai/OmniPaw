<script setup lang="ts">
import { ExternalLinkIcon } from '@lucide/vue'
import type { CSSProperties } from 'vue'
import { useI18n } from 'vue-i18n'

import { type RefItem, refHostname } from '@/components/chat/chat-display'
import SiteAvatar from '@/components/chat/SiteAvatar.vue'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

defineProps<{
  descriptionId: string
  open: boolean
  position: CSSProperties
  refItem?: RefItem
}>()

const emit = defineEmits<{
  pointerEnter: []
  pointerLeave: []
}>()

const { t } = useI18n()
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="scale-[0.98] opacity-0"
      leave-active-class="transition duration-100 ease-in"
      leave-to-class="scale-[0.98] opacity-0"
    >
      <a
        v-if="open && refItem?.url"
        :id="descriptionId"
        class="fixed z-50 block overflow-hidden origin-[var(--preview-transform-origin)] text-left text-card-foreground no-underline outline-none"
        :href="refItem.url"
        target="_blank"
        rel="noopener noreferrer"
        :aria-label="`${t('chat.references.open')}: ${refItem.title || refItem.url}`"
        :style="position"
        data-web-ref-preview
        @pointerenter="emit('pointerEnter')"
        @pointerleave="emit('pointerLeave')"
      >
        <Card
          size="sm"
          class="gap-2 overflow-hidden bg-popover/95 py-3 text-popover-foreground shadow-xl backdrop-blur-md transition-colors hover:bg-popover"
        >
          <CardHeader class="gap-2.5 px-3">
            <div class="flex min-w-0 items-center gap-2">
              <SiteAvatar
                :ref-item="refItem"
                size="sm"
              />
              <span class="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">
                {{ refHostname(refItem.url) || refItem.url }}
              </span>
              <ExternalLinkIcon
                class="size-3.5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            </div>
            <CardTitle class="line-clamp-2 text-[0.94rem] leading-5">
              {{ refItem.title || refHostname(refItem.url) || refItem.url }}
            </CardTitle>
          </CardHeader>
          <CardContent
            v-if="refItem.snippet"
            class="px-3"
          >
            <CardDescription class="line-clamp-3 text-xs leading-5">
              {{ refItem.snippet }}
            </CardDescription>
          </CardContent>
        </Card>
      </a>
    </Transition>
  </Teleport>
</template>

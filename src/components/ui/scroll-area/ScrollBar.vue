<script setup lang="ts">
import { reactiveOmit } from '@vueuse/core'
import type { ScrollAreaScrollbarProps } from 'reka-ui'
import { ScrollAreaScrollbar, ScrollAreaThumb } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

const props = withDefaults(
  defineProps<ScrollAreaScrollbarProps & { class?: HTMLAttributes['class'] }>(),
  {
    orientation: 'vertical',
  }
)

const delegatedProps = reactiveOmit(props, 'class')
</script>

<template>
  <ScrollAreaScrollbar
    data-slot="scroll-area-scrollbar"
    :data-orientation="orientation"
    v-bind="delegatedProps"
    :class="cn('data-horizontal:h-1.5 data-horizontal:flex-col data-vertical:h-full data-vertical:w-1.5 flex touch-none transition-colors select-none', props.class)"
  >
    <ScrollAreaThumb
      data-slot="scroll-area-thumb"
      class="rounded-full relative flex-1 bg-foreground/25 hover:bg-foreground/40 transition-colors"
    />
  </ScrollAreaScrollbar>
</template>

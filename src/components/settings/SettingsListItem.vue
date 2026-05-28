<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { cn } from '@/lib/utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <li :class="cn('flex flex-col gap-3 border-b px-4 py-4 last:border-b-0', props.class)">
    <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div class="flex min-w-0 flex-1 flex-col gap-2">
        <div class="flex min-w-0 flex-wrap items-center gap-2">
          <h3 class="truncate text-sm font-medium">
            <slot name="title" />
          </h3>
          <slot name="badges" />
        </div>

        <slot name="meta" />
      </div>

      <div
        v-if="$slots.actions"
        class="flex shrink-0 flex-wrap items-center gap-2"
      >
        <slot name="actions" />
      </div>
    </div>

    <slot />
  </li>
</template>

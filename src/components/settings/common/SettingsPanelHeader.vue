<script setup lang="ts">
import type { Component, HTMLAttributes } from 'vue'

import { CardAction, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const props = defineProps<{
  title: string
  description?: string
  icon?: Component
  class?: HTMLAttributes['class']
  titleClass?: HTMLAttributes['class']
  descriptionClass?: HTMLAttributes['class']
  iconClass?: HTMLAttributes['class']
}>()
</script>

<template>
  <CardHeader :class="cn('relative isolate flex min-h-28 overflow-hidden border-b px-4 pt-8 pb-4 sm:px-5', props.class)">
    <component
      :is="icon"
      v-if="icon"
      :class="cn('pointer-events-none absolute -right-3 -bottom-5 z-0 size-28 -rotate-6 text-primary opacity-10', iconClass)"
      aria-hidden="true"
    />
    <div class="relative z-10 flex w-full min-w-0 items-end justify-between gap-4">
      <div class="flex min-w-0 max-w-3xl flex-col gap-1">
        <CardTitle :class="cn('truncate text-2xl leading-tight font-semibold text-foreground', titleClass)">
          {{ title }}
        </CardTitle>
        <p
          v-if="description || $slots.description"
          :class="cn('line-clamp-2 max-w-2xl text-sm leading-5 text-muted-foreground', descriptionClass)"
        >
          <slot name="description">
            {{ description }}
          </slot>
        </p>
      </div>
      <CardAction
        v-if="$slots.action"
        class="relative z-20 shrink-0 self-end"
      >
        <slot name="action" />
      </CardAction>
    </div>
  </CardHeader>
</template>

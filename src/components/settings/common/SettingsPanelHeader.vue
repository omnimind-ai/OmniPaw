<script setup lang="ts">
import type { Component, HTMLAttributes } from 'vue'

import { CardAction, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const props = defineProps<{
  title: string
  icon?: Component
  class?: HTMLAttributes['class']
  titleClass?: HTMLAttributes['class']
  iconClass?: HTMLAttributes['class']
}>()
</script>

<template>
  <CardHeader
    :class="cn(
      'relative isolate !flex min-h-20 items-center overflow-hidden border-b px-4 py-3.5 sm:px-5',
      props.class,
    )"
  >
    <component
      :is="icon"
      v-if="icon"
      :class="cn('pointer-events-none absolute -right-1 -bottom-2 z-0 size-20 -rotate-6 text-primary opacity-[0.07]', iconClass)"
      aria-hidden="true"
    />
    <div class="relative z-10 flex w-full min-w-0 items-center justify-between gap-4">
      <div class="min-w-0">
        <CardTitle :class="cn('truncate text-2xl leading-tight font-semibold tracking-tight text-foreground', titleClass)">
          {{ title }}
        </CardTitle>
      </div>
      <CardAction
        v-if="$slots.action"
        class="relative z-20 shrink-0 self-center"
      >
        <slot name="action" />
      </CardAction>
    </div>
  </CardHeader>
</template>

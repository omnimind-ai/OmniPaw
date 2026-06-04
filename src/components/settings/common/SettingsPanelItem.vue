<script setup lang="ts">
import type { Component, HTMLAttributes } from 'vue'

import { cn } from '@/lib/utils'

const props = defineProps<{
  title: string
  description?: string
  icon?: Component
  pending?: boolean
  class?: HTMLAttributes['class']
  avatarClass?: HTMLAttributes['class']
  contentClass?: HTMLAttributes['class']
  actionsClass?: HTMLAttributes['class']
}>()
</script>

<template>
  <div
    data-slot="settings-panel-item"
    :class="cn(
      'rounded-md border bg-background/40 px-4 py-4 transition-colors hover:bg-muted/30',
      pending && 'opacity-60',
      props.class,
    )"
  >
    <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div class="flex min-w-0 flex-1 items-start gap-3">
        <slot name="avatar">
          <div :class="cn('flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground', avatarClass)">
            <component
              :is="icon"
              v-if="icon"
              aria-hidden="true"
            />
          </div>
        </slot>

        <div :class="cn('flex min-w-0 flex-1 flex-col gap-1', contentClass)">
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <h3 class="truncate text-sm font-medium">
              {{ title }}
            </h3>
            <slot name="badges" />
          </div>

          <p
            v-if="description || $slots.description"
            class="line-clamp-2 text-sm text-muted-foreground"
          >
            <slot name="description">
              {{ description }}
            </slot>
          </p>

          <slot name="meta" />
        </div>
      </div>

      <div
        v-if="$slots.actions"
        :class="cn('flex shrink-0 flex-wrap items-center gap-2', actionsClass)"
      >
        <slot name="actions" />
      </div>
    </div>

    <slot />
  </div>
</template>

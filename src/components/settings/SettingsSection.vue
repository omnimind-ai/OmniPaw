<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'

const props = defineProps<{
  title: string
  description?: string
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <Card :class="cn('gap-0 rounded-md py-0', props.class)">
    <CardHeader class="border-b py-3">
      <CardTitle class="text-base font-semibold text-foreground">{{ title }}</CardTitle>
      <CardAction v-if="$slots.actions">
        <slot name="actions" />
      </CardAction>
      <CardDescription
        v-if="description"
        class="text-xs leading-5 text-muted-foreground"
      >
        {{ description }}
      </CardDescription>
    </CardHeader>
    <CardContent class="settings-section__content p-0">
      <slot />
    </CardContent>
  </Card>
</template>

<style scoped>
.settings-section__content :deep([data-slot="field-content"]) {
  gap: 0.25rem;
}

.settings-section__content :deep([data-slot="field-label"]:not(.text-destructive)) {
  color: var(--foreground);
  font-size: 0.875rem;
  font-weight: 650;
}

.settings-section__content :deep([data-slot="field-description"]:not(.text-destructive)) {
  color: color-mix(in oklab, var(--muted-foreground) 82%, transparent);
  font-size: 0.75rem;
  line-height: 1.25rem;
}
</style>

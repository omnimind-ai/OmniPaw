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
  contentClass?: HTMLAttributes['class']
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
    <CardContent :class="cn('p-0', props.contentClass)">
      <slot />
    </CardContent>
  </Card>
</template>

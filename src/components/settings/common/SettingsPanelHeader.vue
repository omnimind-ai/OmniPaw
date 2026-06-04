<script setup lang="ts">
import type { Component, HTMLAttributes } from 'vue'

import { CardAction, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
  <CardHeader :class="cn('border-b px-4 py-4 sm:px-5', props.class)">
    <CardTitle :class="cn('text-xl font-semibold text-foreground', titleClass)">
      {{ title }}
    </CardTitle>
    <CardDescription
      v-if="description || $slots.description"
      :class="cn('max-w-2xl text-sm leading-6 text-muted-foreground', descriptionClass)"
    >
      <slot name="description">
        {{ description }}
      </slot>
    </CardDescription>
    <CardAction v-if="icon || $slots.action">
      <slot name="action">
        <component
          :is="icon"
          v-if="icon"
          :class="cn('size-12 text-primary', iconClass)"
          aria-hidden="true"
        />
      </slot>
    </CardAction>
  </CardHeader>
</template>

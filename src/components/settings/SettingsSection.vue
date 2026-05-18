<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
      <CardTitle>{{ title }}</CardTitle>
      <CardDescription v-if="description">
        {{ description }}
      </CardDescription>
    </CardHeader>
    <CardContent class="p-0">
      <slot />
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import type { Component, HTMLAttributes } from 'vue'

import SettingsSection from '@/components/settings/SettingsSection.vue'
import { Skeleton } from '@/components/ui/skeleton'

const props = withDefaults(
  defineProps<{
    title: string
    description?: string
    lead?: string
    loading?: boolean
    showSkeleton?: boolean
    empty?: boolean
    emptyTitle: string
    emptyDescription?: string
    emptyIcon?: Component
    skeletonRows?: number
    class?: HTMLAttributes['class']
  }>(),
  {
    skeletonRows: 2,
  }
)
</script>

<template>
  <SettingsSection
    :title="title"
    :description="description"
    :class="props.class"
  >
    <template
      v-if="$slots.actions"
      #actions
    >
      <div class="flex flex-wrap justify-end gap-2">
        <slot name="actions" />
      </div>
    </template>

    <div class="flex flex-col">
      <div
        v-if="$slots.summary || lead"
        class="flex flex-col gap-2 border-b px-4 py-4"
      >
        <div
          v-if="$slots.summary"
          class="flex flex-wrap items-center gap-2"
        >
          <slot name="summary" />
        </div>
        <p
          v-if="lead"
          class="text-sm text-muted-foreground"
        >
          {{ lead }}
        </p>
      </div>

      <slot name="notices" />
      <slot name="error" />

      <div
        v-if="loading"
        class="flex flex-col gap-3 px-4 py-4"
      >
        <template v-if="showSkeleton">
          <Skeleton
            v-for="index in skeletonRows"
            :key="index"
            class="h-24 w-full"
          />
        </template>
      </div>

      <div
        v-else-if="empty"
        class="flex flex-col items-start gap-3 px-4 py-8"
      >
        <div class="flex items-center gap-2 text-sm font-medium">
          <component
            :is="emptyIcon"
            v-if="emptyIcon"
            class="text-muted-foreground"
          />
          {{ emptyTitle }}
        </div>
        <p
          v-if="emptyDescription"
          class="max-w-2xl text-sm text-muted-foreground"
        >
          {{ emptyDescription }}
        </p>
        <div
          v-if="$slots['empty-actions']"
          class="flex flex-wrap gap-2"
        >
          <slot name="empty-actions" />
        </div>
      </div>

      <ul
        v-else
        class="flex flex-col"
      >
        <slot />
      </ul>
    </div>
  </SettingsSection>
</template>

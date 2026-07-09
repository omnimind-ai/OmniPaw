<script setup lang="ts">
import type { Component, HTMLAttributes } from 'vue'

import SettingsPanelHeader from '@/components/settings/common/SettingsPanelHeader.vue'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const props = defineProps<{
  title: string
  description?: string
  icon?: Component
  class?: HTMLAttributes['class']
  headerClass?: HTMLAttributes['class']
  contentClass?: HTMLAttributes['class']
  titleClass?: HTMLAttributes['class']
  descriptionClass?: HTMLAttributes['class']
  iconClass?: HTMLAttributes['class']
}>()
</script>

<template>
  <Card :class="cn('gap-0 rounded-md py-0', props.class)">
    <SettingsPanelHeader
      :title="title"
      :description="description"
      :icon="icon"
      :class="headerClass"
      :title-class="titleClass"
      :description-class="descriptionClass"
      :icon-class="iconClass"
    >
      <template
        v-if="$slots.description"
        #description
      >
        <slot name="description" />
      </template>

      <template
        v-if="$slots.action || $slots.actions"
        #action
      >
        <div class="flex items-center gap-3">
          <slot name="action">
            <slot name="actions" />
          </slot>
        </div>
      </template>
    </SettingsPanelHeader>

    <CardContent :class="cn('p-0', props.contentClass)">
      <slot />
    </CardContent>
  </Card>
</template>

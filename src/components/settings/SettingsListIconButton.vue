<script setup lang="ts">
import type { Component, HTMLAttributes } from 'vue'

import { Button, type ButtonVariants } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

withDefaults(
  defineProps<{
    label: string
    icon: Component
    iconClass?: HTMLAttributes['class']
    disabled?: boolean
    variant?: ButtonVariants['variant']
  }>(),
  {
    variant: 'outline',
  }
)

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()
</script>

<template>
  <TooltipProvider :delay-duration="150">
    <Tooltip>
      <TooltipTrigger as-child>
        <Button
          type="button"
          size="icon-sm"
          :variant="variant"
          :disabled="disabled"
          :aria-label="label"
          @click="emit('click', $event)"
        >
          <component
            :is="icon"
            :class="iconClass"
          />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {{ label }}
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
</template>

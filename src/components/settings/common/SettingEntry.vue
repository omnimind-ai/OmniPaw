<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { Field, FieldContent, FieldDescription, FieldLabel } from '@/components/ui/field'
import { cn } from '@/lib/utils'

const props = withDefaults(
  defineProps<{
    controlId?: string
    title?: string
    description?: string
    disabled?: boolean
    class?: HTMLAttributes['class']
    contentClass?: HTMLAttributes['class']
    controlClass?: HTMLAttributes['class']
    labelClass?: HTMLAttributes['class']
    descriptionClass?: HTMLAttributes['class']
  }>(),
  {
    disabled: false,
  }
)
</script>

<template>
  <Field
    orientation="responsive"
    :data-disabled="disabled || undefined"
    :class="cn(
      'rounded-md px-3 py-2.5 transition-colors hover:bg-muted/25 focus-within:bg-muted/20',
      'data-[disabled=true]:opacity-60',
      props.class,
    )"
  >
    <FieldContent :class="cn('min-w-0 gap-0.5 @md/field-group:pr-6', contentClass)">
      <FieldLabel
        v-if="title || $slots.title"
        :for="controlId"
        :class="cn('text-sm font-semibold leading-5 text-foreground', labelClass)"
      >
        <slot name="title">
          {{ title }}
        </slot>
      </FieldLabel>

      <FieldDescription
        v-if="description || $slots.description"
        :class="cn('max-w-2xl text-xs leading-4 text-muted-foreground/80', descriptionClass)"
      >
        <slot name="description">
          {{ description }}
        </slot>
      </FieldDescription>

      <slot name="meta" />
    </FieldContent>

    <div
      v-if="$slots.default"
      :class="cn(
        'flex w-full min-w-0 items-center justify-start gap-2 @md/field-group:w-auto @md/field-group:justify-end',
        controlClass,
      )"
    >
      <slot />
    </div>
  </Field>
</template>

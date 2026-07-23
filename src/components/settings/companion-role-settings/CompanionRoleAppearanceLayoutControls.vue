<script setup lang="ts">
import type { CatAppearanceLayout } from '@shared/types/cat-appearance'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Slider } from '@/components/ui/slider'

type LayoutKey = keyof CatAppearanceLayout

const props = defineProps<{
  modelValue: CatAppearanceLayout
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [layout: CatAppearanceLayout]
}>()

const { t } = useI18n()

const scaleLabel = computed(() => `${Math.round(props.modelValue.scale * 100)}%`)

function updateLayoutValue(key: LayoutKey, values: number[] | undefined): void {
  const [value] = values ?? []
  if (value === undefined) return
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}
</script>

<template>
  <div class="flex flex-col gap-4 rounded-md border bg-muted/20 p-4">
    <div class="flex flex-wrap items-start gap-2">
      <div class="flex min-w-0 flex-col gap-1">
        <h3 class="text-sm font-medium">
          {{ t('settings.catAppearance.detail.layout.title') }}
        </h3>
      </div>
    </div>

    <FieldGroup>
      <Field :data-disabled="disabled ? '' : undefined">
        <div class="flex items-center justify-between gap-3">
          <FieldLabel for="cat-appearance-layout-scale">
            {{ t('settings.catAppearance.detail.layout.scale') }}
          </FieldLabel>
          <span class="text-xs tabular-nums text-muted-foreground">{{ scaleLabel }}</span>
        </div>
        <Slider
          id="cat-appearance-layout-scale"
          :model-value="[modelValue.scale]"
          :min="0.25"
          :max="2"
          :step="0.05"
          :disabled="disabled"
          :aria-label="t('settings.catAppearance.detail.layout.scale')"
          @update:model-value="updateLayoutValue('scale', $event)"
        />
        <FieldDescription>
          {{ t('settings.catAppearance.detail.layout.scaleRange') }}
        </FieldDescription>
      </Field>
    </FieldGroup>
  </div>
</template>

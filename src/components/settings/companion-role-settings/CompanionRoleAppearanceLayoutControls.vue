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
  readonly?: boolean
  saving?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [layout: CatAppearanceLayout]
  commit: [layout: CatAppearanceLayout]
}>()

const { t } = useI18n()

const scaleLabel = computed(() => `${Math.round(props.modelValue.scale * 100)}%`)
const offsetXLabel = computed(() => `${props.modelValue.offsetX}px`)
const offsetYLabel = computed(() => `${props.modelValue.offsetY}px`)

function updateLayoutValue(key: LayoutKey, values: number[] | undefined): void {
  const [value] = values ?? []
  if (value === undefined) return
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}

function commitLayoutValue(key: LayoutKey, values: number[]): void {
  const [value] = values
  if (value === undefined) return
  emit('commit', { ...props.modelValue, [key]: value })
}
</script>

<template>
  <div class="flex flex-col gap-4 rounded-md border bg-muted/20 p-4">
    <div class="flex flex-wrap items-start justify-between gap-2">
      <div class="flex min-w-0 flex-col gap-1">
        <h3 class="text-sm font-medium">
          {{ t('settings.catAppearance.detail.layout.title') }}
        </h3>
        <p class="text-sm text-muted-foreground">
          {{
            t(
              readonly
                ? 'settings.catAppearance.detail.layout.readonlyDescription'
                : 'settings.catAppearance.detail.layout.description'
            )
          }}
        </p>
      </div>
      <span
        v-if="saving"
        class="shrink-0 text-xs text-muted-foreground"
        aria-live="polite"
      >
        {{ t('settings.catAppearance.detail.layout.saving') }}
      </span>
    </div>

    <FieldGroup class="grid grid-cols-1 gap-4 md:grid-cols-3">
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
          @value-commit="commitLayoutValue('scale', $event)"
        />
        <FieldDescription>
          {{ t('settings.catAppearance.detail.layout.scaleRange') }}
        </FieldDescription>
      </Field>

      <Field :data-disabled="disabled ? '' : undefined">
        <div class="flex items-center justify-between gap-3">
          <FieldLabel for="cat-appearance-layout-offset-x">
            {{ t('settings.catAppearance.detail.layout.offsetX') }}
          </FieldLabel>
          <span class="text-xs tabular-nums text-muted-foreground">{{ offsetXLabel }}</span>
        </div>
        <Slider
          id="cat-appearance-layout-offset-x"
          :model-value="[modelValue.offsetX]"
          :min="-116"
          :max="116"
          :step="1"
          :disabled="disabled"
          :aria-label="t('settings.catAppearance.detail.layout.offsetX')"
          @update:model-value="updateLayoutValue('offsetX', $event)"
          @value-commit="commitLayoutValue('offsetX', $event)"
        />
        <FieldDescription>
          {{ t('settings.catAppearance.detail.layout.offsetRange') }}
        </FieldDescription>
      </Field>

      <Field :data-disabled="disabled ? '' : undefined">
        <div class="flex items-center justify-between gap-3">
          <FieldLabel for="cat-appearance-layout-offset-y">
            {{ t('settings.catAppearance.detail.layout.offsetY') }}
          </FieldLabel>
          <span class="text-xs tabular-nums text-muted-foreground">{{ offsetYLabel }}</span>
        </div>
        <Slider
          id="cat-appearance-layout-offset-y"
          :model-value="[modelValue.offsetY]"
          :min="-116"
          :max="116"
          :step="1"
          :disabled="disabled"
          :aria-label="t('settings.catAppearance.detail.layout.offsetY')"
          @update:model-value="updateLayoutValue('offsetY', $event)"
          @value-commit="commitLayoutValue('offsetY', $event)"
        />
        <FieldDescription>
          {{ t('settings.catAppearance.detail.layout.offsetRange') }}
        </FieldDescription>
      </Field>
    </FieldGroup>
  </div>
</template>

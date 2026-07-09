<script setup lang="ts">
import { PencilLineIcon } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import CompanionRoleTextEditorModal from '@/components/settings/companion-role-settings/CompanionRoleTextEditorModal.vue'
import { Button } from '@/components/ui/button'
import { Field, FieldContent, FieldDescription, FieldLabel } from '@/components/ui/field'
import { cn } from '@/lib/utils'

const props = withDefaults(
  defineProps<{
    controlId: string
    title: string
    description?: string
    placeholder?: string
    rows?: number
    previewLines?: number
  }>(),
  {
    rows: 18,
    previewLines: 3,
  }
)

const model = defineModel<string>({ required: true })

const { t } = useI18n()
const editorOpen = ref(false)
const normalizedValue = computed(() => model.value.trim())
const previewText = computed(() => normalizedValue.value || props.placeholder || '')
const isEmpty = computed(() => !normalizedValue.value)
const previewStyle = computed(() => ({
  display: '-webkit-box',
  height: `${props.previewLines * 1.5}rem`,
  overflow: 'hidden',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: props.previewLines,
}))
const hasMorePreviewContent = computed(() => {
  if (!normalizedValue.value) return false
  return (
    normalizedValue.value.split(/\r\n|\r|\n/).length > props.previewLines ||
    normalizedValue.value.length > props.previewLines * 42
  )
})

function saveEditor(value: string): void {
  model.value = value
}
</script>

<template>
  <Field class="border-b px-4 py-4 transition-colors last:border-b-0 hover:bg-muted/25">
    <div class="flex min-w-0 flex-wrap items-start justify-between gap-3">
      <FieldContent class="min-w-0 gap-1">
        <FieldLabel
          :for="controlId"
          class="text-sm font-semibold leading-5 text-foreground"
        >
          {{ title }}
        </FieldLabel>
        <FieldDescription
          v-if="description"
          class="max-w-3xl text-xs leading-5 text-muted-foreground"
        >
          {{ description }}
        </FieldDescription>
      </FieldContent>

      <Button
        type="button"
        variant="outline"
        size="sm"
        @click="editorOpen = true"
      >
        <PencilLineIcon data-icon="inline-start" />
        {{ t('settings.catAppearance.role.editor.edit') }}
      </Button>
    </div>

    <div
      :id="controlId"
      :class="cn(
        'group mt-3 w-full rounded-md border bg-background/60 transition-colors hover:bg-muted/30',
        isEmpty && 'border-dashed',
      )"
    >
      <button
        type="button"
        class="relative block w-full overflow-hidden px-3 py-3 text-left focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        @click="editorOpen = true"
      >
        <pre
          :class="cn(
            'whitespace-pre-wrap break-words text-sm leading-6',
            isEmpty ? 'text-muted-foreground' : 'text-foreground',
          )"
          :style="previewStyle"
        >{{ previewText || t('settings.catAppearance.role.editor.empty') }}</pre>
        <div
          v-if="hasMorePreviewContent"
          aria-hidden="true"
          class="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-b from-transparent via-background/85 to-background"
        />
        <div
          v-if="hasMorePreviewContent"
          aria-hidden="true"
          class="pointer-events-none absolute bottom-0 left-1/2 h-px w-2/3 -translate-x-1/2 bg-gradient-to-r from-transparent via-primary/50 to-transparent"
        />
      </button>
      <div class="flex items-center justify-center border-t px-3 py-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          class="text-muted-foreground hover:text-foreground"
          @click="editorOpen = true"
        >
          {{ t('settings.catAppearance.role.editor.openEditor') }}
        </Button>
      </div>
    </div>

    <CompanionRoleTextEditorModal
      v-model:open="editorOpen"
      :model-value="model"
      :title="title"
      :description="description"
      :placeholder="placeholder"
      :rows="rows"
      @save="saveEditor"
    />
  </Field>
</template>

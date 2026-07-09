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
    previewLines: 5,
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
  overflow: 'hidden',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: props.previewLines,
}))
const characterCount = computed(() => model.value.length)

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

    <button
      :id="controlId"
      type="button"
      :class="cn(
        'group mt-3 w-full rounded-md border bg-background/60 px-3 py-3 text-left transition-colors hover:bg-muted/30 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
        isEmpty && 'border-dashed',
      )"
      @click="editorOpen = true"
    >
      <pre
        :class="cn(
          'whitespace-pre-wrap break-words text-sm leading-6',
          isEmpty ? 'text-muted-foreground' : 'text-foreground',
        )"
        :style="previewStyle"
      >{{ previewText || t('settings.catAppearance.role.editor.empty') }}</pre>
      <div class="mt-3 flex items-center justify-between gap-3 border-t pt-2 text-xs text-muted-foreground">
        <span>{{ t('settings.catAppearance.role.editor.characterCount', { count: characterCount }) }}</span>
        <span class="transition-colors group-hover:text-foreground">
          {{ t('settings.catAppearance.role.editor.openEditor') }}
        </span>
      </div>
    </button>

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

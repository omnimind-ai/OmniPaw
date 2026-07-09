<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'

const props = withDefaults(
  defineProps<{
    open: boolean
    modelValue: string
    title: string
    description?: string
    placeholder?: string
    rows?: number
  }>(),
  {
    rows: 18,
  }
)

const emit = defineEmits<{
  'update:open': [value: boolean]
  save: [value: string]
}>()

const { t } = useI18n()
const draft = ref(props.modelValue)
const textareaStyle = computed(() => ({
  minHeight: `${Math.max(props.rows, 12) * 1.5}rem`,
}))

watch(
  () => props.open,
  (open) => {
    if (open) {
      draft.value = props.modelValue
    }
  }
)

function close(): void {
  emit('update:open', false)
}

function save(): void {
  emit('save', draft.value)
  close()
}
</script>

<template>
  <Dialog
    :open="open"
    @update:open="emit('update:open', $event)"
  >
    <DialogContent class="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-5xl">
      <DialogHeader>
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription v-if="description">
          {{ description }}
        </DialogDescription>
      </DialogHeader>

      <FieldGroup>
        <Field>
          <FieldLabel class="sr-only">
            {{ title }}
          </FieldLabel>
          <Textarea
            v-model="draft"
            class="w-full resize-y font-mono text-sm leading-relaxed"
            :placeholder="placeholder"
            :style="textareaStyle"
          />
        </Field>
      </FieldGroup>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          @click="close"
        >
          {{ t('settings.catAppearance.role.editor.cancel') }}
        </Button>
        <Button
          type="button"
          @click="save"
        >
          {{ t('settings.catAppearance.role.editor.save') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

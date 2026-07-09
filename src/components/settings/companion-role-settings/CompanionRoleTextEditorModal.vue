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
const textareaScrollTop = ref(0)
const editorStyle = computed(() => ({
  height: `${Math.max(props.rows, 16) * 1.5}rem`,
}))
const lineNumberStyle = computed(() => ({
  transform: `translateY(-${textareaScrollTop.value}px)`,
}))
const lineNumbers = computed(() =>
  Array.from({ length: Math.max(1, draft.value.split(/\r\n|\r|\n/).length) }, (_, index) =>
    String(index + 1)
  ).join('\n')
)
const characterCount = computed(() => draft.value.length)

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

function syncLineNumberScroll(event: Event): void {
  textareaScrollTop.value = (event.target as HTMLTextAreaElement | null)?.scrollTop ?? 0
}
</script>

<template>
  <Dialog
    :open="open"
    @update:open="emit('update:open', $event)"
  >
    <DialogContent class="grid max-h-[calc(100vh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-5xl">
      <DialogHeader>
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription v-if="description">
          {{ description }}
        </DialogDescription>
      </DialogHeader>

      <FieldGroup class="min-h-0">
        <Field class="min-h-0">
          <FieldLabel class="sr-only">
            {{ title }}
          </FieldLabel>
          <div
            class="grid min-h-0 overflow-hidden rounded-lg border bg-background focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50"
            :style="editorStyle"
          >
            <div class="grid min-h-0 grid-cols-[3.25rem_minmax(0,1fr)]">
              <div class="overflow-hidden border-r bg-muted/35 px-2 py-2 text-right font-mono text-xs leading-6 text-muted-foreground select-none">
                <pre
                  aria-hidden="true"
                  :style="lineNumberStyle"
                >{{ lineNumbers }}</pre>
              </div>
              <Textarea
                v-model="draft"
                class="h-full min-h-0 resize-none overflow-y-auto rounded-none border-0 bg-transparent px-3 py-2 font-mono text-sm leading-6 [field-sizing:fixed] focus-visible:ring-0"
                :placeholder="placeholder"
                @scroll="syncLineNumberScroll"
              />
            </div>
          </div>
        </Field>
      </FieldGroup>

      <DialogFooter class="items-center sm:justify-between">
        <p class="text-xs text-muted-foreground">
          {{ t('settings.catAppearance.role.editor.characterCount', { count: characterCount }) }}
        </p>
        <div class="flex items-center gap-2">
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
        </div>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

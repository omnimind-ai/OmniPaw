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
    maxlength?: number
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
const editorTextStyle = {
  '--role-editor-font-size': '14px',
  '--role-editor-line-height': '24px',
  '--role-editor-padding-block': '8px',
  '--role-editor-line-number-offset': '-2px',
}
const editorStyle = computed(() => ({
  ...editorTextStyle,
  height: `${Math.max(props.rows, 16) * 1.5}rem`,
}))
const lineNumberStyle = computed(() => ({
  transform: `translateY(calc(-${textareaScrollTop.value}px + var(--role-editor-line-number-offset)))`,
}))
const lineNumberRailStyle = {
  paddingBottom: 'var(--role-editor-padding-block)',
  paddingTop: 'var(--role-editor-padding-block)',
}
const lineNumberItemStyle = {
  fontSize: 'var(--role-editor-font-size)',
  height: 'var(--role-editor-line-height)',
  lineHeight: 'var(--role-editor-line-height)',
}
const textareaStyle = {
  display: 'block',
  fontSize: 'var(--role-editor-font-size)',
  lineHeight: 'var(--role-editor-line-height)',
  paddingBottom: 'var(--role-editor-padding-block)',
  paddingTop: 'var(--role-editor-padding-block)',
}
const lineNumbers = computed(() =>
  Array.from(
    { length: Math.max(1, draft.value.split(/\r\n|\r|\n/).length) },
    (_, index) => index + 1
  )
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
              <div
                class="overflow-hidden border-r bg-muted/35 px-2 text-right font-mono text-muted-foreground tabular-nums select-none"
                :style="lineNumberRailStyle"
              >
                <div
                  aria-hidden="true"
                  class="m-0"
                  :style="lineNumberStyle"
                >
                  <div
                    v-for="lineNumber in lineNumbers"
                    :key="lineNumber"
                    :style="lineNumberItemStyle"
                  >
                    {{ lineNumber }}
                  </div>
                </div>
              </div>
              <Textarea
                v-model="draft"
                class="h-full min-h-0 resize-none overflow-y-auto rounded-none border-0 bg-transparent px-3 font-mono [field-sizing:fixed] focus-visible:ring-0"
                :placeholder="placeholder"
                :maxlength="maxlength"
                :style="textareaStyle"
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

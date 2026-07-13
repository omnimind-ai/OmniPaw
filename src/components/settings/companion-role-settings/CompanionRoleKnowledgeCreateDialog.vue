<script setup lang="ts">
import type { CompanionRoleKnowledgeEntry } from '@shared/types/companion-role'
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
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

export interface CreateCompanionRoleKnowledgeEntryPayload {
  title: string
  content: string
  keys: string[]
  constant: boolean
  priority: number
  tokenBudget?: number
}

const open = defineModel<boolean>('open', { required: true })

const props = defineProps<{
  entry?: CompanionRoleKnowledgeEntry
}>()

const emit = defineEmits<{
  submit: [payload: CreateCompanionRoleKnowledgeEntryPayload]
}>()

const { t } = useI18n()

const title = ref('')
const content = ref('')
const keysText = ref('')
const constant = ref(true)
const priority = ref(0)
const tokenBudgetText = ref('')
const canSubmit = computed(() => content.value.trim().length > 0)
const editing = computed(() => Boolean(props.entry))

watch(
  [open, () => props.entry],
  ([isOpen]) => {
    if (isOpen) {
      resetDraft(props.entry)
    } else {
      resetDraft()
    }
  },
  { immediate: true }
)

function submit(): void {
  const trimmedContent = content.value.trim()
  if (!trimmedContent) return

  emit('submit', {
    title: title.value.trim(),
    content: trimmedContent,
    keys: splitInlineList(keysText.value),
    constant: constant.value,
    priority: normalizeInteger(priority.value, 0),
    tokenBudget: normalizeOptionalInteger(tokenBudgetText.value, 50),
  })
}

function resetDraft(entry?: CompanionRoleKnowledgeEntry): void {
  title.value = entry?.title ?? ''
  content.value = entry?.content ?? ''
  keysText.value = entry?.keys.join(', ') ?? ''
  constant.value = entry?.constant ?? true
  priority.value = entry?.priority ?? 0
  tokenBudgetText.value = entry?.tokenBudget === undefined ? '' : String(entry.tokenBudget)
}

function splitInlineList(value: string): string[] {
  return value
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function normalizeInteger(value: string | number, fallback: number): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.round(numeric)
}

function normalizeOptionalInteger(value: string, min: number): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const numeric = Number(trimmed)
  if (!Number.isFinite(numeric)) return undefined
  return Math.max(min, Math.round(numeric))
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>
          {{
            t(
              editing
                ? 'settings.catAppearance.role.knowledge.editDialog.title'
                : 'settings.catAppearance.role.knowledge.createDialog.title'
            )
          }}
        </DialogTitle>
        <DialogDescription>
          {{
            t(
              editing
                ? 'settings.catAppearance.role.knowledge.editDialog.description'
                : 'settings.catAppearance.role.knowledge.createDialog.description'
            )
          }}
        </DialogDescription>
      </DialogHeader>

      <FieldGroup>
        <Field>
          <FieldLabel for="role-knowledge-create-title">
            {{ t('settings.catAppearance.role.knowledge.fields.title') }}
          </FieldLabel>
          <Input
            id="role-knowledge-create-title"
            v-model="title"
            :placeholder="t('settings.catAppearance.role.knowledge.newTitle')"
          />
        </Field>

        <Field>
          <FieldLabel for="role-knowledge-create-content">
            {{ t('settings.catAppearance.role.knowledge.createDialog.contentLabel') }}
          </FieldLabel>
          <Textarea
            id="role-knowledge-create-content"
            v-model="content"
            class="min-h-36"
            :placeholder="t('settings.catAppearance.role.knowledge.fields.content')"
          />
        </Field>

        <Field>
          <FieldLabel for="role-knowledge-create-keys">
            {{ t('settings.catAppearance.role.knowledge.createDialog.keysLabel') }}
          </FieldLabel>
          <Input
            id="role-knowledge-create-keys"
            v-model="keysText"
            :placeholder="t('settings.catAppearance.role.knowledge.fields.keys')"
          />
          <FieldDescription>
            {{ t('settings.catAppearance.role.knowledge.createDialog.keysDescription') }}
          </FieldDescription>
        </Field>

        <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field>
            <FieldLabel for="role-knowledge-create-priority">
              {{ t('settings.catAppearance.role.knowledge.fields.priority') }}
            </FieldLabel>
            <Input
              id="role-knowledge-create-priority"
              v-model.number="priority"
              type="number"
              step="1"
            />
          </Field>

          <Field>
            <FieldLabel for="role-knowledge-create-token-budget">
              {{ t('settings.catAppearance.role.knowledge.fields.tokenBudget') }}
            </FieldLabel>
            <Input
              id="role-knowledge-create-token-budget"
              v-model="tokenBudgetText"
              type="number"
              min="50"
              :placeholder="t('settings.catAppearance.role.knowledge.createDialog.tokenBudgetPlaceholder')"
            />
          </Field>
        </div>

        <Field orientation="horizontal">
          <Switch
            id="role-knowledge-create-constant"
            v-model="constant"
          />
          <FieldLabel for="role-knowledge-create-constant">
            {{ t('settings.catAppearance.role.knowledge.fields.constant') }}
          </FieldLabel>
        </Field>
      </FieldGroup>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          @click="open = false"
        >
          {{ t('settings.catAppearance.role.knowledge.createDialog.cancel') }}
        </Button>
        <Button
          type="button"
          :disabled="!canSubmit"
          @click="submit"
        >
          {{
            t(
              editing
                ? 'settings.catAppearance.role.knowledge.editDialog.save'
                : 'settings.catAppearance.role.knowledge.createDialog.create'
            )
          }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import type {
  CompanionMemoryKind,
  CompanionMemoryScope,
  CreateCompanionMemoryRequest,
} from '@shared/types/memory'
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
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

const { t } = useI18n()

const open = defineModel<boolean>('open', { required: true })

const props = defineProps<{
  saving: boolean
  scope?: CompanionMemoryScope
  characterId?: string
  title?: string
  description?: string
  contentPlaceholder?: string
}>()

const emit = defineEmits<{
  submit: [request: CreateCompanionMemoryRequest]
}>()

const content = ref('')
const kind = ref<CompanionMemoryKind>('fact')
const importance = ref(3)
const canSubmit = computed(() => content.value.trim().length > 0)

watch(open, (isOpen) => {
  if (!isOpen) {
    resetDraft()
  }
})

function submit(): void {
  const trimmedContent = content.value.trim()
  if (!trimmedContent) return

  emit('submit', {
    kind: kind.value,
    scope: props.scope ?? 'user',
    characterId: props.characterId,
    content: trimmedContent,
    importance: clampInteger(importance.value, 1, 5),
    confidence: 1,
  })
}

function resetDraft(): void {
  content.value = ''
  kind.value = 'fact'
  importance.value = 3
}

function clampInteger(value: string | number, min: number, max: number): number {
  const next = Math.round(Number(value))
  if (!Number.isFinite(next)) return min
  return Math.min(max, Math.max(min, next))
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{{ props.title ?? t('settings.memory.createModal.title') }}</DialogTitle>
        <DialogDescription>
          {{ props.description ?? t('settings.memory.createModal.description') }}
        </DialogDescription>
      </DialogHeader>

      <FieldGroup>
        <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field>
            <FieldLabel for="memory-create-kind">{{ t('settings.memory.createModal.kind') }}</FieldLabel>
            <Select v-model="kind">
              <SelectTrigger
                id="memory-create-kind"
                class="w-full"
              >
                <SelectValue :placeholder="t('settings.memory.createModal.selectKind')" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="fact">{{ t('settings.memory.createModal.kindFact') }}</SelectItem>
                  <SelectItem value="preference">{{ t('settings.memory.createModal.kindPreference') }}</SelectItem>
                  <SelectItem value="profile">{{ t('settings.memory.createModal.kindProfile') }}</SelectItem>
                  <SelectItem value="relationship">{{ t('settings.memory.createModal.kindRelationship') }}</SelectItem>
                  <SelectItem value="episode">{{ t('settings.memory.createModal.kindEpisode') }}</SelectItem>
                  <SelectItem value="plan">{{ t('settings.memory.createModal.kindPlan') }}</SelectItem>
                  <SelectItem value="boundary">{{ t('settings.memory.createModal.kindBoundary') }}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel for="memory-create-importance">{{ t('settings.memory.createModal.importance') }}</FieldLabel>
            <Input
              id="memory-create-importance"
              v-model="importance"
              type="number"
              min="1"
              max="5"
              step="1"
            />
            <FieldDescription>{{ t('settings.memory.createModal.importanceDescription') }}</FieldDescription>
          </Field>
        </div>

        <Field>
          <FieldLabel for="memory-create-content">{{ t('settings.memory.createModal.content') }}</FieldLabel>
          <Textarea
            id="memory-create-content"
            v-model="content"
            rows="5"
            :placeholder="props.contentPlaceholder ?? t('settings.memory.createModal.contentPlaceholder')"
          />
        </Field>
      </FieldGroup>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          @click="open = false"
        >
          {{ t('settings.memory.createModal.cancel') }}
        </Button>
        <Button
          type="button"
          :disabled="saving || !canSubmit"
          @click="submit"
        >
          {{ t('settings.memory.createModal.save') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

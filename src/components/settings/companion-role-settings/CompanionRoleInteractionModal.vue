<script setup lang="ts">
import type { CatPetInteractionConfig } from '@shared/types/cat-pet'
import { defaultCatPetInteractionConfigs } from '@shared/types/cat-pet'
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
import { Input } from '@/components/ui/input'

const props = defineProps<{
  interaction?: CatPetInteractionConfig
}>()

const open = defineModel<boolean>('open', { required: true })

const emit = defineEmits<{
  submit: [interaction: CatPetInteractionConfig]
}>()

const { t } = useI18n()
const defaultInteractionById = new Map(
  defaultCatPetInteractionConfigs().map((item) => [item.id, item])
)

const label = ref('')
const description = ref('')
const positiveFeedback = ref('')
const negativeFeedback = ref('')

const fallbackInteraction = computed(() => {
  const interaction = props.interaction
  return interaction ? (defaultInteractionById.get(interaction.id) ?? interaction) : undefined
})
const interactionTitle = computed(
  () => label.value.trim() || fallbackInteraction.value?.label || ''
)

watch(
  [open, () => props.interaction],
  ([isOpen]) => {
    if (isOpen) {
      loadDraft(props.interaction)
      return
    }
    resetDraft()
  },
  { immediate: true }
)

function loadDraft(interaction: CatPetInteractionConfig | undefined): void {
  label.value = interaction?.label ?? ''
  description.value = interaction?.description ?? ''
  positiveFeedback.value = interaction?.positiveFeedback ?? ''
  negativeFeedback.value = interaction?.negativeFeedback ?? ''
}

function resetDraft(): void {
  label.value = ''
  description.value = ''
  positiveFeedback.value = ''
  negativeFeedback.value = ''
}

function submit(): void {
  const interaction = props.interaction
  if (!interaction) return

  const nextLabel = label.value.trim()
  const nextDescription = description.value.trim()
  const nextPositiveFeedback = positiveFeedback.value.trim()
  const nextNegativeFeedback = negativeFeedback.value.trim()

  emit('submit', {
    id: interaction.id,
    enabled: interaction.enabled !== false,
    ...(nextLabel ? { label: nextLabel } : {}),
    ...(nextDescription ? { description: nextDescription } : {}),
    ...(nextPositiveFeedback ? { positiveFeedback: nextPositiveFeedback } : {}),
    ...(nextNegativeFeedback ? { negativeFeedback: nextNegativeFeedback } : {}),
  })
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>
          {{
            t('settings.catAppearance.role.interactions.dialog.editTitle', {
              name: interactionTitle,
            })
          }}
        </DialogTitle>
        <DialogDescription>
          {{ t('settings.catAppearance.role.interactions.dialog.description') }}
        </DialogDescription>
      </DialogHeader>

      <FieldGroup>
        <Field>
          <FieldLabel for="settings-companion-role-interaction-dialog-label">
            {{ t('settings.catAppearance.role.interactions.fields.label') }}
          </FieldLabel>
          <Input
            id="settings-companion-role-interaction-dialog-label"
            v-model="label"
            maxlength="18"
            :placeholder="fallbackInteraction?.label"
          />
        </Field>

        <Field>
          <FieldLabel for="settings-companion-role-interaction-dialog-description">
            {{ t('settings.catAppearance.role.interactions.fields.description') }}
          </FieldLabel>
          <Input
            id="settings-companion-role-interaction-dialog-description"
            v-model="description"
            maxlength="80"
            :placeholder="t('catPet.config.hintPlaceholder')"
          />
        </Field>

        <Field>
          <FieldLabel for="settings-companion-role-interaction-dialog-positive-feedback">
            {{ t('settings.catAppearance.role.interactions.fields.positiveFeedback') }}
          </FieldLabel>
          <Input
            id="settings-companion-role-interaction-dialog-positive-feedback"
            v-model="positiveFeedback"
            maxlength="120"
            :placeholder="t('catPet.config.positivePlaceholder')"
          />
        </Field>

        <Field>
          <FieldLabel for="settings-companion-role-interaction-dialog-negative-feedback">
            {{ t('settings.catAppearance.role.interactions.fields.negativeFeedback') }}
          </FieldLabel>
          <Input
            id="settings-companion-role-interaction-dialog-negative-feedback"
            v-model="negativeFeedback"
            maxlength="120"
            :placeholder="t('catPet.config.negativePlaceholder')"
          />
        </Field>
      </FieldGroup>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          @click="open = false"
        >
          {{ t('settings.catAppearance.role.interactions.dialog.cancel') }}
        </Button>
        <Button
          type="button"
          @click="submit"
        >
          {{ t('settings.catAppearance.role.interactions.dialog.save') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

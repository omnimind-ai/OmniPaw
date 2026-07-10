<script setup lang="ts">
import type { CatPetInteractionConfig, CatPetInteractionDefinition } from '@shared/types/cat-pet'
import {
  CAT_PET_ACTIONS,
  defaultCatPetInteractionConfigs,
  normalizeCatPetInteractionConfigs,
} from '@shared/types/cat-pet'
import { Settings2Icon } from 'lucide-vue-next'
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

const props = defineProps<{
  open: boolean
  interactionConfigs: CatPetInteractionConfig[]
  interactions: CatPetInteractionDefinition[]
  saving?: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  save: [items: CatPetInteractionConfig[]]
}>()

const { t } = useI18n()

const draft = ref<CatPetInteractionConfig[]>([])

const openModel = computed({
  get: () => props.open,
  set: (value: boolean) => emit('update:open', value),
})

watch(
  () => [props.open, props.interactionConfigs] as const,
  () => {
    if (!props.open) return
    draft.value = normalizeCatPetInteractionConfigs(props.interactionConfigs)
  },
  { immediate: true }
)

function definitionFor(item: CatPetInteractionConfig): CatPetInteractionDefinition | undefined {
  return props.interactions.find((entry) => entry.id === item.id)
}

function fallbackFor(item: CatPetInteractionConfig): CatPetInteractionConfig {
  return defaultCatPetInteractionConfigs().find((entry) => entry.id === item.id) ?? item
}

function titleFor(item: CatPetInteractionConfig, index: number): string {
  return (
    item.label?.trim() || fallbackFor(item).label || t('catPet.config.slot', { index: index + 1 })
  )
}

function descriptionFor(item: CatPetInteractionConfig): string {
  const definition = definitionFor(item)
  if (definition?.unlockAffection) {
    return t('catPet.config.unlockAt', { count: definition.unlockAffection })
  }
  return t('catPet.config.availableNow')
}

function updateItem(index: number, patch: Partial<CatPetInteractionConfig>): void {
  const next = [...draft.value]
  next[index] = { ...next[index], ...patch }
  draft.value = next
}

function handleSave(): void {
  emit(
    'save',
    normalizeCatPetInteractionConfigs(
      draft.value.map((item) => ({
        id: item.id,
        enabled: item.enabled !== false,
        label: item.label?.trim() || undefined,
        description: item.description?.trim() || undefined,
        positiveFeedback: item.positiveFeedback?.trim() || undefined,
        negativeFeedback: item.negativeFeedback?.trim() || undefined,
      }))
    )
  )
}
</script>

<template>
  <Dialog v-model:open="openModel">
    <DialogContent class="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-xl">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <Settings2Icon />
          {{ t('catPet.config.title') }}
        </DialogTitle>
        <DialogDescription>
          {{ t('catPet.config.description') }}
        </DialogDescription>
      </DialogHeader>

      <FieldGroup>
        <Field
          v-for="(item, index) in draft"
          :key="item.id"
          class="rounded-lg border border-border/70 p-3"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <FieldLabel :for="`cat-pet-interaction-${item.id}`">
                {{ titleFor(item, index) }}
              </FieldLabel>
              <FieldDescription>
                {{ descriptionFor(item) }}
              </FieldDescription>
            </div>
            <Switch
              :id="`cat-pet-interaction-enabled-${item.id}`"
              :model-value="item.enabled !== false"
              :aria-label="t('catPet.config.enabledAria', { name: titleFor(item, index) })"
              @update:model-value="updateItem(index, { enabled: Boolean($event) })"
            />
          </div>

          <Input
            :id="`cat-pet-interaction-${item.id}`"
            :model-value="item.label"
            :placeholder="fallbackFor(item).label"
            maxlength="18"
            :disabled="saving"
            @update:model-value="updateItem(index, { label: String($event) })"
          />
          <Input
            :model-value="item.description"
            :placeholder="t('catPet.config.hintPlaceholder')"
            maxlength="80"
            :disabled="saving"
            @update:model-value="updateItem(index, { description: String($event) })"
          />
          <Input
            :model-value="item.positiveFeedback"
            :placeholder="t('catPet.config.positivePlaceholder')"
            maxlength="120"
            :disabled="saving"
            @update:model-value="updateItem(index, { positiveFeedback: String($event) })"
          />
          <Input
            :model-value="item.negativeFeedback"
            :placeholder="t('catPet.config.negativePlaceholder')"
            maxlength="120"
            :disabled="saving"
            @update:model-value="updateItem(index, { negativeFeedback: String($event) })"
          />
        </Field>
      </FieldGroup>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          :disabled="saving"
          @click="openModel = false"
        >
          {{ t('catPet.config.cancel') }}
        </Button>
        <Button
          type="button"
          :disabled="saving || draft.length !== CAT_PET_ACTIONS.length"
          @click="handleSave"
        >
          {{ t('catPet.config.save') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

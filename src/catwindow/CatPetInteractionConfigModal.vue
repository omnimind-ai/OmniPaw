<script setup lang="ts">
import type {
  CatPetCustomAction,
  CatPetCustomInteractionConfig,
  CatPetInteractionRisk,
} from '@shared/types/cat-pet'
import { CAT_PET_CUSTOM_ACTIONS } from '@shared/types/cat-pet'
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
  customInteractions: CatPetCustomInteractionConfig[]
  saving?: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  save: [items: CatPetCustomInteractionConfig[]]
}>()

const { t } = useI18n()

const draft = ref<CatPetCustomInteractionConfig[]>([])

const openModel = computed({
  get: () => props.open,
  set: (value: boolean) => emit('update:open', value),
})

watch(
  () => [props.open, props.customInteractions] as const,
  () => {
    if (!props.open) return
    draft.value = CAT_PET_CUSTOM_ACTIONS.map((id) => {
      const item = props.customInteractions.find((entry) => entry.id === id)
      return {
        id,
        enabled: item?.enabled !== false,
        label: item?.label ?? '',
        description: item?.description ?? '',
      }
    })
  },
  { immediate: true }
)

function riskForAction(action: CatPetCustomAction): CatPetInteractionRisk {
  if (action === 'custom_high') return 'high'
  if (action === 'custom_medium') return 'medium'
  return 'low'
}

function labelForAction(action: CatPetCustomAction): string {
  return t(`catPet.action.${action}`)
}

function riskLabel(action: CatPetCustomAction): string {
  return t(`catPet.risk.${riskForAction(action)}`)
}

function updateLabel(index: number, value: string): void {
  const next = [...draft.value]
  next[index] = { ...next[index], label: value }
  draft.value = next
}

function updateDescription(index: number, value: string): void {
  const next = [...draft.value]
  next[index] = { ...next[index], description: value }
  draft.value = next
}

function updateEnabled(index: number, value: boolean): void {
  const next = [...draft.value]
  next[index] = { ...next[index], enabled: value }
  draft.value = next
}

function handleSave(): void {
  emit(
    'save',
    draft.value.map((item) => ({
      id: item.id,
      enabled: item.enabled,
      label: item.label?.trim() || undefined,
      description: item.description?.trim() || undefined,
    }))
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
              <FieldLabel :for="`cat-pet-custom-${item.id}`">
                {{ labelForAction(item.id) }}
              </FieldLabel>
              <FieldDescription>
                {{ riskLabel(item.id) }} · {{ t(`catPet.config.effect.${riskForAction(item.id)}`) }}
              </FieldDescription>
            </div>
            <Switch
              :id="`cat-pet-custom-enabled-${item.id}`"
              :model-value="item.enabled"
              :aria-label="t('catPet.config.enabledAria', { name: labelForAction(item.id) })"
              @update:model-value="updateEnabled(index, Boolean($event))"
            />
          </div>

          <Input
            :id="`cat-pet-custom-${item.id}`"
            :model-value="item.label"
            :placeholder="labelForAction(item.id)"
            maxlength="18"
            :disabled="saving"
            @update:model-value="updateLabel(index, String($event))"
          />
          <Input
            :model-value="item.description"
            :placeholder="t('catPet.config.hintPlaceholder')"
            maxlength="80"
            :disabled="saving"
            @update:model-value="updateDescription(index, String($event))"
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
          :disabled="saving"
          @click="handleSave"
        >
          {{ t('catPet.config.save') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

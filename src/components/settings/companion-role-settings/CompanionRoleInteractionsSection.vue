<script setup lang="ts">
import { HandIcon, PencilIcon } from '@lucide/vue'
import type { CatPetInteractionConfig } from '@shared/types/cat-pet'
import {
  CAT_PET_ACTIONS,
  CAT_PET_DAILY_LIMITS,
  CAT_PET_UNLOCK_AFFECTION,
  defaultCatPetInteractionConfigs,
  normalizeCatPetInteractionConfigs,
} from '@shared/types/cat-pet'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingEntry from '@/components/settings/common/SettingEntry.vue'
import SettingsSection from '@/components/settings/common/SettingsSection.vue'
import CompanionRoleInteractionModal from '@/components/settings/companion-role-settings/CompanionRoleInteractionModal.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FieldGroup } from '@/components/ui/field'
import { Switch } from '@/components/ui/switch'

const props = defineProps<{
  interactions: CatPetInteractionConfig[]
}>()

const emit = defineEmits<{
  'update:interactions': [interactions: CatPetInteractionConfig[]]
}>()

const { t } = useI18n()
const defaultPetInteractionById = new Map(
  defaultCatPetInteractionConfigs().map((item) => [item.id, item])
)
const interactionDialogOpen = ref(false)
const interactionDialogDraft = ref<CatPetInteractionConfig>()
const normalizedInteractions = computed(() => normalizeCatPetInteractionConfigs(props.interactions))

function petInteractionFallback(item: CatPetInteractionConfig): CatPetInteractionConfig {
  return defaultPetInteractionById.get(item.id) ?? item
}

function petInteractionTitle(item: CatPetInteractionConfig, index: number): string {
  return (
    item.label?.trim() ||
    petInteractionFallback(item).label ||
    t('settings.catAppearance.role.interactions.slot', { index: index + 1 })
  )
}

function petInteractionDescription(item: CatPetInteractionConfig): string {
  return item.description?.trim() || petInteractionFallback(item).description || ''
}

function petInteractionAvailability(item: CatPetInteractionConfig): string {
  const unlockAffection = CAT_PET_UNLOCK_AFFECTION[item.id]
  if (unlockAffection > 0) {
    return t('catPet.config.unlockAt', { count: unlockAffection })
  }
  return t('catPet.config.availableNow')
}

function petInteractionDailyLimit(item: CatPetInteractionConfig): string {
  return t('settings.catAppearance.role.interactions.dailyLimit', {
    count: CAT_PET_DAILY_LIMITS[item.id],
  })
}

function updatePetInteraction(
  index: number,
  patch: Partial<Omit<CatPetInteractionConfig, 'id'>>
): void {
  const current = normalizedInteractions.value[index]
  if (!current) return
  const next = [...normalizedInteractions.value]
  next[index] = { ...current, ...patch }
  emit('update:interactions', normalizeCatPetInteractionConfigs(next))
}

function openInteractionDialog(item: CatPetInteractionConfig): void {
  interactionDialogDraft.value = { ...item }
  interactionDialogOpen.value = true
}

function savePetInteraction(interaction: CatPetInteractionConfig): void {
  const items = normalizedInteractions.value
  const index = items.findIndex((item) => item.id === interaction.id)
  if (index < 0) return

  const next = [...items]
  next[index] = interaction
  emit('update:interactions', normalizeCatPetInteractionConfigs(next))
  interactionDialogOpen.value = false
  interactionDialogDraft.value = undefined
}
</script>

<template>
  <SettingsSection
    :title="t('settings.catAppearance.role.sections.interactions.title')"
    :icon="HandIcon"
  >
    <FieldGroup class="gap-0">
      <SettingEntry
        v-for="(item, index) in normalizedInteractions"
        :key="item.id"
        :control-id="`settings-companion-role-interaction-enabled-${item.id}`"
        :title="petInteractionTitle(item, index)"
        :description="petInteractionDescription(item)"
      >
        <template #meta>
          <div class="flex flex-wrap gap-1.5">
            <Badge variant="secondary">
              {{ petInteractionAvailability(item) }}
            </Badge>
            <Badge variant="outline">
              {{ petInteractionDailyLimit(item) }}
            </Badge>
          </div>
        </template>

        <Switch
          :id="`settings-companion-role-interaction-enabled-${item.id}`"
          :model-value="item.enabled !== false"
          :aria-label="t('catPet.config.enabledAria', { name: petInteractionTitle(item, index) })"
          @update:model-value="updatePetInteraction(index, { enabled: Boolean($event) })"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          @click="openInteractionDialog(item)"
        >
          <PencilIcon data-icon="inline-start" />
          {{ t('settings.catAppearance.role.interactions.edit') }}
        </Button>
      </SettingEntry>
    </FieldGroup>
  </SettingsSection>

  <p class="text-sm text-muted-foreground">
    {{
      t('settings.catAppearance.role.interactions.summary', {
        count: normalizedInteractions.length,
        total: CAT_PET_ACTIONS.length,
      })
    }}
  </p>

  <CompanionRoleInteractionModal
    v-model:open="interactionDialogOpen"
    :interaction="interactionDialogDraft"
    @submit="savePetInteraction"
  />
</template>

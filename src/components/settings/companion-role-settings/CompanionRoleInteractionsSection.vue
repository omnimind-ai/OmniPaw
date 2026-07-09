<script setup lang="ts">
import type { CatPetInteractionConfig } from '@shared/types/cat-pet'
import {
  CAT_PET_ACTIONS,
  CAT_PET_DAILY_LIMITS,
  CAT_PET_UNLOCK_AFFECTION,
  defaultCatPetInteractionConfigs,
  normalizeCatPetInteractionConfigs,
} from '@shared/types/cat-pet'
import { HandIcon } from 'lucide-vue-next'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingEntry from '@/components/settings/common/SettingEntry.vue'
import SettingsSection from '@/components/settings/common/SettingsSection.vue'
import { Badge } from '@/components/ui/badge'
import { FieldGroup } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
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
</script>

<template>
  <SettingsSection
    :title="t('settings.catAppearance.role.sections.interactions.title')"
    :description="t('settings.catAppearance.role.sections.interactions.description')"
    :icon="HandIcon"
  >
    <FieldGroup class="gap-0">
      <SettingEntry
        v-for="(item, index) in normalizedInteractions"
        :key="item.id"
        :control-id="`settings-companion-role-interaction-label-${item.id}`"
        :title="petInteractionTitle(item, index)"
        :description="petInteractionDescription(item)"
        control-class="@md/field-group:w-[min(38rem,58vw)]"
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

        <div class="flex w-full min-w-0 flex-col gap-3">
          <div class="flex items-center justify-between gap-3 rounded-md border bg-background/60 px-3 py-2">
            <span class="text-sm text-muted-foreground">
              {{ t('settings.catAppearance.role.interactions.fields.enabled') }}
            </span>
            <Switch
              :id="`settings-companion-role-interaction-enabled-${item.id}`"
              :model-value="item.enabled !== false"
              :aria-label="t('catPet.config.enabledAria', { name: petInteractionTitle(item, index) })"
              @update:model-value="updatePetInteraction(index, { enabled: Boolean($event) })"
            />
          </div>

          <div class="grid gap-2 md:grid-cols-2">
            <Input
              :id="`settings-companion-role-interaction-label-${item.id}`"
              :model-value="item.label"
              maxlength="18"
              :aria-label="t('settings.catAppearance.role.interactions.fields.label')"
              :placeholder="petInteractionFallback(item).label"
              @update:model-value="updatePetInteraction(index, { label: String($event) })"
            />
            <Input
              :model-value="item.description"
              maxlength="80"
              :aria-label="t('settings.catAppearance.role.interactions.fields.description')"
              :placeholder="t('catPet.config.hintPlaceholder')"
              @update:model-value="updatePetInteraction(index, { description: String($event) })"
            />
            <Input
              :model-value="item.positiveFeedback"
              maxlength="120"
              :aria-label="t('settings.catAppearance.role.interactions.fields.positiveFeedback')"
              :placeholder="t('catPet.config.positivePlaceholder')"
              @update:model-value="updatePetInteraction(index, { positiveFeedback: String($event) })"
            />
            <Input
              :model-value="item.negativeFeedback"
              maxlength="120"
              :aria-label="t('settings.catAppearance.role.interactions.fields.negativeFeedback')"
              :placeholder="t('catPet.config.negativePlaceholder')"
              @update:model-value="updatePetInteraction(index, { negativeFeedback: String($event) })"
            />
          </div>
        </div>
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
</template>

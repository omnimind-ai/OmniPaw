<script setup lang="ts">
import { GiftIcon, PencilIcon } from '@lucide/vue'
import type { CatPetGiftConfig } from '@shared/types/cat-pet'
import { defaultCatPetGiftConfigs, normalizeCatPetGiftConfigs } from '@shared/types/cat-pet'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsPanelItem from '@/components/settings/common/SettingsPanelItem.vue'
import SettingsSection from '@/components/settings/common/SettingsSection.vue'
import CompanionRoleGiftModal from '@/components/settings/companion-role-settings/CompanionRoleGiftModal.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { catPetGiftImageSrc } from '@/utils/cat-pet-gift-images'

const props = defineProps<{
  gifts: CatPetGiftConfig[]
}>()

const emit = defineEmits<{
  'update:gifts': [gifts: CatPetGiftConfig[]]
}>()

const { t } = useI18n()
const defaultPetGiftById = new Map(defaultCatPetGiftConfigs().map((item) => [item.id, item]))
const giftDialogOpen = ref(false)
const giftDialogDraft = ref<CatPetGiftConfig>()
const petGiftItems = computed(() => normalizeCatPetGiftConfigs(props.gifts))
const giftSpoilerContentClass = [
  '[&_h3]:select-none',
  '[&_h3]:blur-[3px]',
  '[&_h3]:transition-[filter,color]',
  '[&_h3]:duration-200',
  '[&_p]:select-none',
  '[&_p]:blur-[3px]',
  '[&_p]:transition-[filter,color]',
  '[&_p]:duration-200',
  'group-hover/gift-spoiler:[&_h3]:blur-0',
  'group-hover/gift-spoiler:[&_p]:blur-0',
  'group-focus-within/gift-spoiler:[&_h3]:blur-0',
  'group-focus-within/gift-spoiler:[&_p]:blur-0',
].join(' ')
const giftSpoilerImageClass =
  'size-full scale-110 select-none object-cover blur-[3px] saturate-75 transition-[filter,transform] duration-200 group-hover/gift-spoiler:scale-100 group-hover/gift-spoiler:blur-0 group-hover/gift-spoiler:saturate-100 group-focus-within/gift-spoiler:scale-100 group-focus-within/gift-spoiler:blur-0 group-focus-within/gift-spoiler:saturate-100'

function petGiftFallback(item: CatPetGiftConfig): CatPetGiftConfig {
  return defaultPetGiftById.get(item.id) ?? item
}

function petGiftTitle(item: CatPetGiftConfig, index: number): string {
  return (
    item.name?.trim() ||
    petGiftFallback(item).name ||
    t('settings.catAppearance.role.gifts.slot', { index: index + 1 })
  )
}

function petGiftDescription(item: CatPetGiftConfig): string {
  return item.description?.trim() || petGiftFallback(item).description || ''
}

function petGiftImageSrc(item: CatPetGiftConfig): string {
  return catPetGiftImageSrc(item.image, item.id)
}

function openGiftEditDialog(item: CatPetGiftConfig): void {
  giftDialogDraft.value = clonePetGift(item)
  giftDialogOpen.value = true
}

function savePetGift(gift: CatPetGiftConfig): void {
  const items = petGiftItems.value
  const index = items.findIndex((item) => item.id === gift.id)
  if (index < 0) return
  const next = [...items.slice(0, index), gift, ...items.slice(index + 1)]
  emit('update:gifts', normalizeCatPetGiftConfigs(next))
  giftDialogOpen.value = false
  giftDialogDraft.value = undefined
}

function clonePetGift(item: CatPetGiftConfig): CatPetGiftConfig {
  return {
    ...item,
    ...(item.image ? { image: { ...item.image } } : {}),
    storyLines: [...item.storyLines],
  }
}
</script>

<template>
  <SettingsSection
    :title="t('settings.catAppearance.role.gifts.title')"
    :icon="GiftIcon"
    content-class="p-4 sm:p-5"
  >
    <div class="flex flex-col gap-3">
      <SettingsPanelItem
        v-for="(item, index) in petGiftItems"
        :key="item.id"
        :title="petGiftTitle(item, index)"
        :description="petGiftDescription(item)"
        :icon="GiftIcon"
        class="group/gift-spoiler"
        :content-class="giftSpoilerContentClass"
      >
        <template #avatar>
          <div class="grid size-10 shrink-0 place-items-center overflow-hidden rounded-md border bg-muted text-muted-foreground">
            <img
              v-if="petGiftImageSrc(item)"
              :src="petGiftImageSrc(item)"
              :alt="t('settings.catAppearance.role.gifts.imageAlt', { name: petGiftTitle(item, index) })"
              :class="giftSpoilerImageClass"
            />
            <GiftIcon
              v-else
              aria-hidden="true"
            />
          </div>
        </template>

        <template #badges>
          <Badge variant="outline">
            {{ t('catPet.config.unlockAt', { count: item.unlockAffection }) }}
          </Badge>
        </template>

        <template #actions>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            :aria-label="t('settings.catAppearance.role.gifts.edit')"
            @click="openGiftEditDialog(item)"
          >
            <PencilIcon />
          </Button>
        </template>
      </SettingsPanelItem>
    </div>
  </SettingsSection>

  <CompanionRoleGiftModal
    v-model:open="giftDialogOpen"
    :gift="giftDialogDraft"
    @submit="savePetGift"
  />
</template>

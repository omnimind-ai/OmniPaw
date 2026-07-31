<script setup lang="ts">
import {
  BookOpenIcon,
  CheckIcon,
  GiftIcon,
  LockIcon,
  PencilIcon,
  SparklesIcon,
  XIcon,
} from '@lucide/vue'
import type { CatPetGiftDefinition, CatPetInventoryResponse } from '@shared/types/cat-pet'
import { defaultCatPetGiftConfigs } from '@shared/types/cat-pet'
import { storeToRefs } from 'pinia'
import type { Component } from 'vue'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { CompanionRole } from '@/components/settings/companion-role-settings/types'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { useCatPetStore } from '@/stores/cat-pet'
import { catPetGiftImageSrc } from '@/utils/cat-pet-gift-images'
import { errorToText, useToast } from '@/utils/toast'

interface RoleDetailItem {
  id: string
  icon: Component
  title: string
  value: string
}

const props = defineProps<{
  open: boolean
  role?: CompanionRole
  activeRoleId: string
  idleImageByPackId: Record<string, string>
}>()

const emit = defineEmits<{
  'update:open': [open: boolean]
  editRole: [role: CompanionRole]
  selectRole: [role: CompanionRole]
}>()

const { t } = useI18n()
const toast = useToast()
const catPetStore = useCatPetStore()
const { state, affection, affectionMax, mood, progressPercent, loading } = storeToRefs(catPetStore)
const petStateLoaded = ref(false)
const inventory = ref<CatPetInventoryResponse>()
const inventoryLoading = ref(false)
let inventoryRequestId = 0

const roleName = computed(() => props.role?.name.trim() || t('settings.catAppearance.role.unnamed'))
const roleInitial = computed(() => roleName.value.slice(0, 1))
const customAvatar = computed(
  () => props.role?.avatar?.source === 'custom' && Boolean(props.role.avatar.dataUrl)
)
const avatarSrc = computed(() => {
  if (!props.role) return props.idleImageByPackId.builtin
  const idleImage =
    props.idleImageByPackId[props.role.appearancePackId || 'builtin'] ||
    props.idleImageByPackId.builtin
  return customAvatar.value ? (props.role.avatar?.dataUrl ?? idleImage) : idleImage
})
const isActive = computed(() => props.role?.id === props.activeRoleId)
const introduction = computed(
  () => props.role?.introduction.trim() || t('settings.catAppearance.role.overview.introFallback')
)
const moodLabel = computed(() => t(`catPet.mood.${mood.value}`))
const moodEmoji = computed(() => {
  switch (mood.value) {
    case 'angry':
      return '💢'
    case 'sad':
      return '💧'
    case 'down':
      return '☁️'
    case 'happy':
      return '✨'
    case 'attached':
      return '💞'
    default:
      return '🌿'
  }
})
const giftSlots = computed<CatPetGiftDefinition[]>(() => {
  const configs = props.role?.petGifts?.length ? props.role.petGifts : defaultCatPetGiftConfigs()
  const unlockedIds = new Set(
    [
      ...(inventory.value?.unlockedGifts ?? []),
      ...(isActive.value ? state.value.unlockedGifts : []),
    ]
      .filter((gift) => gift.roleId === props.role?.id)
      .map((gift) => gift.id)
  )

  return configs.slice(0, 3).map((gift) => ({
    ...gift,
    enabled: gift.enabled !== false,
    unlocked: unlockedIds.has(gift.id),
    storyLines: [...gift.storyLines],
  }))
})
const unlockedGiftCount = computed(() => giftSlots.value.filter((gift) => gift.unlocked).length)
const detailItems = computed<RoleDetailItem[]>(() => {
  const notSet = t('settings.catAppearance.role.details.notSet')
  return [
    {
      id: 'personality',
      icon: SparklesIcon,
      title: t('settings.catAppearance.role.fields.personality.title'),
      value: props.role?.personality.trim() || notSet,
    },
    {
      id: 'background',
      icon: BookOpenIcon,
      title: t('settings.catAppearance.role.fields.background.title'),
      value: props.role?.background.trim() || notSet,
    },
  ]
})

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen && !petStateLoaded.value) {
      void loadPetState()
    }
  },
  { immediate: true }
)

watch(
  [() => props.open, () => props.role?.id],
  ([isOpen, roleId]) => {
    if (!isOpen || !roleId) {
      inventoryRequestId += 1
      inventory.value = undefined
      inventoryLoading.value = false
      return
    }
    void loadRoleInventory(roleId)
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  inventoryRequestId += 1
  catPetStore.dispose()
})

async function loadPetState(): Promise<void> {
  try {
    await catPetStore.load()
    petStateLoaded.value = true
  } catch (error) {
    toast.error(errorToText(error, t('catPet.errors.loadFailed')))
  }
}

async function loadRoleInventory(roleId: string): Promise<void> {
  const requestId = ++inventoryRequestId
  inventoryLoading.value = true
  try {
    const next = await catPetStore.loadInventory(roleId)
    if (requestId === inventoryRequestId && props.role?.id === next.roleId) {
      inventory.value = next
    }
  } catch (error) {
    if (requestId === inventoryRequestId) {
      toast.error(errorToText(error, t('catPet.errors.loadFailed')))
    }
  } finally {
    if (requestId === inventoryRequestId) {
      inventoryLoading.value = false
    }
  }
}

function giftImageSrc(gift: CatPetGiftDefinition): string {
  return catPetGiftImageSrc(gift.image, gift.id)
}

function giftSlotAria(gift: CatPetGiftDefinition): string {
  return gift.unlocked
    ? t('catPet.inventory.slotAria', { name: gift.name })
    : t('catPet.inventory.lockedSlotAria', { count: gift.unlockAffection })
}

function giftImageAlt(gift: CatPetGiftDefinition): string {
  return gift.unlocked
    ? t('catPet.inventory.imageAlt', { name: gift.name })
    : t('catPet.inventory.lockedImageAlt')
}

function giftSlotClass(gift: CatPetGiftDefinition): string {
  return cn(
    'relative size-16 overflow-hidden rounded-full border border-border/70 bg-background/60',
    gift.unlocked ? 'shadow-sm' : 'border-dashed'
  )
}

function giftSlotImageClass(gift: CatPetGiftDefinition): string {
  return cn('size-full object-cover', !gift.unlocked && 'blur-sm opacity-45 saturate-0')
}

function giftSlotPlaceholderClass(gift: CatPetGiftDefinition): string {
  return cn(
    'grid size-full place-items-center text-muted-foreground',
    !gift.unlocked && 'opacity-45'
  )
}

function editRole(): void {
  if (!props.role) return
  emit('update:open', false)
  emit('editRole', props.role)
}

function selectRole(): void {
  if (!props.role || isActive.value) return
  emit('selectRole', props.role)
}
</script>

<template>
  <Sheet
    :open="open"
    @update:open="emit('update:open', $event)"
  >
    <SheetContent
      side="right"
      class="w-full gap-0 p-0 sm:max-w-lg"
      :show-close-button="false"
    >
      <SheetHeader class="flex-row items-start gap-3 px-5 py-4 text-left">
        <SheetTitle class="min-w-0 flex-1">
          {{ t('settings.catAppearance.role.details.title') }}
        </SheetTitle>
        <SheetClose as-child>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            :aria-label="t('settings.catAppearance.role.details.close')"
          >
            <XIcon />
          </Button>
        </SheetClose>
      </SheetHeader>

      <Separator />

      <div
        v-if="role"
        class="min-h-0 flex-1 overflow-y-auto"
      >
        <section class="flex flex-col items-center gap-4 px-6 py-7 text-center">
          <div class="relative flex size-32 items-center justify-center rounded-full bg-muted/40">
            <span
              class="absolute inset-2 rounded-full border border-border/70"
              aria-hidden="true"
            />
            <Avatar class="size-28 border bg-background shadow-sm">
              <AvatarImage
                :src="avatarSrc"
                :alt="t('settings.catAppearance.role.overview.avatarAlt', { name: roleName })"
                :class="cn(customAvatar ? 'object-cover' : 'object-contain p-3')"
              />
              <AvatarFallback class="text-2xl">{{ roleInitial }}</AvatarFallback>
            </Avatar>
          </div>

          <div class="flex max-w-md flex-col items-center gap-2">
            <Badge variant="secondary">
              <span aria-hidden="true">{{ moodEmoji }}</span>
              {{ moodLabel }}
            </Badge>
            <h2 class="text-xl font-semibold tracking-tight">{{ roleName }}</h2>
            <p class="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
              {{ introduction }}
            </p>
          </div>
        </section>

        <Separator />

        <section
          :class="
            cn(
              'flex flex-col gap-4 px-5 py-5 transition-opacity',
              (loading || inventoryLoading) && 'opacity-60'
            )
          "
          :aria-busy="loading || inventoryLoading"
        >
          <div class="flex flex-col gap-2">
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs font-medium text-muted-foreground">
                {{ t('catPet.affection') }}
              </span>
              <span class="text-sm tabular-nums">
                <span class="font-semibold">{{ affection }}</span>
                <span class="text-muted-foreground"> / {{ affectionMax }}</span>
              </span>
            </div>
            <div
              class="relative h-2 w-full overflow-hidden rounded-full bg-muted"
              role="progressbar"
              :aria-valuenow="affection"
              :aria-valuemin="0"
              :aria-valuemax="affectionMax"
            >
              <div
                class="h-full rounded-full bg-foreground/70 transition-[width] duration-300 ease-out"
                :style="{ width: `${progressPercent}%` }"
              />
            </div>
          </div>

          <div class="flex flex-col gap-3 rounded-lg border border-border/70 bg-muted/20 p-4">
            <div class="flex items-center justify-between gap-2">
              <p class="text-xs font-medium text-muted-foreground">
                {{ t('catPet.inventory.title') }}
              </p>
              <Badge variant="outline">
                {{
                  t('catPet.inventory.count', {
                    count: unlockedGiftCount,
                    total: giftSlots.length,
                  })
                }}
              </Badge>
            </div>

            <div class="grid grid-cols-3 justify-items-center gap-3">
              <div
                v-for="gift in giftSlots"
                :key="gift.id"
                :class="giftSlotClass(gift)"
                :title="giftSlotAria(gift)"
              >
                <img
                  v-if="giftImageSrc(gift)"
                  :src="giftImageSrc(gift)"
                  :alt="giftImageAlt(gift)"
                  :class="giftSlotImageClass(gift)"
                  draggable="false"
                >
                <span
                  v-else
                  :class="giftSlotPlaceholderClass(gift)"
                >
                  <GiftIcon
                    class="size-5"
                    aria-hidden="true"
                  />
                </span>

                <span
                  v-if="!gift.unlocked"
                  class="absolute inset-0 grid place-items-center bg-background/15"
                  aria-hidden="true"
                >
                  <LockIcon class="size-4 text-foreground/75 drop-shadow-sm" />
                </span>
              </div>
            </div>
          </div>
        </section>

        <Separator />

        <section class="flex flex-col gap-3 px-5 py-5">
          <h3 class="text-sm font-semibold">
            {{ t('settings.catAppearance.role.details.profileTitle') }}
          </h3>

          <article
            v-for="item in detailItems"
            :key="item.id"
            class="flex flex-col gap-2 rounded-lg border bg-muted/20 p-4"
          >
            <div class="flex items-center gap-2 text-muted-foreground">
              <component
                :is="item.icon"
                class="size-4"
                aria-hidden="true"
              />
              <h4 class="text-xs font-medium">{{ item.title }}</h4>
            </div>
            <p class="whitespace-pre-wrap break-words text-sm leading-relaxed">
              {{ item.value }}
            </p>
          </article>
        </section>
      </div>

      <template v-if="role">
        <Separator />
        <SheetFooter class="grid grid-cols-2 p-4">
          <Button
            type="button"
            :variant="isActive ? 'secondary' : 'outline'"
            :disabled="isActive"
            @click="selectRole"
          >
            <CheckIcon data-icon="inline-start" />
            {{
              isActive
                ? t('settings.catAppearance.role.overview.selected')
                : t('settings.catAppearance.role.overview.select')
            }}
          </Button>
          <Button
            type="button"
            @click="editRole"
          >
            <PencilIcon data-icon="inline-start" />
            {{ t('settings.catAppearance.role.overview.edit') }}
          </Button>
        </SheetFooter>
      </template>
    </SheetContent>
  </Sheet>
</template>

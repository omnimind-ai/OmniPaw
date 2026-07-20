<script setup lang="ts">
import {
  ArrowLeftIcon,
  GiftIcon,
  HandIcon,
  HeartIcon,
  Loader2Icon,
  LockIcon,
  RefreshCwIcon,
  SmileIcon,
  SparklesIcon,
} from '@lucide/vue'
import { BUILTIN_CAT_APPEARANCE_PACK_ID } from '@shared/constants'
import type { CatAppearanceResolvedPack } from '@shared/types/cat-appearance'
import type {
  CatPetAction,
  CatPetGiftDefinition,
  CatPetInteractionDefinition,
} from '@shared/types/cat-pet'
import { defaultCatPetGiftConfigs } from '@shared/types/cat-pet'
import { storeToRefs } from 'pinia'
import type { Component } from 'vue'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { appBridge, type BridgeUnsubscribe } from '@/bridge/app'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useCatPetStore } from '@/stores/cat-pet'
import {
  BUILTIN_PET_IDLE_IMAGE_BY_PACK_ID,
  builtinPetAppearanceIdleImage,
} from '@/utils/builtin-pet-appearance-assets'
import { catPetGiftImageSrc } from '@/utils/cat-pet-gift-images'
import { errorToText, useToast } from '@/utils/toast'
import CatPanelGiftInventoryModal from './CatPanelGiftInventoryModal.vue'

defineProps<{
  sideLabel: string
  roleIntroduction: string
}>()

const emit = defineEmits<{
  showChat: []
}>()

const { t } = useI18n()
const toast = useToast()
const store = useCatPetStore()
const {
  state,
  affection,
  affectionMax,
  mood,
  interactions,
  todayUsage,
  limits,
  recent,
  progressPercent,
  remainingByAction,
  loading,
  performing,
} = storeToRefs(store)

const fallbackIdleImage = BUILTIN_PET_IDLE_IMAGE_BY_PACK_ID[BUILTIN_CAT_APPEARANCE_PACK_ID]
const idleImage = ref<string>(fallbackIdleImage)
const giftDialogOpen = ref(false)
const selectedGift = ref<CatPetGiftDefinition>()
let appearanceUnsubscribe: BridgeUnsubscribe | undefined

const actionIcons: Record<CatPetAction, Component> = {
  pat: HandIcon,
  tease: SparklesIcon,
  custom_100: SmileIcon,
  custom_150: HeartIcon,
}

function applyIdleAppearance(pack: CatAppearanceResolvedPack | undefined): void {
  const resolvedIdleImage = pack?.assets?.idle?.trim()
  idleImage.value =
    resolvedIdleImage ||
    (pack?.source === 'builtin' ? builtinPetAppearanceIdleImage(pack.id) : undefined) ||
    fallbackIdleImage
}

onMounted(async () => {
  try {
    await store.load()
  } catch (err) {
    toast.error(errorToText(err, t('catPet.errors.loadFailed')))
  }
  try {
    const pack = await appBridge.catAppearance.current()
    applyIdleAppearance(pack)
  } catch {
    applyIdleAppearance(undefined)
  }
  appearanceUnsubscribe = appBridge.catAppearance.onChanged((event) => {
    applyIdleAppearance(event.current)
  })
})

onBeforeUnmount(() => {
  appearanceUnsubscribe?.()
  store.dispose()
})

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
const awayLabel = computed(() => formatAwayLabel(state.value.awayMs ?? 0))

const recentLabel = computed(() => {
  const value = recent.value
  if (!value) return t('catPet.empty')
  return value.feedback?.trim() || t('catPet.feedbackFallback', { action: value.label })
})

const recentDeltaClass = computed(() =>
  recent.value?.outcome === 'positive' ? 'text-primary' : 'text-destructive'
)

const recentDeltaText = computed(() => {
  const value = recent.value
  if (!value) return ''
  return value.delta > 0 ? `+${value.delta}` : `${value.delta}`
})

const catImageClass = computed(() =>
  cn(
    'cat-pet-avatar h-32 w-32 select-none object-contain drop-shadow-sm',
    mood.value === 'angry' && 'cat-pet-avatar-angry',
    mood.value === 'sad' && 'cat-pet-avatar-sad',
    mood.value === 'down' && 'cat-pet-avatar-down',
    mood.value === 'happy' && 'cat-pet-avatar-happy',
    mood.value === 'attached' && 'cat-pet-avatar-attached'
  )
)

const visibleInteractions = computed(() => interactions.value.filter((item) => item.enabled))
const giftSlots = computed<CatPetGiftDefinition[]>(() => {
  if (state.value.gifts.length) {
    return state.value.gifts.slice(0, 3)
  }

  const unlockedIds = new Set(state.value.unlockedGifts.map((gift) => gift.id))
  const configs = state.value.giftConfigs.length
    ? state.value.giftConfigs
    : defaultCatPetGiftConfigs()
  return configs.slice(0, 3).map((gift) => ({
    ...gift,
    enabled: gift.enabled !== false,
    unlocked: unlockedIds.has(gift.id),
    storyLines: [...gift.storyLines],
  }))
})
const unlockedGiftCount = computed(() => giftSlots.value.filter((gift) => gift.unlocked).length)

function actionIcon(action: CatPetAction): Component {
  return actionIcons[action]
}

function actionLabel(action: CatPetAction): string {
  return interactions.value.find((item) => item.id === action)?.label ?? action
}

function actionHint(action: CatPetInteractionDefinition): string {
  return action.description?.trim() || t('catPet.action.defaultHint')
}

function actionDisabled(action: CatPetInteractionDefinition): boolean {
  return performing.value || !store.canPerform(action.id)
}

function actionTitle(action: CatPetInteractionDefinition): string {
  if (!action.unlocked) {
    return t('catPet.action.unlockTip', { count: action.unlockAffection })
  }
  if (remainingByAction.value[action.id] <= 0) {
    return t('catPet.action.limitTip')
  }
  return actionHint(action)
}

function actionStatus(action: CatPetInteractionDefinition): string {
  if (!action.unlocked) {
    return t('catPet.action.unlockShort', { count: action.unlockAffection })
  }
  return t('catPet.action.remaining', { count: remainingByAction.value[action.id] })
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
    'group relative size-16 shrink-0 overflow-hidden rounded-full border border-border/70 bg-background/60 outline-none transition hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60',
    gift.unlocked ? 'shadow-sm' : 'border-dashed'
  )
}

function giftSlotImageClass(gift: CatPetGiftDefinition): string {
  return cn(
    'size-full object-cover transition',
    gift.unlocked ? 'group-hover:scale-105' : 'blur-sm opacity-45 saturate-0'
  )
}

function giftSlotPlaceholderClass(gift: CatPetGiftDefinition): string {
  return cn(
    'grid size-full place-items-center text-muted-foreground transition',
    gift.unlocked ? 'bg-muted/40' : 'bg-muted/20 opacity-45'
  )
}

function openGift(gift: CatPetGiftDefinition): void {
  selectedGift.value = gift
  giftDialogOpen.value = true
}

async function handleAction(action: CatPetInteractionDefinition): Promise<void> {
  if (performing.value) return
  if (!action.unlocked) {
    toast.warning(t('catPet.action.unlockTip', { count: action.unlockAffection }))
    return
  }
  if (!store.canPerform(action.id)) {
    toast.warning(t('catPet.action.limitTip'))
    return
  }

  try {
    const response = await store.perform(action.id)
    if (!response.ok) {
      toast.warning(
        response.reason === 'disabled_action'
          ? t('catPet.action.disabledTip')
          : response.reason === 'locked_action'
            ? t('catPet.action.unlockTip', { count: action.unlockAffection })
            : t('catPet.action.limitTip')
      )
    }
  } catch (err) {
    toast.error(errorToText(err, t('catPet.errors.actionFailed')))
  }
}

async function handleRefresh(): Promise<void> {
  try {
    await store.load(true)
  } catch (err) {
    toast.error(errorToText(err, t('catPet.errors.loadFailed')))
  }
}

function dotClass(filled: boolean): string {
  return filled
    ? 'inline-block size-1.5 rounded-full bg-foreground/80'
    : 'inline-block size-1.5 rounded-full border border-muted-foreground/40 bg-transparent'
}

function formatAwayLabel(ms: number): string {
  if (ms < 6 * 60 * 60 * 1000) return ''
  const hours = Math.floor(ms / (60 * 60 * 1000))
  if (hours < 48) {
    return t('catPet.away.hours', { count: hours })
  }
  return t('catPet.away.days', { count: Math.floor(hours / 24) })
}
</script>

<template>
  <section
    class="cat-panel-status flex h-full min-h-0 w-full flex-col overflow-hidden rounded-lg border border-border/80 bg-background/95 text-foreground shadow-xl backdrop-blur"
    :aria-label="t('catPet.surfaceLabel')"
  >
    <header class="flex shrink-0 items-center gap-2 border-b border-border/70 px-3 py-2">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        class="size-8 shrink-0"
        :aria-label="t('catPet.back')"
        @click="emit('showChat')"
      >
        <ArrowLeftIcon />
      </Button>

      <div
        class="flex-1"
        aria-hidden="true"
      />

      <Badge
        variant="outline"
        class="hidden shrink-0 sm:inline-flex"
      >
        {{ sideLabel }}
      </Badge>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        class="size-8 shrink-0"
        :disabled="loading"
        :aria-label="t('catPet.refresh')"
        @click="handleRefresh"
      >
        <Loader2Icon
          v-if="loading"
          class="animate-spin"
        />
        <RefreshCwIcon v-else />
      </Button>
    </header>

    <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
      <div class="flex flex-col items-center gap-2">
        <div
          class="cat-pet-visual relative flex h-36 w-36 items-center justify-center rounded-full bg-muted/40"
          :data-mood="mood"
        >
          <span
            class="cat-pet-orbit absolute inset-2 rounded-full border border-border/60"
            aria-hidden="true"
          />
          <img
            :src="idleImage"
            :alt="t('catPet.title')"
            :class="catImageClass"
            draggable="false"
          >
        </div>
        <div class="flex flex-col items-center gap-1 text-center">
          <p
            class="max-w-md whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground"
          >
            {{ roleIntroduction }}
          </p>
          <Badge variant="secondary">
            <span aria-hidden="true">{{ moodEmoji }}</span>
            {{ moodLabel }}
          </Badge>
          <p
            v-if="awayLabel"
            class="text-xs text-muted-foreground"
          >
            {{ awayLabel }}
          </p>
        </div>
      </div>

      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between gap-2">
          <span class="text-xs font-medium text-muted-foreground">{{ t('catPet.affection') }}</span>
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

      <div class="flex flex-col gap-3 rounded-lg border border-border/70 bg-muted/30 px-3 py-3">
        <div class="flex items-center justify-between gap-2">
          <p class="text-xs font-medium text-muted-foreground">{{ t('catPet.todayInteractions') }}</p>
        </div>

        <div class="grid grid-cols-2 gap-2 text-sm">
          <div
            v-for="action in visibleInteractions"
            :key="`usage-${action.id}`"
            class="flex min-w-0 flex-col gap-1"
          >
            <span class="truncate text-xs text-muted-foreground">{{ action.label }}</span>
            <div class="flex items-center gap-1.5">
              <span class="font-medium tabular-nums">
                {{ todayUsage[action.id] }} / {{ limits[action.id] }}
              </span>
              <span class="flex gap-1 pl-1">
                <span
                  v-for="i in limits[action.id]"
                  :key="`${action.id}-${i}`"
                  :class="dotClass(i <= todayUsage[action.id])"
                  aria-hidden="true"
                />
              </span>
            </div>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <Button
          v-for="action in visibleInteractions"
          :key="action.id"
          type="button"
          variant="outline"
          class="h-14 min-w-0 flex-col gap-0.5 px-2"
          :disabled="actionDisabled(action)"
          :title="actionTitle(action)"
          @click="handleAction(action)"
        >
          <span class="flex max-w-full min-w-0 items-center gap-1.5 text-sm font-medium">
            <component
              :is="actionIcon(action.id)"
              data-icon="inline-start"
            />
            <span class="truncate">{{ action.label }}</span>
          </span>
          <span class="max-w-full truncate text-xs text-muted-foreground">
            {{ actionStatus(action) }}
          </span>
        </Button>
      </div>

      <div class="flex flex-col gap-1 rounded-lg border border-border/70 bg-muted/20 px-3 py-3">
        <p class="text-xs font-medium text-muted-foreground">{{ t('catPet.recent') }}</p>
        <div class="flex items-start justify-between gap-2">
          <p class="text-sm leading-relaxed">{{ recentLabel }}</p>
          <span
            v-if="recent"
            :class="['shrink-0 text-sm font-semibold tabular-nums', recentDeltaClass]"
          >
            {{ recentDeltaText }}
          </span>
        </div>
      </div>

      <div class="flex flex-col gap-2 rounded-lg border border-border/70 bg-muted/20 px-3 py-3">
        <div class="flex items-center justify-between gap-2">
          <p class="text-xs font-medium text-muted-foreground">{{ t('catPet.inventory.title') }}</p>
          <Badge variant="outline">
            {{ t('catPet.inventory.count', { count: unlockedGiftCount, total: giftSlots.length }) }}
          </Badge>
        </div>

        <div class="grid grid-cols-3 justify-items-center gap-2">
          <button
            v-for="gift in giftSlots"
            :key="gift.id"
            type="button"
            :class="giftSlotClass(gift)"
            :aria-label="giftSlotAria(gift)"
            :title="giftSlotAria(gift)"
            @click="openGift(gift)"
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
          </button>
        </div>
      </div>
    </div>

    <CatPanelGiftInventoryModal
      v-model:open="giftDialogOpen"
      :gift="selectedGift"
    />
  </section>
</template>

<style scoped>
.cat-pet-orbit {
  animation: cat-pet-orbit 4.8s ease-in-out infinite;
}

.cat-pet-avatar-happy {
  animation: cat-pet-happy 2.8s ease-in-out infinite;
}

.cat-pet-avatar-attached {
  animation: cat-pet-attached 2.4s ease-in-out infinite;
}

.cat-pet-avatar-down {
  animation: cat-pet-down 3.2s ease-in-out infinite;
}

.cat-pet-avatar-sad {
  animation: cat-pet-sad 3.6s ease-in-out infinite;
}

.cat-pet-avatar-angry {
  animation: cat-pet-angry 0.42s ease-in-out infinite alternate;
}

@keyframes cat-pet-orbit {
  0%,
  100% {
    transform: scale(0.96);
    opacity: 0.42;
  }

  50% {
    transform: scale(1.04);
    opacity: 0.72;
  }
}

@keyframes cat-pet-happy {
  0%,
  100% {
    transform: translateY(0);
  }

  50% {
    transform: translateY(-5px);
  }
}

@keyframes cat-pet-attached {
  0%,
  100% {
    transform: translateY(0) scale(1);
  }

  50% {
    transform: translateY(-4px) scale(1.04);
  }
}

@keyframes cat-pet-down {
  0%,
  100% {
    transform: translateY(2px);
    opacity: 0.88;
  }

  50% {
    transform: translateY(6px);
    opacity: 0.72;
  }
}

@keyframes cat-pet-sad {
  0%,
  100% {
    transform: translateY(4px) rotate(-1deg);
    opacity: 0.76;
  }

  50% {
    transform: translateY(7px) rotate(1deg);
    opacity: 0.62;
  }
}

@keyframes cat-pet-angry {
  from {
    transform: translateX(-2px) rotate(-1deg);
  }

  to {
    transform: translateX(2px) rotate(1deg);
  }
}
</style>

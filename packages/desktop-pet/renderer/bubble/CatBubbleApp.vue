<script setup lang="ts">
import { ChevronDownIcon, GiftIcon, XIcon } from '@lucide/vue'
import type { CatBubbleDismissReason, CatBubbleEvent, CatPanelPlacement } from '@shared/types/cat'
import type { CatPetGiftUnlock } from '@shared/types/cat-pet'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { appBridge } from '@/bridge/app'
import { useAppLanguage } from '@/composables/useAppLanguage'
import { useAppTheme } from '@/composables/useAppTheme'
import { cn } from '@/lib/utils'
import { useSettingsStore } from '@/stores/settings'
import { catPetGiftImageSrc } from '@/utils/cat-pet-gift-images'

type PanelSide = NonNullable<CatPanelPlacement['side']>

const settingsStore = useSettingsStore()
useAppLanguage()
useAppTheme()
const { t } = useI18n()

onMounted(() => {
  void settingsStore.load().catch(() => {})
})

const bubble = ref<CatBubbleEvent | null>(null)
const giftLineIndex = ref(0)
const side = ref<PanelSide>('right')
let autoDismissTimer: ReturnType<typeof window.setTimeout> | undefined
let autoDismissRemainingMs = 0
let autoDismissAt = 0

const visible = computed(() =>
  Boolean(bubble.value?.visible && (bubble.value.text.trim() || bubble.value.gift))
)
const isObservation = computed(() => bubble.value?.kind === 'observation')
const isGift = computed(() => bubble.value?.kind === 'gift' && Boolean(bubble.value.gift))
const bubbleText = computed(() => bubble.value?.text ?? '')
const giftUnlock = computed<CatPetGiftUnlock | undefined>(() => bubble.value?.gift)
const giftStoryLines = computed(() => {
  const lines = giftUnlock.value?.gift.storyLines.map((line) => line.trim()).filter(Boolean) ?? []
  return lines.length ? lines : [bubbleText.value].filter(Boolean)
})
const giftComplete = computed(
  () => isGift.value && giftLineIndex.value >= giftStoryLines.value.length
)
const activeGiftLine = computed(() => giftStoryLines.value[giftLineIndex.value] ?? '')
const giftImageSrc = computed(() =>
  catPetGiftImageSrc(giftUnlock.value?.gift.image, giftUnlock.value?.gift.id)
)

const pointerClass = computed(() =>
  side.value === 'right'
    ? '-left-1.5 -translate-y-1/2 rotate-45 border-r-0 border-t-0'
    : '-right-1.5 -translate-y-1/2 rotate-[225deg] border-r-0 border-t-0'
)
const pointerClasses = computed(() =>
  cn('absolute top-1/2 size-3 border border-border bg-popover shadow-sm', pointerClass.value)
)

const bubbleClass = computed(() =>
  cn(
    'relative flex min-h-16 w-full min-w-0 items-start gap-2 rounded-md border border-border bg-popover/95 p-3 text-popover-foreground shadow-xl outline-none backdrop-blur-sm transition-[transform,opacity]',
    visible.value ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0',
    isObservation.value || isGift.value
      ? 'cursor-pointer hover:bg-popover focus-visible:ring-2'
      : 'cursor-default',
    isObservation.value || isGift.value ? 'pr-10' : ''
  )
)

function clearAutoDismissTimer() {
  if (!autoDismissTimer) {
    return
  }

  window.clearTimeout(autoDismissTimer)
  autoDismissTimer = undefined
}

function scheduleAutoDismiss(delayMs: number) {
  clearAutoDismissTimer()
  autoDismissRemainingMs = Math.max(400, delayMs)
  autoDismissAt = Date.now() + autoDismissRemainingMs
  autoDismissTimer = window.setTimeout(() => {
    void dismissBubble('timeout')
  }, autoDismissRemainingMs)
}

function pauseAutoDismiss() {
  if (!autoDismissTimer) {
    return
  }

  autoDismissRemainingMs = Math.max(400, autoDismissAt - Date.now())
  clearAutoDismissTimer()
}

function resumeAutoDismiss() {
  if (autoDismissTimer || !bubble.value?.autoDismissMs) {
    return
  }

  scheduleAutoDismiss(autoDismissRemainingMs || bubble.value.autoDismissMs)
}

function applyBubbleEvent(event: CatBubbleEvent) {
  clearAutoDismissTimer()

  if (!event.visible || !event.text.trim()) {
    bubble.value = null
    return
  }

  bubble.value = event
  giftLineIndex.value = 0
  if (event.autoDismissMs) {
    scheduleAutoDismiss(event.autoDismissMs)
  }
}

function applyPlacement(placement: CatPanelPlacement) {
  side.value = placement.side === 'left' ? 'left' : 'right'
}

async function dismissBubble(reason: CatBubbleDismissReason) {
  const bubbleId = bubble.value?.id
  clearAutoDismissTimer()
  bubble.value = null
  await appBridge.cat.dismissBubble?.({
    ...(bubbleId ? { id: bubbleId } : {}),
    reason,
    source: 'cat-bubble',
  })
}

async function openObservationSource() {
  const reaction = bubble.value?.observationReaction
  if (!reaction) {
    return
  }

  await appBridge.cat.openObservationSource?.(reaction)
  await dismissBubble('source-opened')
}

function handleBubbleClick() {
  if (isGift.value) {
    advanceGiftStory()
    return
  }

  if (!isObservation.value) {
    return
  }

  void openObservationSource()
}

function handleBubbleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    void dismissBubble('close')
    return
  }

  if (!isObservation.value || (event.key !== 'Enter' && event.key !== ' ')) {
    if (isGift.value && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault()
      advanceGiftStory()
    }
    return
  }

  event.preventDefault()
  void openObservationSource()
}

function advanceGiftStory() {
  if (!isGift.value) {
    return
  }
  if (!giftComplete.value) {
    giftLineIndex.value += 1
    return
  }
  void dismissBubble('story-complete')
}

const unsubscribeBubble = appBridge.cat.onBubbleEvent?.(applyBubbleEvent) ?? (() => {})
const unsubscribePlacement = appBridge.cat.onBubblePlacement?.(applyPlacement) ?? (() => {})
appBridge.cat.reportBubbleReady?.()

onBeforeUnmount(() => {
  clearAutoDismissTimer()
  unsubscribeBubble()
  unsubscribePlacement()
})
</script>

<template>
  <main
    class="flex size-full min-h-0 min-w-0 items-center bg-transparent p-2 text-foreground"
    aria-live="polite"
  >
    <section
      v-if="visible"
      :class="bubbleClass"
      :role="isObservation || isGift ? 'button' : undefined"
      :tabindex="isObservation || isGift ? 0 : undefined"
      :aria-label="
        isObservation
          ? t('catWindow.bubble.viewObservationSource')
          : isGift
            ? t('catWindow.bubble.giftStoryAria')
            : undefined
      "
      @click="handleBubbleClick"
      @keydown="handleBubbleKeydown"
      @mouseenter="pauseAutoDismiss"
      @mouseleave="resumeAutoDismiss"
      @focusin="pauseAutoDismiss"
      @focusout="resumeAutoDismiss"
    >
      <div
        :class="pointerClasses"
        aria-hidden="true"
      />

      <template v-if="isGift && giftUnlock">
        <template v-if="giftComplete">
          <div class="grid size-10 shrink-0 place-items-center self-center overflow-hidden rounded-full border bg-muted">
            <img
              v-if="giftImageSrc"
              :src="giftImageSrc"
              :alt="t('catWindow.bubble.giftImageAlt', { name: giftUnlock.gift.name })"
              class="size-full object-cover"
            />
            <GiftIcon
              v-else
              class="size-7 text-muted-foreground"
              aria-hidden="true"
            />
          </div>

          <div class="flex min-w-0 flex-1 flex-col gap-1 self-center">
            <p class="break-words text-sm font-semibold leading-snug">
              {{ t('catWindow.bubble.giftReceived', { name: giftUnlock.gift.name }) }}
            </p>
            <p
              v-if="giftUnlock.gift.description"
              class="line-clamp-2 break-words text-xs text-muted-foreground"
            >
              {{ giftUnlock.gift.description }}
            </p>
          </div>
        </template>

        <p
          v-else
          class="min-w-0 flex-1 break-words pb-2 text-sm font-medium leading-snug"
        >
          {{ activeGiftLine }}
        </p>

        <ChevronDownIcon
          v-if="!giftComplete"
          class="story-continue-indicator absolute bottom-2 right-3 size-4 text-muted-foreground"
          aria-hidden="true"
        />
      </template>

      <p
        v-else
        class="min-w-0 flex-1 break-words text-sm font-medium leading-snug"
      >
        {{ bubbleText }}
      </p>

      <button
        v-if="isObservation || isGift"
        type="button"
        class="absolute right-2 top-2 grid size-6 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2"
        :aria-label="t(isGift ? 'catWindow.bubble.closeGift' : 'catWindow.bubble.closeBubble')"
        @click.stop="dismissBubble('close')"
      >
        <XIcon
          class="size-3.5"
          aria-hidden="true"
        />
      </button>
    </section>
  </main>
</template>

<style scoped>
.story-continue-indicator {
  animation: story-continue-bounce 1.25s ease-in-out infinite;
}

@keyframes story-continue-bounce {
  0%,
  100% {
    opacity: 0.45;
    transform: translateY(-1px);
  }

  50% {
    opacity: 0.95;
    transform: translateY(3px);
  }
}
</style>

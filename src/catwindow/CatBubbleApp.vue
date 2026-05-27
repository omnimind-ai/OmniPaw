<script setup lang="ts">
import type { CatBubbleDismissReason, CatBubbleEvent, CatPanelPlacement } from '@shared/types/cat'
import { XIcon } from 'lucide-vue-next'
import { computed, onBeforeUnmount, ref } from 'vue'
import { appBridge } from '@/bridge/app'
import { useAppTheme } from '@/composables/useAppTheme'
import { cn } from '@/lib/utils'

type PanelSide = NonNullable<CatPanelPlacement['side']>

useAppTheme()

const bubble = ref<CatBubbleEvent | null>(null)
const side = ref<PanelSide>('right')
let autoDismissTimer: ReturnType<typeof window.setTimeout> | undefined
let autoDismissRemainingMs = 0
let autoDismissAt = 0

const visible = computed(() => Boolean(bubble.value?.visible && bubble.value.text.trim()))
const isObservation = computed(() => bubble.value?.kind === 'observation')
const bubbleText = computed(() => bubble.value?.text ?? '')

const pointerClass = computed(() =>
  side.value === 'right'
    ? '-left-1.5 -translate-y-1/2 rotate-45 border-r-0 border-t-0'
    : '-right-1.5 -translate-y-1/2 rotate-[225deg] border-r-0 border-t-0'
)

const bubbleClass = computed(() =>
  cn(
    'relative flex min-h-16 w-full min-w-0 items-start gap-2 rounded-md border border-border bg-popover/95 p-3 text-popover-foreground shadow-xl outline-none backdrop-blur-sm transition-[transform,opacity]',
    visible.value ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0',
    isObservation.value ? 'cursor-pointer hover:bg-popover focus-visible:ring-2' : 'cursor-default'
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
    return
  }

  event.preventDefault()
  void openObservationSource()
}

const unsubscribeBubble = appBridge.cat.onBubbleEvent?.(applyBubbleEvent) ?? (() => {})
const unsubscribePlacement = appBridge.cat.onBubblePlacement?.(applyPlacement) ?? (() => {})

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
      :role="isObservation ? 'button' : undefined"
      :tabindex="isObservation ? 0 : undefined"
      :aria-label="isObservation ? '查看观察反应来源' : undefined"
      @click="handleBubbleClick"
      @keydown="handleBubbleKeydown"
      @mouseenter="pauseAutoDismiss"
      @mouseleave="resumeAutoDismiss"
      @focusin="pauseAutoDismiss"
      @focusout="resumeAutoDismiss"
    >
      <div
        :class="cn('absolute top-1/2 size-3 border border-border bg-popover shadow-sm', pointerClass)"
        aria-hidden="true"
      />

      <p class="min-w-0 flex-1 break-words text-sm font-medium leading-snug">
        {{ bubbleText }}
      </p>

      <button
        v-if="isObservation"
        type="button"
        class="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2"
        aria-label="关闭观察反应"
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

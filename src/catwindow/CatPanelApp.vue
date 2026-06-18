<script setup lang="ts">
import type { CatPanelPlacement } from '@shared/types/cat'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { appBridge } from '@/bridge/app'
import { Toaster } from '@/components/ui/sonner'
import { useAppLanguage } from '@/composables/useAppLanguage'
import { useAppTheme } from '@/composables/useAppTheme'
import { cn } from '@/lib/utils'
import { useSettingsStore } from '@/stores/settings'
import CatPanelChatSurface from './CatPanelChatSurface.vue'

type PanelSide = NonNullable<CatPanelPlacement['side']>

const settingsStore = useSettingsStore()
useAppLanguage()
useAppTheme()
const { t } = useI18n()

onMounted(() => {
  void settingsStore.load().catch(() => {})
})

const side = ref<PanelSide>('right')

const sideLabels: Record<PanelSide, string> = {
  left: t('catWindow.panel.alignmentLeft'),
  right: t('catWindow.panel.alignmentRight'),
}

const sideLabel = computed(() => sideLabels[side.value])

const pointerClass = computed(() =>
  side.value === 'right'
    ? 'left-3.5 -translate-y-1/2 rotate-45 border-r-0 border-t-0'
    : 'right-3.5 -translate-y-1/2 rotate-[225deg] border-r-0 border-t-0'
)
const pointerClasses = computed(() =>
  cn(
    'absolute top-1/2 z-10 size-3.5 border border-border bg-background shadow-sm',
    pointerClass.value
  )
)

function applyPlacement(placement: CatPanelPlacement) {
  side.value = placement.side === 'left' ? 'left' : 'right'
}

const unsubscribePlacement = appBridge.catPanel.onPlacement(applyPlacement)

onBeforeUnmount(() => {
  unsubscribePlacement()
})
</script>

<template>
  <main
    class="relative size-full p-5 text-foreground"
    :data-side="side"
    :aria-label="t('catWindow.panel.chatPanelLabel')"
  >
    <div
      :class="pointerClasses"
      aria-hidden="true"
    />

    <CatPanelChatSurface :side-label="sideLabel" />

    <Toaster
      close-button
      rich-colors
      position="top-right"
    />
  </main>
</template>

<style scoped>
:global(html),
:global(body),
:global(#app) {
  width: 100%;
  height: 100%;
  margin: 0;
  overflow: hidden;
  background: transparent;
}

:global(body) {
  min-width: 0;
  min-height: 0;
}
</style>

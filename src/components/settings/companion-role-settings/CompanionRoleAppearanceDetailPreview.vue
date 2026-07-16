<script setup lang="ts">
import { ImageIcon, PauseIcon, PlayIcon, RotateCcwIcon } from '@lucide/vue'
import type {
  CatAppearanceAssetKey,
  CatAppearancePackSummary,
  CatAppearanceResolvedPack,
} from '@shared/types/cat-appearance'
import type { ComponentPublicInstance } from 'vue'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import doTaskImage from '@/asserts/cat/anim_cat_doing_task.webp'
import draggedImage from '@/asserts/cat/anim_cat_dragging.webp'
import endTaskImage from '@/asserts/cat/anim_cat_end_doing.webp'
import finishImage from '@/asserts/cat/anim_cat_finish.webp'
import firstShowImage from '@/asserts/cat/anim_cat_show.webp'
import startTaskImage from '@/asserts/cat/anim_cat_start_doing.webp'
import doTaskFallbackImage from '@/asserts/cat/ic_cat_doing_task.png'
import firstShowFallbackImage from '@/asserts/cat/ic_cat_first_show.png'
import idleImage from '@/asserts/cat/ic_cat_normal.png'
import draggedFallbackImage from '@/asserts/cat/ic_cat_normal_dragging.png'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

const defaultAssetUrls: Partial<Record<CatAppearanceAssetKey, string>> = {
  show: firstShowImage,
  showFallback: firstShowFallbackImage,
  idle: idleImage,
  drag: draggedImage,
  dragFallback: draggedFallbackImage,
  startDoing: startTaskImage,
  doing: doTaskImage,
  doingFallback: doTaskFallbackImage,
  endDoing: endTaskImage,
  finish: finishImage,
}

const assetKeys: CatAppearanceAssetKey[] = [
  'idle',
  'show',
  'showFallback',
  'dragTransition',
  'drag',
  'dragFallback',
  'startDoing',
  'doing',
  'doingFallback',
  'endDoing',
  'finish',
]

const props = defineProps<{
  pack?: CatAppearancePackSummary
  detail?: CatAppearanceResolvedPack
  loading?: boolean
  error?: string
}>()

const { t } = useI18n()

interface AssetPreviewState {
  paused: boolean
  ready: boolean
  replayVersion: number
}

function createPreviewStates(): Record<CatAppearanceAssetKey, AssetPreviewState> {
  return Object.fromEntries(
    assetKeys.map((key) => [
      key,
      {
        paused: false,
        ready: false,
        replayVersion: 0,
      },
    ])
  ) as Record<CatAppearanceAssetKey, AssetPreviewState>
}

const previewStates = ref(createPreviewStates())
const imageElements = new Map<CatAppearanceAssetKey, HTMLImageElement>()
const canvasElements = new Map<CatAppearanceAssetKey, HTMLCanvasElement>()
const replayFrameIds = new Map<CatAppearanceAssetKey, number>()

const assetItems = computed(() =>
  assetKeys.map((key) => {
    const customSrc = props.detail?.assets[key]
    const src =
      customSrc ?? (props.detail?.source === 'builtin' ? defaultAssetUrls[key] : undefined)
    return {
      key,
      src,
      configured: Boolean(src),
      label: t(`settings.catAppearance.detail.assetActions.${key}`),
    }
  })
)

watch(
  () => [props.detail?.id, ...assetKeys.map((key) => props.detail?.assets[key])],
  () => {
    previewStates.value = createPreviewStates()
  }
)

function setImageElement(
  key: CatAppearanceAssetKey,
  element: Element | ComponentPublicInstance | null
) {
  if (element instanceof HTMLImageElement) {
    imageElements.set(key, element)
    return
  }

  imageElements.delete(key)
}

function setCanvasElement(
  key: CatAppearanceAssetKey,
  element: Element | ComponentPublicInstance | null
) {
  if (element instanceof HTMLCanvasElement) {
    canvasElements.set(key, element)
    return
  }

  canvasElements.delete(key)
}

function markPreviewReady(key: CatAppearanceAssetKey, event: Event) {
  if (event.currentTarget === imageElements.get(key)) {
    previewStates.value[key].ready = true
  }
}

function markPreviewUnavailable(key: CatAppearanceAssetKey, event: Event) {
  if (event.currentTarget === imageElements.get(key)) {
    previewStates.value[key].ready = false
  }
}

function buildReplaySource(source: string, replayVersion: number): string {
  if (replayVersion === 0) {
    return source
  }

  const url = new URL(source, window.location.href)
  if (url.protocol === 'data:' || url.protocol === 'blob:') {
    url.hash = `omnipaw-replay-${replayVersion}`
  } else {
    url.searchParams.set('omnipawReplay', String(replayVersion))
  }
  return url.toString()
}

async function replayPreview(key: CatAppearanceAssetKey) {
  const state = previewStates.value[key]
  state.paused = false
  state.ready = false

  await nextTick()

  const image = imageElements.get(key)
  if (!image) {
    return
  }

  image.removeAttribute('src')

  const previousFrameId = replayFrameIds.get(key)
  if (previousFrameId !== undefined) {
    window.cancelAnimationFrame(previousFrameId)
  }

  replayFrameIds.set(
    key,
    window.requestAnimationFrame(() => {
      replayFrameIds.delete(key)
      state.replayVersion += 1
    })
  )
}

function pausePreview(key: CatAppearanceAssetKey) {
  const state = previewStates.value[key]
  const image = imageElements.get(key)
  const canvas = canvasElements.get(key)

  if (!state.ready || !image || !canvas || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
    return
  }

  const renderedWidth = image.clientWidth || image.naturalWidth
  const renderedHeight = image.clientHeight || image.naturalHeight
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)

  canvas.width = Math.max(1, Math.round(renderedWidth * pixelRatio))
  canvas.height = Math.max(1, Math.round(renderedHeight * pixelRatio))
  canvas.style.width = `${renderedWidth}px`
  canvas.style.height = `${renderedHeight}px`

  const context = canvas.getContext('2d')
  if (!context) {
    return
  }

  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
  context.clearRect(0, 0, renderedWidth, renderedHeight)
  context.drawImage(image, 0, 0, renderedWidth, renderedHeight)
  state.paused = true
}

function togglePreviewPlayback(key: CatAppearanceAssetKey) {
  if (previewStates.value[key].paused) {
    void replayPreview(key)
    return
  }

  pausePreview(key)
}

onBeforeUnmount(() => {
  for (const frameId of replayFrameIds.values()) {
    window.cancelAnimationFrame(frameId)
  }
  replayFrameIds.clear()
})
</script>

<template>
  <div class="flex flex-col gap-3">
    <div
      v-if="loading"
      class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3"
    >
      <Skeleton
        v-for="index in 6"
        :key="index"
        class="h-40 w-full"
      />
    </div>

    <div
      v-else-if="error"
      class="rounded-md border px-4 py-6 text-sm text-muted-foreground"
    >
      {{ error }}
    </div>

    <TooltipProvider
      v-else
      :delay-duration="120"
    >
      <div
        class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3"
      >
        <div
          v-for="item in assetItems"
          :key="item.key"
          class="flex min-w-0 flex-col gap-3 rounded-md border bg-background/50 p-3"
        >
          <div class="flex min-w-0 items-center justify-between gap-2">
            <h3 class="truncate text-sm font-medium">
              {{ item.label }}
            </h3>
            <Badge
              v-if="!item.configured"
              variant="outline"
            >
              {{ t('settings.catAppearance.detail.notConfigured') }}
            </Badge>
          </div>

          <div
            class="relative flex aspect-[4/3] min-h-0 items-center justify-center overflow-hidden rounded-md bg-muted/50 p-3"
          >
            <img
              v-if="item.src && !previewStates[item.key].paused"
              :key="`${item.key}-${previewStates[item.key].replayVersion}`"
              :ref="(element) => setImageElement(item.key, element)"
              :src="buildReplaySource(item.src, previewStates[item.key].replayVersion)"
              :alt="t('settings.catAppearance.detail.assetAlt', { name: pack?.name || '', action: item.label })"
              class="max-h-full max-w-full object-contain"
              draggable="false"
              @load="markPreviewReady(item.key, $event)"
              @error="markPreviewUnavailable(item.key, $event)"
            >
            <canvas
              v-if="item.src"
              v-show="previewStates[item.key].paused"
              :ref="(element) => setCanvasElement(item.key, element)"
              class="max-h-full max-w-full object-contain"
              role="img"
              :aria-label="t('settings.catAppearance.detail.assetAlt', { name: pack?.name || '', action: item.label })"
            />
            <div
              v-else
              class="flex flex-col items-center gap-2 text-sm text-muted-foreground"
            >
              <ImageIcon class="size-8 opacity-50" />
              <span>{{ t('settings.catAppearance.detail.noPreview') }}</span>
            </div>

            <div
              v-if="item.src"
              class="absolute right-3 bottom-3 flex items-center gap-1 rounded-lg border bg-background/90 p-1 shadow-sm backdrop-blur-sm"
              role="group"
              :aria-label="t('settings.catAppearance.detail.previewControls.label', { action: item.label })"
            >
              <Tooltip>
                <TooltipTrigger as-child>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    :aria-label="t('settings.catAppearance.detail.previewControls.replay')"
                    :disabled="!previewStates[item.key].ready"
                    @click.stop="void replayPreview(item.key)"
                  >
                    <RotateCcwIcon data-icon="inline-start" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  :side-offset="6"
                >
                  {{ t('settings.catAppearance.detail.previewControls.replay') }}
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger as-child>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    :aria-label="
                      t(
                        previewStates[item.key].paused
                          ? 'settings.catAppearance.detail.previewControls.resume'
                          : 'settings.catAppearance.detail.previewControls.pause'
                      )
                    "
                    :disabled="!previewStates[item.key].ready"
                    :aria-pressed="previewStates[item.key].paused"
                    @click.stop="togglePreviewPlayback(item.key)"
                  >
                    <PlayIcon
                      v-if="previewStates[item.key].paused"
                      data-icon="inline-start"
                    />
                    <PauseIcon
                      v-else
                      data-icon="inline-start"
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  :side-offset="6"
                >
                  {{
                    t(
                      previewStates[item.key].paused
                        ? 'settings.catAppearance.detail.previewControls.resume'
                        : 'settings.catAppearance.detail.previewControls.pause'
                    )
                  }}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  </div>
</template>

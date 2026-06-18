<script setup lang="ts">
import { DownloadIcon, RotateCcwIcon, XIcon, ZoomInIcon, ZoomOutIcon } from 'lucide-vue-next'
import { DialogClose, DialogContent, DialogOverlay, DialogPortal, DialogTitle } from 'reka-ui'
import { computed, ref, watch } from 'vue'

import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  src: string
  title?: string
  alt?: string
}>()

const titleText = computed(() => props.title || props.alt || '图片预览')
const scale = ref(1)
const translateX = ref(0)
const translateY = ref(0)
const isDragging = ref(false)
const dragStartX = ref(0)
const dragStartY = ref(0)
const dragOriginX = ref(0)
const dragOriginY = ref(0)

const minScale = 0.5
const maxScale = 5
const scaleStep = 0.25

const imageTransform = computed(() => ({
  transform: `translate3d(${translateX.value}px, ${translateY.value}px, 0) scale(${scale.value})`,
}))

const canZoomOut = computed(() => scale.value > minScale)
const canZoomIn = computed(() => scale.value < maxScale)

watch(
  () => [open.value, props.src],
  () => {
    resetImage()
  }
)

function closeViewer() {
  open.value = false
}

function clampScale(value: number) {
  return Math.min(maxScale, Math.max(minScale, Number(value.toFixed(2))))
}

function updateScale(nextScale: number) {
  scale.value = clampScale(nextScale)
}

function zoomIn() {
  updateScale(scale.value + scaleStep)
}

function zoomOut() {
  updateScale(scale.value - scaleStep)
}

function resetImage() {
  scale.value = 1
  translateX.value = 0
  translateY.value = 0
  isDragging.value = false
}

function handleWheel(event: WheelEvent) {
  const direction = event.deltaY > 0 ? -scaleStep : scaleStep

  updateScale(scale.value + direction)
}

function startDrag(event: PointerEvent) {
  if (event.button !== 0) {
    return
  }

  isDragging.value = true
  dragStartX.value = event.clientX
  dragStartY.value = event.clientY
  dragOriginX.value = translateX.value
  dragOriginY.value = translateY.value
  event.currentTarget instanceof HTMLElement &&
    event.currentTarget.setPointerCapture(event.pointerId)
}

function dragImage(event: PointerEvent) {
  if (!isDragging.value) {
    return
  }

  translateX.value = dragOriginX.value + event.clientX - dragStartX.value
  translateY.value = dragOriginY.value + event.clientY - dragStartY.value
}

function stopDrag(event: PointerEvent) {
  if (!isDragging.value) {
    return
  }

  isDragging.value = false
  event.currentTarget instanceof HTMLElement &&
    event.currentTarget.releasePointerCapture(event.pointerId)
}

function downloadImage() {
  const link = document.createElement('a')
  link.href = props.src
  link.download = `${titleText.value || 'image'}`
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogPortal>
      <DialogOverlay
        class="fixed isolate z-50 bg-transparent duration-100 data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0 supports-backdrop-filter:backdrop-blur-md"
        style="top: var(--image-viewer-inset-top, var(--app-topbar-height)); right: var(--image-viewer-inset-right, 0); bottom: var(--image-viewer-inset-bottom, 0); left: var(--image-viewer-inset-left, 0); border-radius: var(--image-viewer-radius, 0);"
      />
      <DialogContent
        class="fixed z-50 flex min-h-0 flex-col overflow-hidden bg-transparent p-0 outline-none duration-100 data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0"
        style="top: var(--image-viewer-inset-top, var(--app-topbar-height)); right: var(--image-viewer-inset-right, 0); bottom: var(--image-viewer-inset-bottom, 0); left: var(--image-viewer-inset-left, 0); border-radius: var(--image-viewer-radius, 0);"
      >
        <DialogTitle class="sr-only">
          {{ titleText }}
        </DialogTitle>

        <div class="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <p class="pointer-events-auto min-w-0 truncate text-sm font-medium text-foreground">
            {{ titleText }}
          </p>

          <DialogClose as-child>
            <Button
              type="button"
              variant="outline"
              size="icon"
              class="pointer-events-auto rounded-full bg-background/80 shadow-sm backdrop-blur-md hover:bg-background"
              aria-label="关闭图片预览"
            >
              <XIcon />
              <span class="sr-only">关闭图片预览</span>
            </Button>
          </DialogClose>
        </div>

        <div
          class="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4 pb-24 pt-16 sm:p-8 sm:pb-28 sm:pt-16"
          @click.self="closeViewer"
          @wheel.prevent="handleWheel"
        >
          <img
            :src="src"
            :alt="alt || titleText"
            :style="imageTransform"
            class="max-h-[calc(100svh-var(--app-topbar-height)-8.5rem)] max-w-full select-none object-contain transition-transform duration-100 ease-out"
            :class="isDragging ? 'cursor-grabbing transition-none' : 'cursor-grab'"
            draggable="false"
            @dragstart.prevent
            @pointerdown.stop.prevent="startDrag"
            @pointermove.stop.prevent="dragImage"
            @pointerup.stop.prevent="stopDrag"
            @pointercancel.stop.prevent="stopDrag"
            @lostpointercapture="isDragging = false"
          >
        </div>

        <div class="pointer-events-none absolute inset-x-0 bottom-5 z-10 flex justify-center px-4 sm:bottom-7">
          <div class="pointer-events-auto flex items-center gap-1 rounded-full border border-border/70 bg-background/85 p-1 shadow-lg shadow-black/10 backdrop-blur-xl">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              class="size-9 rounded-full"
              :disabled="!canZoomIn"
              aria-label="放大图片"
              @click="zoomIn"
            >
              <ZoomInIcon />
              <span class="sr-only">放大图片</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              class="size-9 rounded-full"
              :disabled="!canZoomOut"
              aria-label="缩小图片"
              @click="zoomOut"
            >
              <ZoomOutIcon />
              <span class="sr-only">缩小图片</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              class="size-9 rounded-full"
              aria-label="恢复图片"
              @click="resetImage"
            >
              <RotateCcwIcon />
              <span class="sr-only">恢复图片</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              class="size-9 rounded-full"
              aria-label="下载图片"
              @click="downloadImage"
            >
              <DownloadIcon />
              <span class="sr-only">下载图片</span>
            </Button>
          </div>
        </div>
      </DialogContent>
    </DialogPortal>
  </Dialog>
</template>

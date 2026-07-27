import { CAT_APPEARANCE_ASSET_PROTOCOL } from '@shared/constants'
import type { CatDockSide, CatHitGeometry, CatWindowState } from '@shared/types/cat'
import type { CatAppearanceLayout } from '@shared/types/cat-appearance'
import {
  findAlphaContentBounds,
  fullNormalizedBounds,
  type NormalizedBounds,
  normalizeAlphaBoundsForContain,
  resolveNormalizedHitArea,
  unionNormalizedBounds,
} from './alpha-hit-area'
import type { CatVisualFrame } from './state-machine'

interface CatVisualViewOptions {
  reportHitGeometry: (geometry: CatHitGeometry) => void
}

export interface CatVisualView {
  applyDockSide: (side: CatDockSide) => void
  applyLayout: (layout: CatAppearanceLayout) => void
  resetHitAreaMeasurements: () => void
  render: (frame: CatVisualFrame) => void
  showInitialImage: (source: string) => void
  dispose: () => void
}

export function resolveCatVisualEffectPadding(
  state: CatWindowState,
  frameWidth: number,
  frameHeight: number
): number {
  const frameSize = Math.max(frameWidth, frameHeight)
  if (!Number.isFinite(frameSize) || frameSize <= 0) return 0
  if (state === 'dragging') {
    const rotationRadians = (4 * Math.PI) / 180
    const boundingScale =
      1.04 * (Math.abs(Math.cos(rotationRadians)) + Math.abs(Math.sin(rotationRadians)))
    return (frameSize * (boundingScale - 1)) / 2
  }
  if (state === 'completed') return (frameSize * (1.08 - 1)) / 2
  if (state === 'running') return 2
  return 0
}

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`Desktop pet visual element is missing: ${selector}`)
  return element
}

export function createCatVisualView(options: CatVisualViewOptions): CatVisualView {
  const surface = requireElement<HTMLElement>('.cat-surface')
  const imageFrame = requireElement<HTMLElement>('#cat-image-frame')
  let image = requireElement<HTMLImageElement>('#cat-image')
  let pendingImage: HTMLImageElement | undefined
  let activeFallbackSource = ''
  let appearanceBounds: NormalizedBounds | undefined
  let appearanceHitPadding = 2
  let hitAreaEpoch = 0
  let activeImageEpoch = 0
  let imageRequestEpoch = 0
  let hitAreaFrame: number | undefined
  let dockSide: CatDockSide = 'right'
  let visualState: CatWindowState = 'idle'
  const measuredBoundsBySource = new Map<string, NormalizedBounds | null>()

  function applyStateClasses(state: CatWindowState): void {
    visualState = state
    surface.classList.toggle('is-dragging', state === 'dragging')
    surface.classList.toggle('is-running', state === 'running')
    surface.classList.toggle('is-completed', state === 'completed')
  }

  function showImage(source: string, fallback = source): void {
    imageRequestEpoch += 1
    const requestEpoch = imageRequestEpoch
    const sourceEpoch = hitAreaEpoch
    pendingImage?.remove()

    const nextImage = document.createElement('img')
    pendingImage = nextImage
    nextImage.alt = ''
    nextImage.draggable = false
    nextImage.decoding = 'async'
    nextImage.style.visibility = 'hidden'
    nextImage.crossOrigin = source.startsWith(`${CAT_APPEARANCE_ASSET_PROTOCOL}:`)
      ? 'anonymous'
      : null

    const commitImage = () => {
      if (imageRequestEpoch !== requestEpoch || pendingImage !== nextImage) {
        nextImage.remove()
        return
      }

      pendingImage = undefined
      nextImage.removeEventListener('error', handlePendingImageError)
      image.removeEventListener('error', handleActiveImageError)
      image.removeAttribute('id')
      nextImage.id = 'cat-image'
      nextImage.style.removeProperty('visibility')

      const previousImage = image
      image = nextImage
      activeFallbackSource = fallback
      activeImageEpoch = sourceEpoch
      image.addEventListener('error', handleActiveImageError)
      previousImage.remove()
      handleImageLoad()
    }

    const handlePendingImageError = () => {
      if (imageRequestEpoch !== requestEpoch || pendingImage !== nextImage) {
        nextImage.remove()
        return
      }

      pendingImage = undefined
      nextImage.remove()
      if (fallback && fallback !== source) {
        showImage(fallback, fallback)
      }
    }

    nextImage.addEventListener('load', commitImage, { once: true })
    nextImage.addEventListener('error', handlePendingImageError, { once: true })
    imageFrame.appendChild(nextImage)
    nextImage.src = source
  }

  function handleActiveImageError(): void {
    const fallback = activeFallbackSource
    activeFallbackSource = ''
    if (fallback && fallback !== image.currentSrc && fallback !== image.src) {
      showImage(fallback, fallback)
    }
  }

  function sourceHitPadding(source: string): number {
    const pathname = (() => {
      try {
        return new URL(source, window.location.href).pathname
      } catch {
        return source.split(/[?#]/, 1)[0] ?? ''
      }
    })()
    return /\.(?:avif|gif|webp)$/i.test(pathname) ? 5 : 2
  }

  function measureLoadedImage(): NormalizedBounds | null {
    if (!image.naturalWidth || !image.naturalHeight) return null

    const source = image.currentSrc || image.src
    const cached = measuredBoundsBySource.get(source)
    if (cached !== undefined || measuredBoundsBySource.has(source)) return cached ?? null

    let normalizedBounds: NormalizedBounds | null = null
    try {
      const maxMeasurementDimension = 512
      const measurementScale = Math.min(
        1,
        maxMeasurementDimension / Math.max(image.naturalWidth, image.naturalHeight)
      )
      const width = Math.max(1, Math.round(image.naturalWidth * measurementScale))
      const height = Math.max(1, Math.round(image.naturalHeight * measurementScale))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (context) {
        context.drawImage(image, 0, 0, width, height)
        const pixels = context.getImageData(0, 0, width, height).data
        const pixelBounds = findAlphaContentBounds(pixels, width, height)
        normalizedBounds = pixelBounds
          ? normalizeAlphaBoundsForContain(pixelBounds, width, height)
          : null
      }
    } catch {
      normalizedBounds = null
    }

    if (measuredBoundsBySource.size >= 64) {
      const oldestSource = measuredBoundsBySource.keys().next().value
      if (oldestSource) measuredBoundsBySource.delete(oldestSource)
    }
    measuredBoundsBySource.set(source, normalizedBounds)
    return normalizedBounds
  }

  function scheduleHitAreaReport(): void {
    if (hitAreaFrame !== undefined) window.cancelAnimationFrame(hitAreaFrame)
    hitAreaFrame = window.requestAnimationFrame(() => {
      hitAreaFrame = undefined
      const rect = imageFrame.getBoundingClientRect()
      const viewport = {
        width: document.documentElement.clientWidth || window.innerWidth,
        height: document.documentElement.clientHeight || window.innerHeight,
      }
      const effectPadding = resolveCatVisualEffectPadding(visualState, rect.width, rect.height)
      const fallbackArea = resolveNormalizedHitArea(fullNormalizedBounds, rect, viewport, {
        padding: effectPadding,
      }) ?? {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      }
      const visualAreas = appearanceBounds
        ? {
            left:
              resolveNormalizedHitArea(appearanceBounds, rect, viewport, {
                mirrored: true,
                padding: effectPadding,
              }) ?? fallbackArea,
            right:
              resolveNormalizedHitArea(appearanceBounds, rect, viewport, {
                padding: effectPadding,
              }) ?? fallbackArea,
          }
        : {
            left: fallbackArea,
            right: fallbackArea,
          }
      const hitArea = appearanceBounds
        ? (resolveNormalizedHitArea(appearanceBounds, rect, viewport, {
            mirrored: dockSide === 'left',
            padding: appearanceHitPadding + effectPadding,
          }) ?? fallbackArea)
        : fallbackArea

      options.reportHitGeometry({ hitArea, visualAreas })
    })
  }

  function handleImageLoad(): void {
    if (activeImageEpoch !== hitAreaEpoch) return
    const measuredBounds = measureLoadedImage()
    if (measuredBounds) {
      appearanceBounds = unionNormalizedBounds(appearanceBounds, measuredBounds)
      appearanceHitPadding = Math.max(
        appearanceHitPadding,
        sourceHitPadding(image.currentSrc || image.src)
      )
    }
    scheduleHitAreaReport()
  }

  image.addEventListener('error', handleActiveImageError)

  return {
    applyDockSide(side) {
      dockSide = side
      surface.classList.toggle('is-docked-left', side === 'left')
      scheduleHitAreaReport()
    },
    applyLayout(layout) {
      imageFrame.style.setProperty('--cat-image-scale', String(layout.scale))
      scheduleHitAreaReport()
    },
    resetHitAreaMeasurements() {
      hitAreaEpoch += 1
      appearanceBounds = undefined
      appearanceHitPadding = 2
      scheduleHitAreaReport()
    },
    render(frame) {
      applyStateClasses(frame.state)
      if (frame.state === 'dragging' || frame.state === 'completed') {
        appearanceHitPadding = Math.max(appearanceHitPadding, 5)
      }
      scheduleHitAreaReport()
      showImage(frame.source, frame.fallback)
    },
    showInitialImage(source) {
      showImage(source)
    },
    dispose() {
      imageRequestEpoch += 1
      pendingImage?.remove()
      pendingImage = undefined
      if (hitAreaFrame !== undefined) window.cancelAnimationFrame(hitAreaFrame)
      image.removeEventListener('error', handleActiveImageError)
      measuredBoundsBySource.clear()
    },
  }
}

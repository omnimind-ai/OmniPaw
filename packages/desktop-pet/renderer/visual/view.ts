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

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`Desktop pet visual element is missing: ${selector}`)
  return element
}

export function createCatVisualView(options: CatVisualViewOptions): CatVisualView {
  const surface = requireElement<HTMLElement>('.cat-surface')
  const imageFrame = requireElement<HTMLElement>('#cat-image-frame')
  const image = requireElement<HTMLImageElement>('#cat-image')
  let fallbackSource = ''
  let suppressNextImageError = false
  let appearanceBounds: NormalizedBounds | undefined
  let appearanceHitPadding = 2
  let hitAreaEpoch = 0
  let activeImageEpoch = 0
  let imageSourceFrame: number | undefined
  let hitAreaFrame: number | undefined
  let dockSide: CatDockSide = 'right'
  const measuredBoundsBySource = new Map<string, NormalizedBounds | null>()

  function applyStateClasses(state: CatWindowState): void {
    surface.classList.toggle('is-dragging', state === 'dragging')
    surface.classList.toggle('is-running', state === 'running')
    surface.classList.toggle('is-completed', state === 'completed')
  }

  function showImage(source: string, fallback = source): void {
    fallbackSource = fallback
    suppressNextImageError = false
    if (imageSourceFrame !== undefined) window.cancelAnimationFrame(imageSourceFrame)
    image.removeAttribute('src')
    const sourceEpoch = hitAreaEpoch
    imageSourceFrame = window.requestAnimationFrame(() => {
      imageSourceFrame = undefined
      activeImageEpoch = sourceEpoch
      image.crossOrigin = source.startsWith(`${CAT_APPEARANCE_ASSET_PROTOCOL}:`)
        ? 'anonymous'
        : null
      image.src = source
    })
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
      const fallbackArea = resolveNormalizedHitArea(fullNormalizedBounds, rect, viewport) ?? {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      }
      const visualAreas = appearanceBounds
        ? {
            left:
              resolveNormalizedHitArea(appearanceBounds, rect, viewport, { mirrored: true }) ??
              fallbackArea,
            right: resolveNormalizedHitArea(appearanceBounds, rect, viewport) ?? fallbackArea,
          }
        : {
            left: fallbackArea,
            right: fallbackArea,
          }
      const hitArea = appearanceBounds
        ? (resolveNormalizedHitArea(appearanceBounds, rect, viewport, {
            mirrored: dockSide === 'left',
            padding: appearanceHitPadding,
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

  function handleImageError(): void {
    if (suppressNextImageError || !fallbackSource) return
    suppressNextImageError = true
    image.crossOrigin = fallbackSource.startsWith(`${CAT_APPEARANCE_ASSET_PROTOCOL}:`)
      ? 'anonymous'
      : null
    image.src = fallbackSource
  }

  image.addEventListener('load', handleImageLoad)
  image.addEventListener('error', handleImageError)

  return {
    applyDockSide(side) {
      dockSide = side
      surface.classList.toggle('is-docked-left', side === 'left')
      scheduleHitAreaReport()
    },
    applyLayout(layout) {
      imageFrame.style.setProperty('--cat-image-scale', String(layout.scale))
      imageFrame.style.setProperty('--cat-image-offset-x', `${layout.offsetX}px`)
      imageFrame.style.setProperty('--cat-image-offset-y', `${layout.offsetY}px`)
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
      showImage(frame.source, frame.fallback)
    },
    showInitialImage(source) {
      showImage(source)
    },
    dispose() {
      if (imageSourceFrame !== undefined) window.cancelAnimationFrame(imageSourceFrame)
      if (hitAreaFrame !== undefined) window.cancelAnimationFrame(hitAreaFrame)
      image.removeEventListener('load', handleImageLoad)
      image.removeEventListener('error', handleImageError)
      measuredBoundsBySource.clear()
    },
  }
}

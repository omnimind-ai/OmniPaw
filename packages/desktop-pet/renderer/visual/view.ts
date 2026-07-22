import type { CatDockSide, CatHitArea, CatWindowState } from '@shared/types/cat'
import type { CatAppearanceLayout } from '@shared/types/cat-appearance'
import type { CatVisualFrame } from './state-machine'

interface CatVisualViewOptions {
  reportHitArea: (area: CatHitArea) => void
}

export interface CatVisualView {
  applyDockSide: (side: CatDockSide) => void
  applyLayout: (layout: CatAppearanceLayout) => void
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

  function applyStateClasses(state: CatWindowState): void {
    surface.classList.toggle('is-dragging', state === 'dragging')
    surface.classList.toggle('is-running', state === 'running')
    surface.classList.toggle('is-completed', state === 'completed')
  }

  function showImage(source: string, fallback = source): void {
    fallbackSource = fallback
    suppressNextImageError = false
    image.removeAttribute('src')
    window.requestAnimationFrame(() => {
      image.src = source
    })
  }

  function reportHitArea(): void {
    window.requestAnimationFrame(() => {
      const rect = imageFrame.getBoundingClientRect()
      options.reportHitArea({
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      })
    })
  }

  function handleImageError(): void {
    if (suppressNextImageError || !fallbackSource) return
    suppressNextImageError = true
    image.src = fallbackSource
  }

  image.addEventListener('error', handleImageError)

  return {
    applyDockSide(side) {
      surface.classList.toggle('is-docked-left', side === 'left')
    },
    applyLayout(layout) {
      imageFrame.style.setProperty('--cat-image-scale', String(layout.scale))
      imageFrame.style.setProperty('--cat-image-offset-x', `${layout.offsetX}px`)
      imageFrame.style.setProperty('--cat-image-offset-y', `${layout.offsetY}px`)
      reportHitArea()
    },
    render(frame) {
      applyStateClasses(frame.state)
      showImage(frame.source, frame.fallback)
    },
    showInitialImage(source) {
      showImage(source)
    },
    dispose() {
      image.removeEventListener('error', handleImageError)
    },
  }
}

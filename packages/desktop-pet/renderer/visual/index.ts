import type { CatCommandEvent, CatWindowState } from '@shared/types/cat'
import type {
  CatAppearanceAssetKey,
  CatAppearanceDurations,
  CatAppearanceLayout,
  CatAppearanceResolvedPack,
} from '@shared/types/cat-appearance'
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
import { appBridge } from '@/bridge/app'

const surface = document.querySelector<HTMLElement>('.cat-surface')
const imageFrame = document.querySelector<HTMLElement>('#cat-image-frame')
const image = document.querySelector<HTMLImageElement>('#cat-image')

const states = Object.freeze({
  HIDDEN: 'hidden',
  APPEARING: 'appearing',
  IDLE: 'idle',
  DRAGGING: 'dragging',
  PREPARING: 'preparing',
  RUNNING: 'running',
  COMPLETED: 'completed',
} satisfies Record<string, CatWindowState>)

type RequiredCatWindowAssetKey = Exclude<CatAppearanceAssetKey, 'dragTransition'>
type CatWindowAssets = Record<RequiredCatWindowAssetKey, string> &
  Partial<Record<'dragTransition', string>>

const defaultAssets = Object.freeze({
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
} satisfies CatWindowAssets)

const defaultAnimationDurations = Object.freeze({
  appearing: 1000,
  dragTransition: 1100,
  preparing: 1050,
  completedEnd: 980,
  completedFinish: 1500,
})

const catWindowRenderSize = 116
const defaultBuiltinLayout = Object.freeze({
  scale: 86 / catWindowRenderSize,
  offsetX: 0,
  offsetY: 0,
} satisfies CatAppearanceLayout)
const defaultLocalLayout = Object.freeze({
  scale: 1,
  offsetX: 0,
  offsetY: 0,
} satisfies CatAppearanceLayout)

let assets: CatWindowAssets = {
  ...defaultAssets,
}

let animationDurations: CatAppearanceDurations = {
  ...defaultAnimationDurations,
}

let appearanceLayout: CatAppearanceLayout = {
  ...defaultBuiltinLayout,
}

let currentState: CatWindowState = states.HIDDEN
let firstShow = true
let stateTimer: ReturnType<typeof window.setTimeout> | null = null
let suppressNextImageError = false

function clearStateTimer() {
  if (stateTimer) {
    window.clearTimeout(stateTimer)
    stateTimer = null
  }
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function normalizeLayout(
  layout: Partial<CatAppearanceLayout> | undefined,
  fallback: CatAppearanceLayout
): CatAppearanceLayout {
  return {
    scale:
      typeof layout?.scale === 'number' && Number.isFinite(layout.scale)
        ? clampNumber(layout.scale, 0.25, 2)
        : fallback.scale,
    offsetX:
      typeof layout?.offsetX === 'number' && Number.isFinite(layout.offsetX)
        ? clampNumber(layout.offsetX, -catWindowRenderSize, catWindowRenderSize)
        : fallback.offsetX,
    offsetY:
      typeof layout?.offsetY === 'number' && Number.isFinite(layout.offsetY)
        ? clampNumber(layout.offsetY, -catWindowRenderSize, catWindowRenderSize)
        : fallback.offsetY,
  }
}

function applyCatLayout(layout: CatAppearanceLayout) {
  if (!imageFrame) return
  imageFrame.style.setProperty('--cat-image-scale', String(layout.scale))
  imageFrame.style.setProperty('--cat-image-offset-x', `${layout.offsetX}px`)
  imageFrame.style.setProperty('--cat-image-offset-y', `${layout.offsetY}px`)
  reportHitArea()
}

function reportHitArea() {
  if (!imageFrame) return
  window.requestAnimationFrame(() => {
    const rect = imageFrame.getBoundingClientRect()
    void appBridge.cat.setHitArea({
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
    })
  })
}

function reportState(state: CatWindowState) {
  appBridge.cat.reportState(state)
}

function setSurfaceState(state: CatWindowState) {
  if (!surface) return
  surface.classList.toggle('is-dragging', state === states.DRAGGING)
  surface.classList.toggle('is-running', state === states.RUNNING)
  surface.classList.toggle('is-completed', state === states.COMPLETED)
}

function setImage(src: string, fallback = assets.idle) {
  if (!image) return
  suppressNextImageError = false
  image.dataset.fallback = fallback
  image.removeAttribute('src')

  window.requestAnimationFrame(() => {
    image.src = src
  })
}

function enterState(state: CatWindowState) {
  if (!Object.values(states).includes(state)) {
    return
  }

  clearStateTimer()
  currentState = state

  setSurfaceState(state)
  reportState(state)

  switch (state) {
    case states.HIDDEN:
      setImage(assets.idle)
      break
    case states.APPEARING:
      setImage(assets.show, assets.showFallback)
      stateTimer = window.setTimeout(() => {
        firstShow = false
        enterState(states.IDLE)
      }, animationDurations.appearing)
      break
    case states.IDLE:
      setImage(assets.idle)
      break
    case states.DRAGGING:
      if (assets.dragTransition) {
        setImage(assets.dragTransition, assets.dragFallback)
        stateTimer = window.setTimeout(() => {
          if (currentState === states.DRAGGING) {
            setImage(assets.drag, assets.dragFallback)
          }
        }, animationDurations.dragTransition)
        break
      }
      setImage(assets.drag, assets.dragFallback)
      break
    case states.PREPARING:
      setImage(assets.startDoing, assets.doingFallback)
      stateTimer = window.setTimeout(() => {
        if (currentState === states.PREPARING) {
          setImage(assets.doingFallback)
        }
      }, animationDurations.preparing)
      break
    case states.RUNNING:
      setImage(assets.doing, assets.doingFallback)
      break
    case states.COMPLETED:
      setImage(assets.endDoing, assets.doingFallback)
      stateTimer = window.setTimeout(() => {
        if (currentState !== states.COMPLETED) {
          return
        }

        setImage(assets.finish, assets.idle)
        stateTimer = window.setTimeout(() => {
          if (currentState === states.COMPLETED) {
            enterState(states.IDLE)
          }
        }, animationDurations.completedFinish)
      }, animationDurations.completedEnd)
      break
  }
}

function applyCatAppearance(pack: CatAppearanceResolvedPack) {
  const customAssets = Object.fromEntries(
    Object.entries(pack.assets || {}).filter(([, value]) => typeof value === 'string' && value)
  ) as Partial<Record<CatAppearanceAssetKey, string>>
  const fallbackLayout = pack.source === 'builtin' ? defaultBuiltinLayout : defaultLocalLayout

  assets = {
    ...defaultAssets,
    ...customAssets,
  }
  animationDurations = {
    ...defaultAnimationDurations,
    ...pack.durations,
  }
  appearanceLayout = normalizeLayout(pack.layout, fallbackLayout)
  applyCatLayout(appearanceLayout)
  enterState(currentState)
}

async function loadCatAppearance() {
  try {
    applyCatAppearance(await appBridge.catAppearance.current())
  } catch {
    assets = {
      ...defaultAssets,
    }
    animationDurations = {
      ...defaultAnimationDurations,
    }
    appearanceLayout = {
      ...defaultBuiltinLayout,
    }
    applyCatLayout(appearanceLayout)
  }
}

function handleCommand(payload: CatCommandEvent) {
  const nextState = payload?.state

  if (!nextState) {
    return
  }

  if (nextState === states.IDLE && firstShow && currentState === states.HIDDEN) {
    enterState(states.APPEARING)
    return
  }

  enterState(nextState)
}

image?.addEventListener('error', () => {
  if (suppressNextImageError || !image) {
    return
  }

  const fallback = image.dataset.fallback || assets.idle
  suppressNextImageError = true
  image.src = fallback
})

appBridge.cat.onCommand(handleCommand)
appBridge.catAppearance.onChanged((event) => {
  applyCatAppearance(event.current)
})

if (image) {
  applyCatLayout(appearanceLayout)
  setImage(idleImage)
}

void loadCatAppearance()

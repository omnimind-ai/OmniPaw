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

type RequiredCatWindowAssetKey = Exclude<CatAppearanceAssetKey, 'dragTransition'>

export type CatVisualAssets = Record<RequiredCatWindowAssetKey, string> &
  Partial<Record<'dragTransition', string>>

export interface CatVisualAppearance {
  assets: CatVisualAssets
  durations: CatAppearanceDurations
  layout: CatAppearanceLayout
}

const catWindowRenderSize = 116

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
} satisfies CatVisualAssets)

const defaultDurations = Object.freeze({
  appearing: 1000,
  dragTransition: 1100,
  preparing: 1050,
  completedEnd: 980,
  completedFinish: 1500,
} satisfies CatAppearanceDurations)

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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function normalizeLayout(
  layout: Partial<CatAppearanceLayout> | undefined,
  fallback: CatAppearanceLayout
): CatAppearanceLayout {
  return {
    scale:
      typeof layout?.scale === 'number' && Number.isFinite(layout.scale)
        ? clamp(layout.scale, 0.25, 2)
        : fallback.scale,
    offsetX:
      typeof layout?.offsetX === 'number' && Number.isFinite(layout.offsetX)
        ? clamp(layout.offsetX, -catWindowRenderSize, catWindowRenderSize)
        : fallback.offsetX,
    offsetY:
      typeof layout?.offsetY === 'number' && Number.isFinite(layout.offsetY)
        ? clamp(layout.offsetY, -catWindowRenderSize, catWindowRenderSize)
        : fallback.offsetY,
  }
}

export function createDefaultCatVisualAppearance(): CatVisualAppearance {
  return {
    assets: { ...defaultAssets },
    durations: { ...defaultDurations },
    layout: { ...defaultBuiltinLayout },
  }
}

export function resolveCatVisualAppearance(pack: CatAppearanceResolvedPack): CatVisualAppearance {
  const customAssets = Object.fromEntries(
    Object.entries(pack.assets || {}).filter(([, value]) => typeof value === 'string' && value)
  ) as Partial<Record<CatAppearanceAssetKey, string>>

  return {
    assets: {
      ...defaultAssets,
      ...customAssets,
    },
    durations: {
      ...defaultDurations,
      ...pack.durations,
    },
    layout: normalizeLayout(
      pack.layout,
      pack.source === 'builtin' ? defaultBuiltinLayout : defaultLocalLayout
    ),
  }
}

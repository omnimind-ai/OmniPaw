import { BUILTIN_CAT_APPEARANCE_PACK_ID } from '@shared/constants'
import type {
  CatAppearanceAssetKey,
  CatAppearanceDurations,
  CatAppearanceLayout,
  CatAppearanceResolvedPack,
} from '@shared/types/cat-appearance'
import {
  BUILTIN_PET_APPEARANCE_ASSETS,
  builtinPetAppearanceAssets,
} from '@/utils/builtin-pet-appearance-assets'

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
  ...BUILTIN_PET_APPEARANCE_ASSETS[BUILTIN_CAT_APPEARANCE_PACK_ID],
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
} satisfies CatAppearanceLayout)

const defaultLocalLayout = Object.freeze({
  scale: 1,
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
  const builtinAssets = pack.source === 'builtin' ? builtinPetAppearanceAssets(pack.id) : undefined

  return {
    assets: {
      ...defaultAssets,
      ...builtinAssets,
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

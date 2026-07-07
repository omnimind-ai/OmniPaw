import type {
  CatAppearanceDurations,
  CatAppearanceLayout,
  CatAppearancePackSummary,
} from '@shared/types/cat-appearance'

export const BUILTIN_CAT_APPEARANCE_PACK_ID = 'builtin'

export const BUILTIN_CAT_APPEARANCE_PACK: CatAppearancePackSummary = {
  id: BUILTIN_CAT_APPEARANCE_PACK_ID,
  name: 'OmniPaw Cat',
  description: 'Built-in OmniPaw cat appearance.',
  source: 'builtin',
  status: 'available',
  active: false,
}

export const DEFAULT_CAT_APPEARANCE_DURATIONS: CatAppearanceDurations = {
  appearing: 1000,
  dragTransition: 1100,
  preparing: 1050,
  completedEnd: 980,
  completedFinish: 1500,
}

export const DEFAULT_CAT_APPEARANCE_LAYOUT: CatAppearanceLayout = {
  scale: 1,
  offsetX: 0,
  offsetY: 0,
}

export const BUILTIN_CAT_APPEARANCE_LAYOUT: CatAppearanceLayout = {
  scale: 86 / 116,
  offsetX: 0,
  offsetY: 0,
}

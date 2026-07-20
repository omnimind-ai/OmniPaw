import {
  BUILTIN_APPEARANCE_PACK_IDS,
  BUILTIN_CAT_APPEARANCE_PACK_ID,
  BUILTIN_DOG_APPEARANCE_PACK_ID,
} from '@shared/constants'
import type {
  CatAppearanceDurations,
  CatAppearanceLayout,
  CatAppearancePackSummary,
} from '@shared/types/cat-appearance'

export {
  BUILTIN_APPEARANCE_PACK_IDS,
  BUILTIN_CAT_APPEARANCE_PACK_ID,
  BUILTIN_DOG_APPEARANCE_PACK_ID,
}

export const BUILTIN_CAT_APPEARANCE_PACK: CatAppearancePackSummary = {
  id: BUILTIN_CAT_APPEARANCE_PACK_ID,
  name: 'OmniPaw Cat',
  description: 'Built-in OmniPaw cat appearance.',
  source: 'builtin',
  status: 'available',
  active: false,
}

export const BUILTIN_DOG_APPEARANCE_PACK: CatAppearancePackSummary = {
  id: BUILTIN_DOG_APPEARANCE_PACK_ID,
  name: 'OmniPaw Dog',
  description: 'Built-in OmniPaw dog appearance.',
  source: 'builtin',
  status: 'available',
  active: false,
}

export const BUILTIN_APPEARANCE_PACKS = [
  BUILTIN_CAT_APPEARANCE_PACK,
  BUILTIN_DOG_APPEARANCE_PACK,
] as const satisfies readonly CatAppearancePackSummary[]

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

export const BUILTIN_DOG_APPEARANCE_LAYOUT: CatAppearanceLayout = {
  scale: 86 / 116,
  offsetX: 0,
  offsetY: 0,
}

export const BUILTIN_APPEARANCE_LAYOUT_BY_PACK_ID = {
  [BUILTIN_CAT_APPEARANCE_PACK_ID]: BUILTIN_CAT_APPEARANCE_LAYOUT,
  [BUILTIN_DOG_APPEARANCE_PACK_ID]: BUILTIN_DOG_APPEARANCE_LAYOUT,
} as const satisfies Record<(typeof BUILTIN_APPEARANCE_PACK_IDS)[number], CatAppearanceLayout>

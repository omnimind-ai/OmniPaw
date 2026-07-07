export const CAT_PET_ACTIONS = ['pat', 'tease', 'custom_100', 'custom_150'] as const
export const CAT_PET_CUSTOM_ACTIONS = ['custom_100', 'custom_150'] as const

export type PresetCatPetAction = (typeof CAT_PET_ACTIONS)[number]
export type PresetCatPetCustomAction = (typeof CAT_PET_CUSTOM_ACTIONS)[number]

export interface PresetCatPetInteractionConfig {
  id: PresetCatPetAction
  enabled?: boolean
  label?: string
  description?: string
  positiveFeedback?: string
  negativeFeedback?: string
}

export const CAT_PET_DAILY_LIMITS = {
  pat: 2,
  tease: 1,
  custom_100: 1,
  custom_150: 1,
} as const satisfies Record<PresetCatPetAction, number>

export const CAT_PET_UNLOCK_AFFECTION = {
  pat: 0,
  tease: 0,
  custom_100: 100,
  custom_150: 150,
} as const satisfies Record<PresetCatPetAction, number>

const CAT_PET_DEFAULT_INTERACTIONS = [
  {
    id: 'pat',
    enabled: true,
    label: '摸摸',
    description: '轻轻摸摸猫咪',
    positiveFeedback: '猫咪舒服地眯起了眼',
    negativeFeedback: '猫咪不太喜欢这样摸',
  },
  {
    id: 'tease',
    enabled: true,
    label: '逗逗',
    description: '逗逗猫咪',
    positiveFeedback: '猫咪玩得很开心',
    negativeFeedback: '猫咪有点不高兴',
  },
  {
    id: 'custom_100',
    enabled: true,
    label: '轻声夸夸',
    description: '关系更熟悉后解锁的亲近互动',
    positiveFeedback: '猫咪认真听完，看起来更亲近了',
    negativeFeedback: '猫咪还没有完全放松下来',
  },
  {
    id: 'custom_150',
    enabled: true,
    label: '贴贴陪伴',
    description: '关系很亲近后解锁的特别互动',
    positiveFeedback: '猫咪主动靠近，安静地陪着你',
    negativeFeedback: '猫咪现在想自己待一会儿',
  },
] as const satisfies readonly PresetCatPetInteractionConfig[]

const MAX_LABEL_LENGTH = 18
const MAX_DESCRIPTION_LENGTH = 80
const MAX_FEEDBACK_LENGTH = 120

export function createDefaultPetInteractionConfigs(): PresetCatPetInteractionConfig[] {
  return CAT_PET_DEFAULT_INTERACTIONS.map((item) => ({ ...item }))
}

export function normalizePetInteractionConfigs(input: unknown): PresetCatPetInteractionConfig[] {
  const byId = new Map<PresetCatPetAction, PresetCatPetInteractionConfig>()
  const items = Array.isArray(input) ? input : []
  for (const item of items) {
    const record = asRecord(item)
    const id = normalizeInteractionConfigId(record?.id)
    if (!record || !id) {
      continue
    }
    byId.set(id, {
      id,
      enabled: record.enabled !== false,
      label: normalizeOptionalText(record.label, MAX_LABEL_LENGTH),
      description: normalizeOptionalText(record.description, MAX_DESCRIPTION_LENGTH),
      positiveFeedback: normalizeOptionalText(record.positiveFeedback, MAX_FEEDBACK_LENGTH),
      negativeFeedback: normalizeOptionalText(record.negativeFeedback, MAX_FEEDBACK_LENGTH),
    })
  }

  return createDefaultPetInteractionConfigs().map((fallback) => ({
    ...fallback,
    ...(byId.get(fallback.id) ?? {}),
  }))
}

export function isPresetCatPetAction(value: unknown): value is PresetCatPetAction {
  return typeof value === 'string' && (CAT_PET_ACTIONS as readonly string[]).includes(value)
}

export function isPresetCatPetCustomAction(value: unknown): value is PresetCatPetCustomAction {
  return typeof value === 'string' && (CAT_PET_CUSTOM_ACTIONS as readonly string[]).includes(value)
}

function normalizeInteractionConfigId(value: unknown): PresetCatPetAction | undefined {
  if (isPresetCatPetAction(value)) {
    return value
  }
  if (value === 'custom_medium') {
    return 'custom_100'
  }
  if (value === 'custom_high') {
    return 'custom_150'
  }
  return undefined
}

function normalizeOptionalText(value: unknown, maxLength: number): string | undefined {
  const trimmed = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
  return trimmed ? trimmed.slice(0, maxLength) : undefined
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

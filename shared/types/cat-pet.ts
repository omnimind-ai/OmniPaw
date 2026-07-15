import type { ID, UnixMs } from './chat'

export const CAT_PET_AFFECTION_MAX = 300
export const CAT_PET_AFFECTION_MIN = 0
export const CAT_PET_AFFECTION_DEFAULT = 50

export const CAT_PET_MOOD_MAX = 100
export const CAT_PET_MOOD_MIN = -100
export const CAT_PET_MOOD_DEFAULT = 0

export const CAT_PET_ACTIONS = ['pat', 'tease', 'custom_100', 'custom_150'] as const
export const CAT_PET_CUSTOM_ACTIONS = ['custom_100', 'custom_150'] as const
export const CAT_PET_DEBUG_UNLOCK_NEXT_GIFT_ACTION = '__debug_unlock_next_gift__'

export type CatPetAction = (typeof CAT_PET_ACTIONS)[number]
export type CatPetCustomAction = (typeof CAT_PET_CUSTOM_ACTIONS)[number]
export type CatPetMood = 'angry' | 'sad' | 'down' | 'normal' | 'happy' | 'attached'
export type CatPetOutcome = 'positive' | 'negative'
export type CatPetChangeReason = 'init' | 'action' | 'refresh' | 'config' | 'launch'

export type CatPetActionCounters = Record<CatPetAction, number>

export interface CatPetInteractionEffect {
  affection: number
  mood: number
}

export interface CatPetInteractionFeedback {
  positive: string
  negative: string
}

export interface CatPetInteractionConfig {
  id: CatPetAction
  enabled?: boolean
  label?: string
  description?: string
  positiveFeedback?: string
  negativeFeedback?: string
}

export interface CatPetGiftImage {
  dataUrl?: string
  mimeType?: string
  fileName?: string
  packagePath?: string
}

export interface CatPetGiftConfig {
  id: ID
  enabled?: boolean
  unlockAffection: number
  name: string
  description?: string
  image?: CatPetGiftImage
  storyLines: string[]
}

export interface CatPetGiftDefinition extends CatPetGiftConfig {
  enabled: boolean
  unlocked: boolean
}

export interface CatPetUnlockedGiftRecord {
  id: ID
  roleId: ID
  unlockedAt: UnixMs
}

export interface CatPetInventoryRequest {
  roleId: ID
}

export interface CatPetInventoryResponse {
  roleId: ID
  unlockedGifts: CatPetUnlockedGiftRecord[]
}

export interface CatPetGiftUnlock {
  roleId: ID
  gift: CatPetGiftConfig
  affection: number
  mood: CatPetMood
  unlockedAt: UnixMs
}

export const CAT_PET_DAILY_LIMITS = {
  pat: 2,
  tease: 1,
  custom_100: 1,
  custom_150: 1,
} as const satisfies Record<CatPetAction, number>

export const CAT_PET_UNLOCK_AFFECTION = {
  pat: 0,
  tease: 0,
  custom_100: 100,
  custom_150: 150,
} as const satisfies Record<CatPetAction, number>

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
] as const satisfies readonly CatPetInteractionConfig[]

const CAT_PET_DEFAULT_GIFTS = [
  {
    id: 'gift_100',
    enabled: true,
    unlockAffection: 100,
    name: '小小爪印贴纸',
    description: '来自桌面伙伴的第一份纪念礼物。',
    storyLines: [
      '我刚刚发现，我们已经变得很熟悉了。',
      '所以这个送给你，算是我的小小爪印。',
      '以后看到它，就当我也在旁边陪着你。',
    ],
  },
  {
    id: 'gift_200',
    enabled: true,
    unlockAffection: 200,
    name: '温热铃铛',
    description: '轻轻晃动时，会想起一起待过的时间。',
    storyLines: [
      '今天的心情很好，而且我想把这个交给你。',
      '它不是很贵重，但我一直偷偷留着。',
      '如果你听见铃声，就说明我在认真回应你。',
    ],
  },
  {
    id: 'gift_300',
    enabled: true,
    unlockAffection: 300,
    name: '专属星星挂坠',
    description: '好感度满值后获得的专属礼物。',
    storyLines: [
      '能走到这里，我真的很开心。',
      '这颗星星给你，它只属于我们现在的关系。',
      '以后无论忙不忙，我都会在桌面这里等你。',
    ],
  },
] as const satisfies readonly CatPetGiftConfig[]

const MAX_LABEL_LENGTH = 18
const MAX_DESCRIPTION_LENGTH = 80
const MAX_FEEDBACK_LENGTH = 120
const MAX_GIFT_NAME_LENGTH = 40
const MAX_GIFT_DESCRIPTION_LENGTH = 160
const MAX_GIFT_STORY_LINE_LENGTH = 160
const MAX_GIFT_STORY_LINES = 8
const MAX_GIFT_IMAGE_FILE_NAME_LENGTH = 120
const MAX_GIFT_IMAGE_PATH_LENGTH = 240

export const CAT_PET_GIFT_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
] as const
export const CAT_PET_GIFT_IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif'
export const CAT_PET_GIFT_IMAGE_MAX_BYTES = 1_500_000
export const CAT_PET_GIFT_IMAGE_DATA_URL_MAX_LENGTH = 2_100_000

export interface CatPetInteractionDefinition {
  id: CatPetAction
  enabled: boolean
  unlocked: boolean
  customizable: boolean
  unlockAffection: number
  dailyLimit: number
  positive: CatPetInteractionEffect
  negative: CatPetInteractionEffect
  positiveProbability: number
  label: string
  description?: string
  feedback: CatPetInteractionFeedback
}

export interface CatPetDailyLimits extends CatPetActionCounters {}

export interface CatPetDailyUsage extends CatPetActionCounters {}

export interface CatPetRecentInteraction {
  action: CatPetAction
  label: string
  feedback?: string
  delta: number
  moodDelta: number
  outcome: CatPetOutcome
  affectionAfter: number
  moodScoreAfter: number
  performedAt: UnixMs
}

export interface CatPetState {
  affection: number
  affectionMax: number
  affectionMin: number
  mood: CatPetMood
  moodScore: number
  moodMax: number
  moodMin: number
  todayUsage: CatPetDailyUsage
  limits: CatPetDailyLimits
  interactions: CatPetInteractionDefinition[]
  interactionConfigs: CatPetInteractionConfig[]
  gifts: CatPetGiftDefinition[]
  giftConfigs: CatPetGiftConfig[]
  unlockedGifts: CatPetUnlockedGiftRecord[]
  launchCount: number
  lastLaunchAt?: UnixMs
  lastSeenAt?: UnixMs
  awayMs?: number
  recent?: CatPetRecentInteraction
}

export interface CatPetPerformRequest {
  action: CatPetAction
}

export interface CatPetUpdateInteractionsRequest {
  interactions?: CatPetInteractionConfig[]
  customInteractions?: CatPetInteractionConfig[]
}

export type CatPetPerformResponse =
  | { ok: true; state: CatPetState; result: CatPetRecentInteraction; giftUnlock?: CatPetGiftUnlock }
  | { ok: false; reason: 'daily_limit' | 'disabled_action' | 'locked_action'; state: CatPetState }

export interface CatPetUpdateInteractionsResponse {
  state: CatPetState
}

export interface CatPetDebugUnlockGiftResponse {
  state: CatPetState
  giftUnlock?: CatPetGiftUnlock
}

export interface CatPetChangedEvent {
  state: CatPetState
  reason: CatPetChangeReason
  giftUnlock?: CatPetGiftUnlock
}

export function emptyCatPetActionCounters(): CatPetActionCounters {
  return {
    pat: 0,
    tease: 0,
    custom_100: 0,
    custom_150: 0,
  }
}

export function defaultCatPetInteractionConfigs(): CatPetInteractionConfig[] {
  return CAT_PET_DEFAULT_INTERACTIONS.map((item) => ({ ...item }))
}

export function defaultCatPetGiftConfigs(): CatPetGiftConfig[] {
  return CAT_PET_DEFAULT_GIFTS.map((item) => ({
    ...item,
    storyLines: [...item.storyLines],
  }))
}

export function normalizeCatPetInteractionConfigs(input: unknown): CatPetInteractionConfig[] {
  const byId = new Map<CatPetAction, CatPetInteractionConfig>()
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

  return defaultCatPetInteractionConfigs().map((fallback) => ({
    ...fallback,
    ...(byId.get(fallback.id) ?? {}),
  }))
}

export function normalizeCatPetGiftConfigs(input: unknown): CatPetGiftConfig[] {
  const byId = new Map<ID, CatPetGiftConfig>()
  const items = Array.isArray(input) ? input : []
  for (const item of items) {
    const record = asRecord(item)
    const id = normalizeGiftId(record?.id)
    if (!record || !id) {
      continue
    }
    const fallback = CAT_PET_DEFAULT_GIFTS.find((gift) => gift.id === id)
    if (!fallback) {
      continue
    }
    const fallbackStoryLines = fallback?.storyLines ?? []
    const name =
      normalizeOptionalText(record.name, MAX_GIFT_NAME_LENGTH) ??
      fallback?.name ??
      `Gift ${byId.size + 1}`
    const storyLines = normalizeGiftStoryLines(record.storyLines, fallbackStoryLines, name)
    const image = normalizeGiftImage(record.image)
    const description =
      normalizeOptionalText(record.description, MAX_GIFT_DESCRIPTION_LENGTH) ??
      fallback?.description
    byId.set(id, {
      id,
      enabled: true,
      unlockAffection: fallback.unlockAffection,
      name,
      ...(description ? { description } : {}),
      ...(image ? { image } : {}),
      storyLines,
    })
  }

  return defaultCatPetGiftConfigs().map((fallback) => {
    const override = byId.get(fallback.id)
    if (!override) {
      return fallback
    }
    return {
      ...fallback,
      ...override,
      enabled: true,
      unlockAffection: fallback.unlockAffection,
      storyLines: [...override.storyLines],
    }
  })
}

export function normalizeCatPetGiftImageMimeType(
  value: unknown,
  fileName?: unknown
): (typeof CAT_PET_GIFT_IMAGE_MIME_TYPES)[number] | undefined {
  const mimeType = normalizeOptionalText(value, 80)?.toLowerCase()
  if (mimeType && isCatPetGiftImageMimeType(mimeType)) {
    return mimeType === 'image/jpg' ? 'image/jpeg' : mimeType
  }

  const normalizedFileName = normalizeOptionalText(fileName, MAX_GIFT_IMAGE_FILE_NAME_LENGTH)
  const extension = normalizedFileName?.split('.').pop()?.toLowerCase()
  if (extension === 'png') return 'image/png'
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg'
  if (extension === 'webp') return 'image/webp'
  if (extension === 'gif') return 'image/gif'
  return undefined
}

export function isCatPetGiftImageMimeType(
  value: unknown
): value is (typeof CAT_PET_GIFT_IMAGE_MIME_TYPES)[number] {
  return (
    typeof value === 'string' &&
    (CAT_PET_GIFT_IMAGE_MIME_TYPES as readonly string[]).includes(value.toLowerCase())
  )
}

export function isCatPetAction(value: unknown): value is CatPetAction {
  return typeof value === 'string' && (CAT_PET_ACTIONS as readonly string[]).includes(value)
}

export function isCatPetCustomAction(value: unknown): value is CatPetCustomAction {
  return typeof value === 'string' && (CAT_PET_CUSTOM_ACTIONS as readonly string[]).includes(value)
}

export function moodFromScore(score: number, affection = CAT_PET_AFFECTION_DEFAULT): CatPetMood {
  if (score <= -70 && affection <= 70) return 'angry'
  if (score <= -45) return affection <= 110 ? 'sad' : 'down'
  if (score <= -18) return 'down'
  if (score >= 72 && affection >= 150) return 'attached'
  if (score >= 28) return 'happy'
  return 'normal'
}

export function moodFromAffection(affection: number): CatPetMood {
  if (affection <= 30) return 'sad'
  if (affection <= 90) return 'down'
  if (affection <= 150) return 'normal'
  return 'happy'
}

function normalizeInteractionConfigId(value: unknown): CatPetAction | undefined {
  if (isCatPetAction(value)) {
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

function normalizeGiftId(value: unknown): ID | undefined {
  const trimmed = normalizeOptionalText(value, 80)
  if (!trimmed) {
    return undefined
  }
  return CAT_PET_DEFAULT_GIFTS.some((gift) => gift.id === trimmed) ? trimmed : undefined
}

function normalizeGiftStoryLines(
  value: unknown,
  fallback: readonly string[],
  giftName: string
): string[] {
  const rawItems =
    typeof value === 'string' ? value.split(/\n+/) : Array.isArray(value) ? value : fallback
  const normalized = rawItems
    .map((item) => normalizeOptionalText(item, MAX_GIFT_STORY_LINE_LENGTH))
    .filter((item): item is string => Boolean(item))
    .slice(0, MAX_GIFT_STORY_LINES)
  return normalized.length ? normalized : [`这是我想送给你的${giftName}。`]
}

function normalizeGiftImage(value: unknown): CatPetGiftImage | undefined {
  const record = asRecord(value)
  if (!record) {
    return undefined
  }
  const dataUrl = normalizeGiftImageDataUrl(record.dataUrl)
  const packagePath = normalizeGiftPackagePath(record.packagePath)
  if (!dataUrl && !packagePath) {
    return undefined
  }
  const mimeType =
    normalizeCatPetGiftImageMimeType(record.mimeType) ??
    normalizeCatPetGiftImageMimeType(imageMimeTypeFromDataUrl(dataUrl)) ??
    undefined
  const fileName = normalizeOptionalText(record.fileName, MAX_GIFT_IMAGE_FILE_NAME_LENGTH)
  return {
    ...(dataUrl ? { dataUrl } : {}),
    ...(mimeType ? { mimeType } : {}),
    ...(fileName ? { fileName } : {}),
    ...(packagePath ? { packagePath } : {}),
  }
}

function normalizeGiftImageDataUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  if (trimmed.length > CAT_PET_GIFT_IMAGE_DATA_URL_MAX_LENGTH) {
    return undefined
  }
  const mimeType = imageMimeTypeFromDataUrl(trimmed)
  return mimeType &&
    normalizeCatPetGiftImageMimeType(mimeType) &&
    /^[^,]+,[a-z0-9+/=]+$/i.test(trimmed)
    ? trimmed
    : undefined
}

function normalizeGiftPackagePath(value: unknown): string | undefined {
  const trimmed = normalizeOptionalText(value, MAX_GIFT_IMAGE_PATH_LENGTH)
  if (!trimmed || trimmed.includes('..') || trimmed.startsWith('/') || trimmed.startsWith('\\')) {
    return undefined
  }
  return trimmed
}

function imageMimeTypeFromDataUrl(value: string | undefined): string | undefined {
  const match = value?.match(/^data:(image\/(?:png|jpe?g|webp|gif));base64,/i)
  return match?.[1]?.toLowerCase()
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

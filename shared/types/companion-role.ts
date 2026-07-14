import type { CatAppearanceEmbeddedPack } from './cat-appearance'
import type { CatPetGiftConfig, CatPetInteractionConfig } from './cat-pet'
import type { ID, UnixMs } from './chat'

export type CompanionRoleCardImportSourceKind = 'json' | 'png' | 'webp' | 'omnipaw-role'

export const COMPANION_ROLE_AVATAR_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const
export const COMPANION_ROLE_AVATAR_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif'
export const COMPANION_ROLE_AVATAR_MAX_BYTES = 1_500_000
export const COMPANION_ROLE_AVATAR_DATA_URL_MAX_LENGTH = 2_100_000

export type CompanionRoleAvatarSource = 'appearance-idle' | 'custom'
export type CompanionRoleAvatarMimeType = (typeof COMPANION_ROLE_AVATAR_MIME_TYPES)[number]

export interface CompanionRoleAvatar {
  source: CompanionRoleAvatarSource
  dataUrl?: string
  mimeType?: CompanionRoleAvatarMimeType
  fileName?: string
  packagePath?: string
}

export interface CompanionRoleSourceMetadata {
  kind: 'manual' | 'sillytavern-json' | 'sillytavern-png' | 'sillytavern-webp'
  version?: string
  importedAt?: UnixMs
  sourceName?: string
  mimeType?: string
  contentHash?: string
}

export interface CompanionRoleKnowledgeEntry {
  id: ID
  enabled: boolean
  title: string
  content: string
  keys: string[]
  constant: boolean
  priority: number
  order: number
  tokenBudget?: number
  createdAt?: UnixMs
  updatedAt?: UnixMs
}

export interface CompanionRoleKnowledgeEntryDraft {
  id?: ID
  enabled?: boolean
  title?: string
  content: string
  keys?: string[]
  constant?: boolean
  priority?: number
  order?: number
  tokenBudget?: number
}

export interface ImportedCompanionRoleDraft {
  name: string
  introduction?: string
  avatar?: CompanionRoleAvatar
  appearancePackId?: string
  userNickname?: string
  personality?: string
  speechStyle?: string
  relationship?: string
  background?: string
  proactiveStyle?: string
  petInteractions?: CatPetInteractionConfig[]
  petGifts?: CatPetGiftConfig[]
  advanced?: {
    enabled?: boolean
    systemPrompt?: string
    exampleDialogue?: string
    finalInstructions?: string
  }
  knowledgeEntries?: CompanionRoleKnowledgeEntryDraft[]
  source?: CompanionRoleSourceMetadata
}

export interface ImportCompanionRoleCardRequest {
  content?: string
  dataBase64?: string
  sourceKind?: CompanionRoleCardImportSourceKind
  mimeType?: string
  sourceName?: string
}

export interface ImportCompanionRoleCardResponse {
  role: ImportedCompanionRoleDraft
  source: CompanionRoleSourceMetadata
  knowledgeEntryCount: number
  appearancePack?: CatAppearanceEmbeddedPack
}

export interface ExportCompanionRoleCardRequest {
  role: ImportedCompanionRoleDraft
  sourceName?: string
  appearancePack?: CatAppearanceEmbeddedPack
}

export interface ExportCompanionRoleCardPayload {
  spec: 'omnipaw_companion_role'
  specVersion: 1
  exportedAt: UnixMs
  role: ImportedCompanionRoleDraft
  appearancePack?: CatAppearanceEmbeddedPack
}

export interface ExportCompanionRoleCardResponse {
  exported: boolean
  canceled?: boolean
  destinationPath?: string
}

export function normalizeCompanionRoleAvatar(value: unknown): CompanionRoleAvatar | undefined {
  const record = asRecord(value)
  if (!record) return undefined

  const source: CompanionRoleAvatarSource =
    record.source === 'custom' ? 'custom' : 'appearance-idle'
  if (source === 'appearance-idle') {
    return { source }
  }

  const dataUrl = normalizeAvatarDataUrl(record.dataUrl)
  const packagePath = normalizeAvatarPackagePath(record.packagePath)
  if (!dataUrl && !packagePath) return undefined

  const mimeType =
    normalizeCompanionRoleAvatarMimeType(record.mimeType) ??
    normalizeCompanionRoleAvatarMimeType(imageMimeTypeFromDataUrl(dataUrl))
  const fileName = normalizeOptionalText(record.fileName, 120)
  return {
    source,
    ...(dataUrl ? { dataUrl } : {}),
    ...(mimeType ? { mimeType } : {}),
    ...(fileName ? { fileName } : {}),
    ...(packagePath ? { packagePath } : {}),
  }
}

export function normalizeCompanionRoleAvatarMimeType(
  value: unknown,
  fileName?: unknown
): CompanionRoleAvatarMimeType | undefined {
  const mimeType = normalizeOptionalText(value, 80)?.toLowerCase()
  if ((COMPANION_ROLE_AVATAR_MIME_TYPES as readonly string[]).includes(mimeType ?? '')) {
    return mimeType as CompanionRoleAvatarMimeType
  }
  if (mimeType === 'image/jpg') return 'image/jpeg'

  const extension = normalizeOptionalText(fileName, 120)?.split('.').pop()?.toLowerCase()
  if (extension === 'png') return 'image/png'
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg'
  if (extension === 'webp') return 'image/webp'
  if (extension === 'gif') return 'image/gif'
  return undefined
}

function normalizeAvatarDataUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (trimmed.length > COMPANION_ROLE_AVATAR_DATA_URL_MAX_LENGTH) return undefined
  const mimeType = imageMimeTypeFromDataUrl(trimmed)
  return mimeType &&
    normalizeCompanionRoleAvatarMimeType(mimeType) &&
    /^[^,]+,[a-z0-9+/=]+$/i.test(trimmed)
    ? trimmed
    : undefined
}

function normalizeAvatarPackagePath(value: unknown): string | undefined {
  const trimmed = normalizeOptionalText(value, 240)
  if (!trimmed || trimmed.includes('..') || trimmed.startsWith('/') || trimmed.startsWith('\\')) {
    return undefined
  }
  return trimmed
}

function imageMimeTypeFromDataUrl(value: string | undefined): string | undefined {
  return value?.match(/^data:(image\/(?:png|jpe?g|webp|gif));base64,/i)?.[1]?.toLowerCase()
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

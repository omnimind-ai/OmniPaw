import type { UnixMs } from './chat'

export type CatAppearanceAssetKey =
  | 'show'
  | 'showFallback'
  | 'idle'
  | 'dragTransition'
  | 'drag'
  | 'dragFallback'
  | 'startDoing'
  | 'doing'
  | 'doingFallback'
  | 'endDoing'
  | 'finish'

export type CatAppearancePackSource = 'builtin' | 'local'
export type CatAppearancePackStatus = 'available' | 'invalid' | 'missing'
export type CatAppearanceChangeReason =
  | 'load'
  | 'refresh'
  | 'select'
  | 'watch'
  | 'import'
  | 'delete'

export interface CatAppearanceDurations {
  appearing: number
  dragTransition: number
  preparing: number
  completedEnd: number
  completedFinish: number
}

export interface CatAppearanceLayout {
  scale: number
  offsetX: number
  offsetY: number
}

export type CatAppearanceLayoutOverride = Partial<CatAppearanceLayout>

export interface CatAppearancePackSummary {
  id: string
  name: string
  description?: string
  source: CatAppearancePackSource
  status: CatAppearancePackStatus
  active: boolean
  rootName?: string
  relativePath?: string
  error?: string
  updatedAt?: UnixMs
}

export interface CatAppearanceResolvedPack extends CatAppearancePackSummary {
  assets: Partial<Record<CatAppearanceAssetKey, string>>
  durations: CatAppearanceDurations
  layout: CatAppearanceLayout
  version: string
}

export interface CatAppearanceListResponse {
  packs: CatAppearancePackSummary[]
  current: CatAppearanceResolvedPack
  activePackId: string
  rootPath?: string
  updatedAt: UnixMs
}

export interface CatAppearanceChangedEvent extends CatAppearanceListResponse {
  reason: CatAppearanceChangeReason
}

export interface CatAppearanceSetActiveRequest {
  packId?: string
  layoutOverride?: CatAppearanceLayoutOverride
}

export interface CatAppearanceGetPackRequest {
  packId?: string
}

export interface CatAppearanceDeletePackRequest {
  packId?: string
  rootName?: string
}

export interface CatAppearanceImportResponse extends CatAppearanceListResponse {
  canceled: boolean
  importedPackId?: string
}

export interface CatAppearanceDeleteResponse extends CatAppearanceListResponse {
  deletedPackId: string
}

export interface CatAppearanceEmbeddedPackFile {
  path: string
  dataBase64: string
}

export interface CatAppearanceEmbeddedPack {
  originalPackId: string
  rootName?: string
  files: CatAppearanceEmbeddedPackFile[]
}

export function normalizeCatAppearanceLayoutOverride(
  value: unknown
): CatAppearanceLayoutOverride | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const override: CatAppearanceLayoutOverride = {}
  const scale = normalizeLayoutNumber(record.scale, 0.25, 2)
  const offsetX = normalizeLayoutNumber(record.offsetX, -116, 116)
  const offsetY = normalizeLayoutNumber(record.offsetY, -116, 116)
  if (scale !== undefined) override.scale = scale
  if (offsetX !== undefined) override.offsetX = offsetX
  if (offsetY !== undefined) override.offsetY = offsetY
  return Object.keys(override).length ? override : undefined
}

export function resolveCatAppearanceLayout(
  base: CatAppearanceLayout,
  override: CatAppearanceLayoutOverride | undefined
): CatAppearanceLayout {
  const normalizedOverride = normalizeCatAppearanceLayoutOverride(override)
  return {
    scale: normalizedOverride?.scale ?? base.scale,
    offsetX: normalizedOverride?.offsetX ?? base.offsetX,
    offsetY: normalizedOverride?.offsetY ?? base.offsetY,
  }
}

function normalizeLayoutNumber(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.round(Math.min(Math.max(value, min), max) * 1000) / 1000
}

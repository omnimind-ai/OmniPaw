import type { UnixMs } from './chat'

export type CatAppearanceAssetKey =
  | 'show'
  | 'showFallback'
  | 'idle'
  | 'drag'
  | 'dragFallback'
  | 'startDoing'
  | 'doing'
  | 'doingFallback'
  | 'endDoing'
  | 'finish'

export type CatAppearancePackSource = 'builtin' | 'local'
export type CatAppearancePackStatus = 'available' | 'invalid' | 'missing'
export type CatAppearanceChangeReason = 'load' | 'refresh' | 'select' | 'watch' | 'import'

export interface CatAppearanceDurations {
  appearing: number
  preparing: number
  completedEnd: number
  completedFinish: number
}

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
}

export interface CatAppearanceGetPackRequest {
  packId?: string
}

export interface CatAppearanceImportResponse extends CatAppearanceListResponse {
  canceled: boolean
  importedPackId?: string
}

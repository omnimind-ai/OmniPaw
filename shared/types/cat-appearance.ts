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
  | 'layout'
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
}

export interface CatAppearanceGetPackRequest {
  packId?: string
}

export interface CatAppearanceUpdateLayoutRequest {
  packId?: string
  layout: CatAppearanceLayout
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

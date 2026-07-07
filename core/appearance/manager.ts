import {
  cpSync,
  existsSync,
  type FSWatcher,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  watch,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'

import type { Logger } from '@core/logging'
import { resolveOmniPawDataPaths, resolveOmniPawDataRoot } from '@core/utils/data-paths'
import {
  isIgnoredZipEntry,
  normalizeArchivePath,
  readZipEntries,
  validateArchivePaths,
  type ZipArchiveEntry,
} from '@core/utils/zip'
import type {
  CatAppearanceAssetKey,
  CatAppearanceChangedEvent,
  CatAppearanceChangeReason,
  CatAppearanceDeletePackRequest,
  CatAppearanceDeleteResponse,
  CatAppearanceDurations,
  CatAppearanceEmbeddedPack,
  CatAppearanceGetPackRequest,
  CatAppearanceImportResponse,
  CatAppearanceListResponse,
  CatAppearancePackSummary,
  CatAppearanceResolvedPack,
  CatAppearanceSetActiveRequest,
} from '@shared/types/cat-appearance'

const BUILTIN_PACK_ID = 'builtin'
const MANIFEST_FILE_NAME = 'manifest.json'
const CURRENT_STATE_VERSION = 1
const MAX_MANIFEST_BYTES = 64 * 1024
const MAX_ASSET_BYTES = 20 * 1024 * 1024
const MAX_IMPORT_ARCHIVE_BYTES = 128 * 1024 * 1024
const MAX_IMPORT_FILES = 256
const MAX_IMPORT_TOTAL_BYTES = 256 * 1024 * 1024
const WATCH_DEBOUNCE_MS = 180

const assetKeys = new Set<CatAppearanceAssetKey>([
  'show',
  'showFallback',
  'idle',
  'dragTransition',
  'drag',
  'dragFallback',
  'startDoing',
  'doing',
  'doingFallback',
  'endDoing',
  'finish',
])

const allowedAssetExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif'])

const mimeByExtension: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
}

const builtinPack: CatAppearancePackSummary = {
  id: BUILTIN_PACK_ID,
  name: 'OmniPaw Cat',
  description: 'Built-in OmniPaw cat appearance.',
  source: 'builtin',
  status: 'available',
  active: false,
}

export const defaultCatAppearanceDurations: CatAppearanceDurations = {
  appearing: 1000,
  dragTransition: 1100,
  preparing: 1050,
  completedEnd: 980,
  completedFinish: 1500,
}

export interface CatAppearanceAssetFile {
  path: string
  mimeType: string
  sizeBytes: number
}

export interface CatAppearanceManagerOptions {
  userDataPath?: string
  dataRootPath?: string
  logger?: Logger
  onChanged?: (event: CatAppearanceChangedEvent) => void
  buildAssetUrl: (packId: string, assetKey: CatAppearanceAssetKey, version: string) => string
}

interface CatAppearanceState {
  version: typeof CURRENT_STATE_VERSION
  activePackId?: string
}

interface LoadedCatAppearanceAsset {
  key: CatAppearanceAssetKey
  relativePath: string
  path: string
  mimeType: string
  updatedAt: number
  sizeBytes: number
}

interface LoadedCatAppearancePack {
  id: string
  name: string
  description?: string
  source: 'local'
  status: 'available' | 'invalid'
  path: string
  rootName: string
  relativePath: string
  assets: Partial<Record<CatAppearanceAssetKey, LoadedCatAppearanceAsset>>
  durations: CatAppearanceDurations
  error?: string
  updatedAt: number
}

export class CatAppearanceManager {
  private readonly dataRootPath: string
  private readonly rootPath: string
  private readonly statePath: string
  private readonly logger?: Logger
  private loaded = false
  private state: CatAppearanceState = defaultState()
  private hasExplicitState = false
  private packs: LoadedCatAppearancePack[] = []
  private watchers: FSWatcher[] = []
  private watchTimer: ReturnType<typeof setTimeout> | undefined
  private lastUpdatedAt = Date.now()

  constructor(private readonly options: CatAppearanceManagerOptions) {
    this.dataRootPath = resolveCatAppearanceDataRoot(options)
    const paths = resolveOmniPawDataPaths({ dataRootPath: this.dataRootPath })
    this.rootPath = paths.catAppearances
    this.statePath = paths.catAppearanceState
    this.logger = options.logger
  }

  load(): CatAppearanceListResponse {
    this.ensureDirectories()
    this.state = this.loadState()
    this.packs = this.scanPacks()
    this.loaded = true
    this.lastUpdatedAt = Date.now()
    this.startWatching()
    const response = this.list()
    this.emitChanged('load')
    this.logger?.info('Cat appearance packs loaded.', {
      packCount: response.packs.length,
      activePackId: response.activePackId,
    })
    return response
  }

  list(): CatAppearanceListResponse {
    this.ensureLoaded()
    const current = this.resolveCurrentPack()
    return {
      packs: this.packSummaries(current.id),
      current,
      activePackId: current.id,
      rootPath: this.rootPath,
      updatedAt: this.lastUpdatedAt,
    }
  }

  current(): CatAppearanceResolvedPack {
    return this.list().current
  }

  getPack(request: CatAppearanceGetPackRequest | string): CatAppearanceResolvedPack {
    this.ensureLoaded()
    const requestedId = normalizePackId(typeof request === 'string' ? request : request.packId)
    const packId = requestedId || BUILTIN_PACK_ID
    const current = this.resolveCurrentPack()
    return this.resolvePackById(packId, packId === current.id)
  }

  refresh(reason: CatAppearanceChangeReason = 'refresh'): CatAppearanceListResponse {
    this.ensureDirectories()
    this.state = this.loadState()
    this.packs = this.scanPacks()
    this.loaded = true
    this.lastUpdatedAt = Date.now()
    const response = this.list()
    this.emitChanged(reason)
    this.logger?.info('Cat appearance packs refreshed.', {
      reason,
      packCount: response.packs.length,
      activePackId: response.activePackId,
    })
    return response
  }

  setActive(request: CatAppearanceSetActiveRequest | string): CatAppearanceResolvedPack {
    this.ensureLoaded()
    const requestedId = normalizePackId(typeof request === 'string' ? request : request.packId)
    const packId = requestedId || BUILTIN_PACK_ID
    const current = this.activatePack(packId, 'select')
    this.logger?.info('Cat appearance active pack changed.', { activePackId: current.id })
    return current
  }

  deletePack(request: CatAppearanceDeletePackRequest | string): CatAppearanceDeleteResponse {
    this.ensureLoaded()
    this.ensureDirectories()

    const requestedId = normalizePackId(typeof request === 'string' ? request : request.packId)
    if (!requestedId || requestedId === BUILTIN_PACK_ID) {
      throw new Error('Built-in cat appearance pack cannot be deleted.')
    }

    const requestedRootName =
      typeof request === 'string' ? undefined : normalizeRootName(request.rootName)
    const matches = this.packs.filter(
      (pack) =>
        pack.id === requestedId && (!requestedRootName || pack.rootName === requestedRootName)
    )
    if (!matches.length) {
      throw new Error(`Cat appearance pack is not found: ${requestedId}`)
    }
    if (matches.length > 1 && !requestedRootName) {
      throw new Error(`Cat appearance pack delete target is ambiguous: ${requestedId}`)
    }

    const pack = matches[0]
    const targetPath = resolve(pack.path)
    if (!isInsidePath(this.rootPath, targetPath) || targetPath === resolve(this.rootPath)) {
      throw new Error('Cat appearance delete target is invalid.')
    }

    const targetStat = lstatSync(targetPath)
    if (!targetStat.isDirectory()) {
      throw new Error('Cat appearance delete target must be a directory.')
    }

    const wasActive = this.resolveActivePackId() === pack.id
    rmSync(targetPath, { recursive: true })

    if (wasActive) {
      this.state = {
        version: CURRENT_STATE_VERSION,
        activePackId: BUILTIN_PACK_ID,
      }
      this.saveState(this.state)
      this.hasExplicitState = true
    }

    this.packs = this.scanPacks()
    this.loaded = true
    this.lastUpdatedAt = Date.now()
    const response = this.list()
    this.emitChanged('delete')
    this.logger?.info('Cat appearance pack deleted.', {
      packId: pack.id,
      rootName: pack.rootName,
      activePackId: response.activePackId,
    })
    return {
      ...response,
      deletedPackId: pack.id,
    }
  }

  importFromDirectory(sourcePath: string): CatAppearanceImportResponse {
    this.ensureLoaded()
    this.ensureDirectories()

    const resolvedSourcePath = normalizeImportSourcePath(sourcePath)
    const sourceStat = statSync(resolvedSourcePath)
    if (!sourceStat.isDirectory()) {
      throw new Error('Cat appearance import source must be a directory.')
    }

    const existingPack = this.packs.find((pack) => resolve(pack.path) === resolvedSourcePath)
    if (existingPack) {
      if (existingPack.status !== 'available') {
        throw new Error(existingPack.error || 'Cat appearance pack is invalid.')
      }
      this.activatePack(existingPack.id, 'import')
      return {
        ...this.list(),
        canceled: false,
        importedPackId: existingPack.id,
      }
    }

    const candidate = this.loadPack(resolvedSourcePath, basename(resolvedSourcePath))
    if (candidate.status !== 'available') {
      throw new Error(candidate.error || 'Cat appearance pack is invalid.')
    }

    const importPackId = this.nextAvailablePackId(candidate.id)
    const rootName = this.nextAvailableRootName(importPackId)
    const destinationPath = join(this.rootPath, rootName)
    if (
      !isInsidePath(this.rootPath, destinationPath) ||
      isInsidePath(resolvedSourcePath, destinationPath)
    ) {
      throw new Error('Cat appearance import destination is invalid.')
    }

    const tempParentPath = mkdtempSync(join(dirname(this.rootPath), '.cat-appearance-import-'))
    const tempPackPath = join(tempParentPath, rootName)
    if (isInsidePath(resolvedSourcePath, tempPackPath)) {
      rmSync(tempParentPath, { recursive: true, force: true })
      throw new Error('Cat appearance import destination is invalid.')
    }

    try {
      cpSync(resolvedSourcePath, tempPackPath, {
        recursive: true,
        force: false,
        errorOnExist: true,
        dereference: false,
      })
      if (importPackId !== candidate.id) {
        rewriteManifestId(tempPackPath, importPackId)
      }

      const imported = this.loadPack(tempPackPath, rootName)
      if (imported.status !== 'available') {
        throw new Error(imported.error || 'Imported cat appearance pack is invalid.')
      }

      renameSync(tempPackPath, destinationPath)
      rmSync(tempParentPath, { recursive: true, force: true })
      this.packs = this.scanPacks()
      this.loaded = true
      this.lastUpdatedAt = Date.now()
      this.activatePack(imported.id, 'import')
      this.logger?.info('Cat appearance pack imported.', {
        packId: imported.id,
        rootName: imported.rootName,
      })
      return {
        ...this.list(),
        canceled: false,
        importedPackId: imported.id,
      }
    } catch (error) {
      rmSync(tempParentPath, { recursive: true, force: true })
      throw error
    }
  }

  importFromArchive(sourcePath: string): CatAppearanceImportResponse {
    this.ensureLoaded()
    this.ensureDirectories()

    const archivePath = normalizeImportSourcePath(sourcePath)
    const archiveStat = statSync(archivePath)
    if (!archiveStat.isFile()) {
      throw new Error('Cat appearance import source must be a zip file.')
    }
    if (extname(archivePath).toLowerCase() !== '.zip') {
      throw new Error('Cat appearance import supports .zip files.')
    }
    if (archiveStat.size > MAX_IMPORT_ARCHIVE_BYTES) {
      throw new Error(`Cat appearance zip archive exceeds ${MAX_IMPORT_ARCHIVE_BYTES} bytes.`)
    }

    const tempParentPath = mkdtempSync(join(dirname(this.rootPath), '.cat-appearance-unpack-'))
    const unpackRootPath = join(tempParentPath, 'archive')
    mkdirSync(unpackRootPath, { recursive: true })

    try {
      const entries = readCatAppearanceZipEntries(readFileSync(archivePath))
      writeArchiveEntries(unpackRootPath, entries)
      const packPath = resolveArchivePackPath(
        unpackRootPath,
        entries.map((entry) => entry.name)
      )
      return this.importFromDirectory(packPath)
    } finally {
      rmSync(tempParentPath, { recursive: true, force: true })
    }
  }

  exportEmbeddedPack(packId: string | undefined): CatAppearanceEmbeddedPack | undefined {
    this.ensureLoaded()
    const normalizedPackId = normalizePackId(packId)
    if (!normalizedPackId || normalizedPackId === BUILTIN_PACK_ID) {
      return undefined
    }

    const pack = this.packs.find(
      (item) => item.id === normalizedPackId && item.status === 'available'
    )
    if (!pack) {
      throw new Error(`Cat appearance pack is not available: ${normalizedPackId}`)
    }

    return {
      originalPackId: pack.id,
      rootName: pack.rootName,
      files: readEmbeddedPackFiles(pack.path),
    }
  }

  importEmbeddedPack(pack: CatAppearanceEmbeddedPack): CatAppearanceImportResponse {
    this.ensureLoaded()
    this.ensureDirectories()

    if (!pack.files.length) {
      throw new Error('Embedded cat appearance pack is empty.')
    }

    const entries = pack.files.map((file) => ({
      name: normalizeArchivePath(file.path),
      data: Buffer.from(file.dataBase64, 'base64'),
    }))
    validateEmbeddedPackEntries(entries)

    const tempParentPath = mkdtempSync(join(dirname(this.rootPath), '.cat-appearance-embedded-'))
    const unpackRootPath = join(tempParentPath, 'embedded')
    mkdirSync(unpackRootPath, { recursive: true })

    try {
      writeArchiveEntries(unpackRootPath, entries)
      const packPath = resolveArchivePackPath(
        unpackRootPath,
        entries.map((entry) => entry.name)
      )
      return this.importFromDirectory(packPath)
    } finally {
      rmSync(tempParentPath, { recursive: true, force: true })
    }
  }

  private activatePack(
    packId: string,
    reason: Extract<CatAppearanceChangeReason, 'select' | 'import'>
  ): CatAppearanceResolvedPack {
    if (
      packId !== BUILTIN_PACK_ID &&
      !this.packs.some((pack) => pack.id === packId && pack.status === 'available')
    ) {
      throw new Error(`Cat appearance pack is not available: ${packId}`)
    }

    this.state = {
      version: CURRENT_STATE_VERSION,
      activePackId: packId,
    }
    this.saveState(this.state)
    this.hasExplicitState = true
    this.lastUpdatedAt = Date.now()
    const current = this.current()
    this.emitChanged(reason)
    return current
  }

  resolveAsset(packId: string, assetKey: string): CatAppearanceAssetFile | null {
    this.ensureLoaded()
    if (!isAssetKey(assetKey)) {
      return null
    }
    const normalizedPackId = normalizePackId(packId)
    if (!normalizedPackId || normalizedPackId === BUILTIN_PACK_ID) {
      return null
    }

    const pack = this.packs.find(
      (item) => item.id === normalizedPackId && item.status === 'available'
    )
    const asset = pack?.assets[assetKey]
    if (!asset) {
      return null
    }

    const lstat = lstatSync(asset.path)
    if (lstat.isSymbolicLink()) {
      return null
    }

    const stat = statSync(asset.path)
    if (!stat.isFile() || stat.size > MAX_ASSET_BYTES) {
      return null
    }

    return {
      path: asset.path,
      mimeType: asset.mimeType,
      sizeBytes: stat.size,
    }
  }

  dispose(): void {
    if (this.watchTimer) {
      clearTimeout(this.watchTimer)
      this.watchTimer = undefined
    }
    for (const watcher of this.watchers) {
      watcher.close()
    }
    this.watchers = []
  }

  private ensureLoaded(): void {
    if (!this.loaded) {
      this.load()
    }
  }

  private ensureDirectories(): void {
    mkdirSync(this.rootPath, { recursive: true })
    mkdirSync(dirname(this.statePath), { recursive: true })
  }

  private loadState(): CatAppearanceState {
    this.hasExplicitState = existsSync(this.statePath)
    if (!this.hasExplicitState) {
      return defaultState()
    }

    try {
      const parsed = JSON.parse(readFileSync(this.statePath, 'utf8')) as unknown
      if (!isRecord(parsed)) {
        return defaultState()
      }
      return {
        version: CURRENT_STATE_VERSION,
        activePackId: normalizePackId(parsed.activePackId) || BUILTIN_PACK_ID,
      }
    } catch (error) {
      this.logger?.warn('Failed to load cat appearance state; falling back to built-in pack.', {
        error,
      })
      return defaultState()
    }
  }

  private saveState(state: CatAppearanceState): void {
    this.ensureDirectories()
    const tempPath = `${this.statePath}.${process.pid}.${Date.now()}.tmp`
    writeFileSync(tempPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
    renameSync(tempPath, this.statePath)
  }

  private scanPacks(): LoadedCatAppearancePack[] {
    if (!existsSync(this.rootPath)) {
      return []
    }

    const packs: LoadedCatAppearancePack[] = []
    const seenIds = new Set<string>()
    for (const entry of readdirSync(this.rootPath, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue
      }

      const pack = this.loadPack(join(this.rootPath, entry.name), entry.name)
      if (seenIds.has(pack.id)) {
        packs.push({
          ...pack,
          status: 'invalid',
          assets: {},
          error: `Duplicate cat appearance pack id: ${pack.id}`,
        })
        continue
      }
      seenIds.add(pack.id)
      packs.push(pack)
    }

    return packs.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  }

  private loadPack(packPath: string, rootName: string): LoadedCatAppearancePack {
    const fallbackId = normalizePackId(rootName) || `pack_${packsafeTimestamp()}`
    const manifestPath = join(packPath, MANIFEST_FILE_NAME)
    const base = {
      id: fallbackId,
      name: rootName,
      source: 'local' as const,
      path: packPath,
      rootName,
      relativePath: rootName,
      durations: defaultCatAppearanceDurations,
      updatedAt: safeMtimeMs(packPath),
    }

    try {
      if (!existsSync(manifestPath)) {
        return {
          ...base,
          status: 'invalid',
          assets: {},
          error: `Missing ${MANIFEST_FILE_NAME}.`,
        }
      }
      const manifestStat = statSync(manifestPath)
      if (!manifestStat.isFile() || manifestStat.size > MAX_MANIFEST_BYTES) {
        return {
          ...base,
          status: 'invalid',
          assets: {},
          error: `${MANIFEST_FILE_NAME} is too large or not a file.`,
        }
      }

      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown
      const normalized = normalizeManifest(manifest, rootName)
      const assets = resolveManifestAssets(packPath, normalized.assets)
      const updatedAt = Math.max(
        manifestStat.mtimeMs,
        ...Object.values(assets).map((asset) => asset?.updatedAt ?? 0)
      )

      return {
        ...base,
        id: normalized.id,
        name: normalized.name,
        description: normalized.description,
        status: 'available',
        assets,
        durations: normalized.durations,
        updatedAt,
      }
    } catch (error) {
      return {
        ...base,
        status: 'invalid',
        assets: {},
        error: error instanceof Error ? error.message : 'Cat appearance pack is invalid.',
      }
    }
  }

  private resolveCurrentPack(): CatAppearanceResolvedPack {
    const activePackId = this.resolveActivePackId()
    try {
      return this.resolvePackById(activePackId, true)
    } catch {
      return this.resolvePackById(BUILTIN_PACK_ID, true)
    }
  }

  private resolveActivePackId(): string {
    const configuredPackId = normalizePackId(this.state.activePackId) || BUILTIN_PACK_ID
    const availableLocalPacks = this.packs.filter((pack) => pack.status === 'available')
    return !this.hasExplicitState &&
      configuredPackId === BUILTIN_PACK_ID &&
      availableLocalPacks.length === 1
      ? availableLocalPacks[0].id
      : configuredPackId
  }

  private resolvePackById(packId: string, active: boolean): CatAppearanceResolvedPack {
    if (packId === BUILTIN_PACK_ID) {
      return {
        ...builtinPack,
        active,
        assets: {},
        durations: defaultCatAppearanceDurations,
        version: BUILTIN_PACK_ID,
        updatedAt: this.lastUpdatedAt,
      }
    }

    const local = this.packs.find((pack) => pack.id === packId && pack.status === 'available')
    if (!local) {
      throw new Error(`Cat appearance pack is not available: ${packId}`)
    }

    const assets: Partial<Record<CatAppearanceAssetKey, string>> = {}
    for (const asset of Object.values(local.assets)) {
      if (!asset) continue
      assets[asset.key] = this.options.buildAssetUrl(
        local.id,
        asset.key,
        `${Math.round(asset.updatedAt)}-${asset.sizeBytes}`
      )
    }

    return {
      id: local.id,
      name: local.name,
      description: local.description,
      source: 'local',
      status: local.status,
      active,
      rootName: local.rootName,
      relativePath: local.relativePath,
      assets,
      durations: local.durations,
      version: `${local.id}-${Math.round(local.updatedAt)}`,
      updatedAt: Math.round(local.updatedAt),
    }
  }

  private packSummaries(activePackId: string): CatAppearancePackSummary[] {
    return [
      {
        ...builtinPack,
        active: activePackId === BUILTIN_PACK_ID,
        updatedAt: this.lastUpdatedAt,
      },
      ...this.packs.map((pack) => ({
        id: pack.id,
        name: pack.name,
        description: pack.description,
        source: pack.source,
        status: pack.status,
        active: pack.id === activePackId,
        rootName: pack.rootName,
        relativePath: pack.relativePath,
        error: pack.error,
        updatedAt: Math.round(pack.updatedAt),
      })),
    ]
  }

  private nextAvailablePackId(packId: string): string {
    const base = normalizePackId(packId) || `pack-${packsafeTimestamp()}`
    const existingIds = new Set([BUILTIN_PACK_ID, ...this.packs.map((pack) => pack.id)])
    if (!existingIds.has(base)) {
      return base
    }

    let index = 2
    let candidate = `${base}-${index}`
    while (existingIds.has(candidate)) {
      index += 1
      candidate = `${base}-${index}`
    }
    return candidate
  }

  private nextAvailableRootName(packId: string): string {
    const base = normalizePackId(packId) || `pack-${packsafeTimestamp()}`
    if (!existsSync(join(this.rootPath, base))) {
      return base
    }

    let index = 2
    let candidate = `${base}-${index}`
    while (existsSync(join(this.rootPath, candidate))) {
      index += 1
      candidate = `${base}-${index}`
    }
    return candidate
  }

  private startWatching(): void {
    if (this.watchers.length) {
      return
    }

    try {
      this.watchers.push(
        watch(this.rootPath, { recursive: true }, () => {
          this.scheduleWatchRefresh()
        })
      )
    } catch (error) {
      this.logger?.warn('Recursive cat appearance watch failed; using top-level watch.', { error })
      try {
        this.watchers.push(
          watch(this.rootPath, () => {
            this.scheduleWatchRefresh()
          })
        )
      } catch (fallbackError) {
        this.logger?.warn('Cat appearance watch is unavailable.', { error: fallbackError })
      }
    }
  }

  private scheduleWatchRefresh(): void {
    if (this.watchTimer) {
      clearTimeout(this.watchTimer)
    }
    this.watchTimer = setTimeout(() => {
      this.watchTimer = undefined
      try {
        this.refresh('watch')
      } catch (error) {
        this.logger?.warn('Cat appearance watch refresh failed.', { error })
      }
    }, WATCH_DEBOUNCE_MS)
  }

  private emitChanged(reason: CatAppearanceChangeReason): void {
    this.options.onChanged?.({
      ...this.list(),
      reason,
    })
  }
}

interface NormalizedManifest {
  id: string
  name: string
  description?: string
  assets: Partial<Record<CatAppearanceAssetKey, string>>
  durations: CatAppearanceDurations
}

function normalizeManifest(manifest: unknown, rootName: string): NormalizedManifest {
  if (!isRecord(manifest)) {
    throw new Error('Cat appearance manifest must be an object.')
  }

  const id = normalizePackId(manifest.id) || normalizePackId(rootName)
  if (!id || id === BUILTIN_PACK_ID) {
    throw new Error('Cat appearance manifest id is invalid.')
  }

  const name =
    typeof manifest.name === 'string' && manifest.name.trim()
      ? truncate(manifest.name.trim(), 80)
      : rootName
  const description =
    typeof manifest.description === 'string' && manifest.description.trim()
      ? truncate(manifest.description.trim(), 240)
      : undefined
  const rawAssets = isRecord(manifest.assets) ? manifest.assets : undefined
  if (!rawAssets) {
    throw new Error('Cat appearance manifest assets must be an object.')
  }

  const assets: Partial<Record<CatAppearanceAssetKey, string>> = {}
  for (const [key, value] of Object.entries(rawAssets)) {
    if (!isAssetKey(key) || typeof value !== 'string') {
      continue
    }
    assets[key] = value
  }

  if (!assets.idle) {
    throw new Error('Cat appearance manifest must define assets.idle.')
  }

  return {
    id,
    name,
    description,
    assets,
    durations: normalizeDurations(isRecord(manifest.durations) ? manifest.durations : undefined),
  }
}

function resolveManifestAssets(
  packPath: string,
  manifestAssets: Partial<Record<CatAppearanceAssetKey, string>>
): Partial<Record<CatAppearanceAssetKey, LoadedCatAppearanceAsset>> {
  const assets: Partial<Record<CatAppearanceAssetKey, LoadedCatAppearanceAsset>> = {}
  for (const [key, value] of Object.entries(manifestAssets)) {
    if (!isAssetKey(key) || !value) {
      continue
    }

    const assetPath = resolvePackAssetPath(packPath, value)
    const extension = extname(assetPath).toLowerCase()
    if (!allowedAssetExtensions.has(extension)) {
      throw new Error(`Unsupported cat appearance asset type for ${key}: ${extension}`)
    }

    const assetLstat = lstatSync(assetPath)
    if (assetLstat.isSymbolicLink()) {
      throw new Error(`Cat appearance asset cannot be a symbolic link: ${value}`)
    }

    const assetStat = statSync(assetPath)
    if (!assetStat.isFile()) {
      throw new Error(`Cat appearance asset is not a file: ${value}`)
    }
    if (assetStat.size > MAX_ASSET_BYTES) {
      throw new Error(`Cat appearance asset is too large: ${value}`)
    }

    assets[key] = {
      key,
      relativePath: value,
      path: assetPath,
      mimeType: mimeByExtension[extension] ?? 'application/octet-stream',
      updatedAt: assetStat.mtimeMs,
      sizeBytes: assetStat.size,
    }
  }
  return assets
}

function resolvePackAssetPath(packPath: string, relativePath: string): string {
  if (!relativePath.trim() || relativePath.includes('\0')) {
    throw new Error('Cat appearance asset path is invalid.')
  }
  const resolved = resolve(packPath, relativePath)
  const relativeToPack = relative(packPath, resolved)
  if (
    relativeToPack.startsWith('..') ||
    relativeToPack === '..' ||
    relativeToPack.includes(`..${sep}`) ||
    resolve(relativeToPack) === relativeToPack
  ) {
    throw new Error('Cat appearance asset path must stay inside the pack directory.')
  }
  return resolved
}

function normalizeDurations(raw: Record<string, unknown> | undefined): CatAppearanceDurations {
  return {
    appearing: normalizeDuration(raw?.appearing, defaultCatAppearanceDurations.appearing),
    dragTransition: normalizeDuration(
      raw?.dragTransition,
      defaultCatAppearanceDurations.dragTransition
    ),
    preparing: normalizeDuration(raw?.preparing, defaultCatAppearanceDurations.preparing),
    completedEnd: normalizeDuration(raw?.completedEnd, defaultCatAppearanceDurations.completedEnd),
    completedFinish: normalizeDuration(
      raw?.completedFinish,
      defaultCatAppearanceDurations.completedFinish
    ),
  }
}

function normalizeDuration(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }
  return Math.round(Math.min(Math.max(value, 0), 30_000))
}

function normalizePackId(value: unknown): string {
  if (typeof value !== 'string') {
    return ''
  }
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function normalizeImportSourcePath(sourcePath: string): string {
  if (typeof sourcePath !== 'string' || !sourcePath.trim() || sourcePath.includes('\0')) {
    throw new Error('Cat appearance import source path is invalid.')
  }
  return resolve(sourcePath)
}

function normalizeRootName(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0')) {
    return undefined
  }
  return value.trim()
}

function readCatAppearanceZipEntries(bytes: Buffer): ZipArchiveEntry[] {
  const entries = readZipEntries(bytes)
    .filter((entry) => !isIgnoredCatAppearanceZipEntry(entry.name))
    .map((entry) => ({ ...entry, name: normalizeArchivePath(entry.name) }))
    .filter((entry) => entry.name && !entry.name.endsWith('/'))

  if (!entries.length) {
    throw new Error('Cat appearance zip archive is empty.')
  }
  if (entries.length > MAX_IMPORT_FILES) {
    throw new Error(`Cat appearance zip archive contains more than ${MAX_IMPORT_FILES} files.`)
  }
  const totalBytes = entries.reduce((sum, entry) => sum + entry.data.byteLength, 0)
  if (totalBytes > MAX_IMPORT_TOTAL_BYTES) {
    throw new Error(`Cat appearance zip archive expands beyond ${MAX_IMPORT_TOTAL_BYTES} bytes.`)
  }

  validateArchivePaths(entries.map((entry) => entry.name))
  return entries
}

function readEmbeddedPackFiles(packPath: string): CatAppearanceEmbeddedPack['files'] {
  const entries: ZipArchiveEntry[] = []
  collectEmbeddedPackFiles(packPath, packPath, entries)
  validateEmbeddedPackEntries(entries)
  return entries.map((entry) => ({
    path: entry.name,
    dataBase64: entry.data.toString('base64'),
  }))
}

function collectEmbeddedPackFiles(
  rootPath: string,
  currentPath: string,
  entries: ZipArchiveEntry[]
): void {
  for (const dirent of readdirSync(currentPath, { withFileTypes: true })) {
    const absolutePath = join(currentPath, dirent.name)
    const relativePath = normalizeArchivePath(relative(rootPath, absolutePath))
    if (isIgnoredCatAppearanceZipEntry(relativePath)) {
      continue
    }

    const lstat = lstatSync(absolutePath)
    if (lstat.isSymbolicLink()) {
      throw new Error('Cat appearance pack contains symbolic links and cannot be exported.')
    }
    if (dirent.isDirectory()) {
      collectEmbeddedPackFiles(rootPath, absolutePath, entries)
      continue
    }
    if (!dirent.isFile()) {
      continue
    }
    if (lstat.size > MAX_ASSET_BYTES && dirent.name !== MANIFEST_FILE_NAME) {
      throw new Error(`Cat appearance asset exceeds ${MAX_ASSET_BYTES} bytes.`)
    }
    entries.push({
      name: relativePath,
      data: readFileSync(absolutePath),
    })
  }
}

function validateEmbeddedPackEntries(entries: ZipArchiveEntry[]): void {
  if (!entries.length) {
    throw new Error('Embedded cat appearance pack is empty.')
  }
  if (entries.length > MAX_IMPORT_FILES) {
    throw new Error(`Embedded cat appearance pack contains more than ${MAX_IMPORT_FILES} files.`)
  }
  const totalBytes = entries.reduce((sum, entry) => sum + entry.data.byteLength, 0)
  if (totalBytes > MAX_IMPORT_TOTAL_BYTES) {
    throw new Error(`Embedded cat appearance pack exceeds ${MAX_IMPORT_TOTAL_BYTES} bytes.`)
  }
  validateArchivePaths(entries.map((entry) => entry.name))
}

function writeArchiveEntries(rootPath: string, entries: ZipArchiveEntry[]): void {
  for (const entry of entries) {
    const targetPath = resolve(rootPath, entry.name)
    if (!isInsidePath(rootPath, targetPath)) {
      throw new Error('Cat appearance zip archive contains invalid relative paths.')
    }
    mkdirSync(dirname(targetPath), { recursive: true })
    writeFileSync(targetPath, entry.data)
  }
}

function resolveArchivePackPath(rootPath: string, entryNames: string[]): string {
  const rootManifestPath = join(rootPath, MANIFEST_FILE_NAME)
  if (existsSync(rootManifestPath)) {
    return rootPath
  }

  const topDirectories = new Set<string>()
  for (const name of entryNames) {
    const [topDirectory, ...rest] = name.split('/')
    if (topDirectory && rest.length) {
      topDirectories.add(topDirectory)
    }
  }

  if (topDirectories.size === 1) {
    const [topDirectory] = [...topDirectories]
    const packPath = join(rootPath, topDirectory)
    if (existsSync(join(packPath, MANIFEST_FILE_NAME))) {
      return packPath
    }
  }

  throw new Error(
    'Cat appearance zip archive must contain manifest.json at the archive root or inside one top-level directory.'
  )
}

function isIgnoredCatAppearanceZipEntry(name: string): boolean {
  const normalized = normalizeArchivePath(name)
  return isIgnoredZipEntry(normalized) || normalized.split('/').at(-1) === '.DS_Store'
}

function rewriteManifestId(packPath: string, packId: string): void {
  const manifestPath = join(packPath, MANIFEST_FILE_NAME)
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown
  if (!isRecord(manifest)) {
    throw new Error('Cat appearance manifest must be an object.')
  }
  writeFileSync(manifestPath, `${JSON.stringify({ ...manifest, id: packId }, null, 2)}\n`, 'utf8')
}

function isInsidePath(parentPath: string, childPath: string): boolean {
  const relativeToParent = relative(resolve(parentPath), resolve(childPath))
  return (
    relativeToParent === '' || (!relativeToParent.startsWith('..') && !isAbsolute(relativeToParent))
  )
}

function isAssetKey(value: string): value is CatAppearanceAssetKey {
  return assetKeys.has(value as CatAppearanceAssetKey)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function truncate(value: string, maxChars: number): string {
  return value.length <= maxChars ? value : value.slice(0, maxChars).trimEnd()
}

function safeMtimeMs(path: string): number {
  try {
    return statSync(path).mtimeMs
  } catch {
    return Date.now()
  }
}

function packsafeTimestamp(): string {
  return String(Date.now()).slice(-8)
}

function defaultState(): CatAppearanceState {
  return {
    version: CURRENT_STATE_VERSION,
    activePackId: BUILTIN_PACK_ID,
  }
}

function resolveCatAppearanceDataRoot(options: CatAppearanceManagerOptions): string {
  return options.dataRootPath
    ? resolveOmniPawDataRoot({ dataRootPath: options.dataRootPath })
    : (options.userDataPath ?? resolveOmniPawDataRoot())
}

export { BUILTIN_PACK_ID as CAT_APPEARANCE_BUILTIN_PACK_ID }

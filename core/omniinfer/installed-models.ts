import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import {
  existsSync,
  promises as fs,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import type { Logger } from '@core/logging'
import type { InstalledModelRecord, InstalledModelsSnapshot } from '@shared/types/omniinfer'

const MMPROJ_PREFIX = 'mmproj'
const STORAGE_VERSION = 1
const MISSING_RETENTION_MS = 30 * 24 * 60 * 60 * 1000
const SKIP_PREFIXES = ['.']
const SKIP_SUFFIXES = ['.tmp', '.partial', '.downloading']

export interface ResolveModelsDirContext {
  /** Result of `app.getPath('userData')`. */
  userDataPath?: string
  /** Optional repo root; used in dev mode if `<repoRoot>/models/` exists. */
  repoRoot?: string
  /** Force a specific path (used by tests or migration overrides). */
  overridePath?: string
}

/**
 * Resolve the OmniInfer models directory. Precedence:
 *   1. env `OMNIINFER_MODELS_DIR_OVERRIDE`
 *   2. explicit `ctx.overridePath`
 *   3. dev-mode `<repoRoot>/models/` if it exists
 *   4. `<userData>/models/` (auto-created)
 */
export function resolveModelsDir(ctx: ResolveModelsDirContext = {}): string {
  const envOverride = process.env.OMNIINFER_MODELS_DIR_OVERRIDE?.trim()
  if (envOverride) {
    return resolve(envOverride)
  }
  if (ctx.overridePath) {
    return resolve(ctx.overridePath)
  }
  if (ctx.repoRoot) {
    const repoModels = resolve(ctx.repoRoot, 'models')
    if (existsSync(repoModels)) {
      return repoModels
    }
  }
  if (ctx.userDataPath) {
    const userModels = resolve(ctx.userDataPath, 'models')
    try {
      mkdirSync(userModels, { recursive: true })
    } catch {
      // ignored: caller can handle subsequent IO errors
    }
    return userModels
  }
  throw new Error('Cannot resolve OmniInfer models directory: no userData or repo root provided.')
}

export interface ScanResultEntry {
  id: string
  name: string
  path: string
  sizeBytes: number
  mtimeMs: number
  mmprojPath?: string
}

/**
 * Walk `dir` recursively, returning all `.gguf` files (excluding mmproj-prefixed files).
 * Main models are paired with their sibling `mmproj*.gguf` if any.
 */
export function scanInstalledModels(dir: string): ScanResultEntry[] {
  if (!existsSync(dir)) {
    return []
  }

  const usedIds = new Set<string>()
  const found: Array<{ filename: string; absPath: string; sizeBytes: number; mtimeMs: number }> = []
  walk(dir, found)

  const mmprojByDir = new Map<string, string>()
  const mainEntries: Array<{
    filename: string
    absPath: string
    sizeBytes: number
    mtimeMs: number
  }> = []

  for (const entry of found) {
    if (isMmprojFile(entry.filename)) {
      mmprojByDir.set(dirname(entry.absPath), entry.absPath)
      continue
    }
    mainEntries.push(entry)
  }

  return mainEntries.map((entry) => {
    const baseId = deriveId(entry.filename, entry.absPath, usedIds)
    usedIds.add(baseId)
    return {
      id: baseId,
      name: entry.filename,
      path: entry.absPath,
      sizeBytes: entry.sizeBytes,
      mtimeMs: entry.mtimeMs,
      mmprojPath: mmprojByDir.get(dirname(entry.absPath)),
    }
  })
}

export interface InstalledModelsRegistryOptions {
  /** Where to write the index file. Typically `<dataRoot>/<STORAGE_FILENAME>`. */
  storagePath: string
  modelsDir: string
  logger?: Logger
  now?: () => number
}

export type InstalledModelsChangeListener = (snapshot: InstalledModelsSnapshot) => void

export class InstalledModelRegistry {
  private records: Map<string, InstalledModelRecord> = new Map()
  private loaded = false
  private scanLock: Promise<InstalledModelRecord[]> | null = null
  private readonly emitter = new EventEmitter()
  private readonly options: Required<Omit<InstalledModelsRegistryOptions, 'logger'>> & {
    logger?: Logger
  }

  constructor(options: InstalledModelsRegistryOptions) {
    this.options = {
      storagePath: options.storagePath,
      modelsDir: options.modelsDir,
      now: options.now ?? Date.now,
      logger: options.logger,
    }
    this.emitter.setMaxListeners(50)
  }

  setModelsDir(dir: string): void {
    this.options.modelsDir = dir
  }

  getModelsDir(): string {
    return this.options.modelsDir
  }

  list(): InstalledModelRecord[] {
    if (!this.loaded) {
      this.load()
    }
    return Array.from(this.records.values()).map((record) => ({ ...record }))
  }

  resolveModelPath(modelId: string): string | undefined {
    return this.records.get(modelId)?.path
  }

  resolveModelId(path: string): string | undefined {
    if (!path) return undefined
    const normalized = normalizePath(path)
    for (const record of this.records.values()) {
      if (normalizePath(record.path) === normalized) {
        return record.id
      }
    }
    return undefined
  }

  snapshot(): InstalledModelsSnapshot {
    return {
      modelsDir: this.options.modelsDir,
      models: this.list(),
      scannedAt: this.options.now(),
    }
  }

  onChanged(listener: InstalledModelsChangeListener): () => void {
    this.emitter.on('changed', listener)
    return () => {
      this.emitter.off('changed', listener)
    }
  }

  load(): void {
    if (this.loaded) return
    try {
      const fileExists = existsSync(this.options.storagePath)
      if (fileExists) {
        const raw = readSync(this.options.storagePath)
        const parsed = JSON.parse(raw) as {
          version?: number
          records?: InstalledModelRecord[]
        }
        if (parsed && Array.isArray(parsed.records)) {
          for (const record of parsed.records) {
            if (record && typeof record.id === 'string') {
              this.records.set(record.id, { ...record })
            }
          }
        }
      }
    } catch (error) {
      this.options.logger?.warn?.('Failed to load OmniInfer installed-models index.', { error })
    }
    this.loaded = true
  }

  /**
   * Re-scan the models directory and merge results with the existing index. Returns the
   * resulting record set.
   */
  async scan(): Promise<InstalledModelRecord[]> {
    if (this.scanLock) {
      return this.scanLock
    }
    this.scanLock = (async () => {
      this.load()
      const scanned = scanInstalledModels(this.options.modelsDir)
      const seenIds = new Set<string>()
      const now = this.options.now()
      for (const entry of scanned) {
        const existing = matchExistingRecord(this.records, entry)
        const id = existing?.id ?? entry.id
        seenIds.add(id)
        const merged: InstalledModelRecord = {
          ...(existing ?? {}),
          id,
          name: entry.name,
          path: entry.path,
          sizeBytes: entry.sizeBytes,
          mtimeMs: entry.mtimeMs,
          mmprojPath: entry.mmprojPath ?? existing?.mmprojPath,
          missing: false,
          missingSince: undefined,
        }
        this.records.set(id, merged)
      }

      // Anything in the registry that wasn't seen this round becomes "missing".
      for (const [id, record] of this.records) {
        if (record.manual) continue
        if (seenIds.has(id)) continue
        if (record.missing) {
          if (record.missingSince && now - record.missingSince > MISSING_RETENTION_MS) {
            this.records.delete(id)
          }
          continue
        }
        this.records.set(id, {
          ...record,
          missing: true,
          missingSince: now,
        })
      }

      this.persist()
      const list = this.list()
      this.emitter.emit('changed', this.snapshot())
      return list
    })()
    try {
      return await this.scanLock
    } finally {
      this.scanLock = null
    }
  }

  /** Register a model path that wasn't found via scan (e.g. user-picked external file). */
  registerManualPath(
    absPath: string,
    partial?: Partial<InstalledModelRecord>
  ): InstalledModelRecord {
    this.load()
    if (!isAbsolute(absPath)) {
      throw new Error(`registerManualPath requires absolute path: ${absPath}`)
    }
    const existing = this.findByPath(absPath)
    if (existing) {
      const updated: InstalledModelRecord = {
        ...existing,
        ...partial,
        missing: false,
        missingSince: undefined,
      }
      this.records.set(updated.id, updated)
      this.persist()
      this.emitter.emit('changed', this.snapshot())
      return { ...updated }
    }

    const filename = absPath.split(/[\\/]/).pop() ?? absPath
    let id = deriveId(filename, absPath, new Set(this.records.keys()))
    while (this.records.has(id)) {
      id = `${id}-${shortHash(absPath)}`
    }
    let sizeBytes = 0
    let mtimeMs = this.options.now()
    try {
      const stat = statSync(absPath)
      sizeBytes = stat.size
      mtimeMs = stat.mtimeMs
    } catch {
      // ignored
    }
    const record: InstalledModelRecord = {
      id,
      name: filename,
      path: absPath,
      sizeBytes,
      mtimeMs,
      manual: true,
      ...partial,
    }
    this.records.set(id, record)
    this.persist()
    this.emitter.emit('changed', this.snapshot())
    return { ...record }
  }

  /** Update editable metadata fields without re-scanning. */
  updateMetadata(
    modelId: string,
    patch: Partial<
      Pick<
        InstalledModelRecord,
        'displayName' | 'supportsVision' | 'supportsThinking' | 'contextLength'
      >
    >
  ): InstalledModelRecord | null {
    this.load()
    const existing = this.records.get(modelId)
    if (!existing) return null
    const next: InstalledModelRecord = { ...existing, ...patch }
    this.records.set(modelId, next)
    this.persist()
    this.emitter.emit('changed', this.snapshot())
    return { ...next }
  }

  private findByPath(absPath: string): InstalledModelRecord | undefined {
    const target = normalizePath(absPath)
    for (const record of this.records.values()) {
      if (normalizePath(record.path) === target) {
        return record
      }
    }
    return undefined
  }

  private persist(): void {
    const records = Array.from(this.records.values()).map((record) => ({ ...record }))
    const payload = JSON.stringify({ version: STORAGE_VERSION, records }, null, 2)
    try {
      mkdirSync(dirname(this.options.storagePath), { recursive: true })
      const tmpPath = `${this.options.storagePath}.tmp`
      writeFileSync(tmpPath, payload, 'utf8')
      renameSync(tmpPath, this.options.storagePath)
    } catch (error) {
      this.options.logger?.warn?.('Failed to persist OmniInfer installed-models index.', { error })
    }
  }
}

function walk(
  dir: string,
  out: Array<{ filename: string; absPath: string; sizeBytes: number; mtimeMs: number }>,
  depth = 0
): void {
  if (depth > 8) return
  let entries: import('node:fs').Dirent[] = []
  try {
    entries = readdirSync(dir, {
      withFileTypes: true,
      encoding: 'utf8',
    }) as import('node:fs').Dirent[]
  } catch {
    return
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const absPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(absPath, out, depth + 1)
      continue
    }
    if (!entry.isFile()) continue
    if (!isGgufFile(entry.name)) continue
    if (shouldSkip(entry.name)) continue
    try {
      const stat = statSync(absPath)
      out.push({
        filename: entry.name,
        absPath,
        sizeBytes: stat.size,
        mtimeMs: stat.mtimeMs,
      })
    } catch {
      // ignored
    }
  }
}

function isGgufFile(filename: string): boolean {
  return /\.gguf$/i.test(filename)
}

function isMmprojFile(filename: string): boolean {
  return filename.toLowerCase().startsWith(MMPROJ_PREFIX)
}

function shouldSkip(filename: string): boolean {
  const lower = filename.toLowerCase()
  if (SKIP_PREFIXES.some((p) => lower.startsWith(p))) return true
  if (SKIP_SUFFIXES.some((s) => lower.endsWith(s))) return true
  return false
}

function deriveId(filename: string, absPath: string, used: Set<string>): string {
  const base = filename.replace(/\.gguf$/i, '')
  const kebab = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
  const baseId = kebab || `model-${shortHash(absPath)}`
  if (!used.has(baseId)) return baseId
  return `${baseId}-${shortHash(absPath)}`
}

function shortHash(value: string): string {
  return createHash('sha1').update(value).digest('hex').slice(0, 6)
}

function readSync(path: string): string {
  return readFileSync(path, 'utf8')
}

function matchExistingRecord(
  records: Map<string, InstalledModelRecord>,
  entry: ScanResultEntry
): InstalledModelRecord | undefined {
  const byPath = (() => {
    const target = normalizePath(entry.path)
    for (const record of records.values()) {
      if (normalizePath(record.path) === target) return record
    }
    return undefined
  })()
  if (byPath) return byPath
  return records.get(entry.id)
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').toLowerCase()
}

export async function ensureModelsDirExists(modelsDir: string): Promise<void> {
  try {
    await fs.mkdir(modelsDir, { recursive: true })
  } catch {
    // ignored
  }
}

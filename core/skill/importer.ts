import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { inflateRawSync } from 'node:zlib'

import type { ImportSkillRequest } from '@shared/types/skill'
import {
  MAX_SKILL_IMPORT_ARCHIVE_BYTES,
  MAX_SKILL_IMPORT_FILES,
  MAX_SKILL_IMPORT_TOTAL_BYTES,
  normalizeSkillId,
  skillError,
  SkillValidationError,
} from './schema'
import { isPathInside } from './loader'

export interface SkillImportResult {
  installedIds: string[]
}

interface ArchiveEntry {
  name: string
  data: Buffer
}

interface SkillPackageCandidate {
  name: string
  files: ArchiveEntry[]
}

export function importSkillPackage(
  input: ImportSkillRequest,
  skillsRoot: string
): SkillImportResult {
  const fileName = sanitizeFileName(input.fileName)
  const bytes = Buffer.from(input.bytes)
  if (!bytes.length) {
    throwImportError('Imported skill file is empty.')
  }

  const ext = extname(fileName).toLowerCase()
  if (ext === '.md') {
    return importMarkdownSkill({
      fileName,
      content: bytes.toString('utf8'),
      skillNameHint: input.skillNameHint,
      overwrite: input.overwrite ?? true,
      skillsRoot,
    })
  }
  if (ext === '.zip') {
    return importZipSkill({
      fileName,
      bytes,
      skillNameHint: input.skillNameHint,
      overwrite: input.overwrite ?? true,
      skillsRoot,
    })
  }

  throwImportError('Skill import supports .md and .zip files.')
}

function importMarkdownSkill(input: {
  fileName: string
  content: string
  skillNameHint?: string
  overwrite: boolean
  skillsRoot: string
}): SkillImportResult {
  if (!input.content.trim()) {
    throwImportError('Imported SKILL.md is empty.')
  }
  const skillId = resolveSkillId(
    input.skillNameHint || basename(input.fileName, extname(input.fileName))
  )
  const destDir = resolve(input.skillsRoot, skillId)
  ensureDestination(input.skillsRoot, destDir, input.overwrite)
  if (input.overwrite) {
    rmSync(destDir, { recursive: true, force: true })
  }
  mkdirSync(destDir, { recursive: true })
  writeFileSync(join(destDir, 'SKILL.md'), normalizeLineEndings(input.content), 'utf8')
  return { installedIds: [skillId] }
}

function importZipSkill(input: {
  fileName: string
  bytes: Buffer
  skillNameHint?: string
  overwrite: boolean
  skillsRoot: string
}): SkillImportResult {
  if (input.bytes.byteLength > MAX_SKILL_IMPORT_ARCHIVE_BYTES) {
    throwImportError(`Zip archive exceeds ${MAX_SKILL_IMPORT_ARCHIVE_BYTES} bytes.`)
  }

  const entries = readZipEntries(input.bytes)
    .filter((entry) => !isIgnoredZipEntry(entry.name))
    .map((entry) => ({ ...entry, name: normalizeArchivePath(entry.name) }))
    .filter((entry) => entry.name && !entry.name.endsWith('/'))

  if (!entries.length) {
    throwImportError('Zip archive is empty.')
  }
  if (entries.length > MAX_SKILL_IMPORT_FILES) {
    throwImportError(`Zip archive contains more than ${MAX_SKILL_IMPORT_FILES} files.`)
  }
  const totalBytes = entries.reduce((sum, entry) => sum + entry.data.byteLength, 0)
  if (totalBytes > MAX_SKILL_IMPORT_TOTAL_BYTES) {
    throwImportError(`Zip archive expands beyond ${MAX_SKILL_IMPORT_TOTAL_BYTES} bytes.`)
  }

  validateArchivePaths(entries.map((entry) => entry.name))

  const candidates = findSkillCandidates(entries, input.fileName, input.skillNameHint)
  if (!candidates.length) {
    throwImportError('No valid SKILL.md found in the zip archive.')
  }

  const installed: string[] = []
  const seenDestinations = new Set<string>()
  for (const candidate of candidates) {
    const skillId = resolveSkillId(candidate.name)
    const destDir = resolve(input.skillsRoot, skillId)
    if (seenDestinations.has(destDir)) {
      throwImportError(`Zip archive contains duplicate skill destination: ${skillId}`)
    }
    seenDestinations.add(destDir)
    ensureDestination(input.skillsRoot, destDir, input.overwrite)

    const tempDir = resolve(
      input.skillsRoot,
      `.import-${process.pid}-${Date.now()}-${shortHash(skillId)}`
    )
    rmSync(tempDir, { recursive: true, force: true })
    mkdirSync(tempDir, { recursive: true })
    try {
      for (const file of candidate.files) {
        const targetPath = resolve(tempDir, file.name)
        if (!isPathInside(tempDir, targetPath)) {
          throwImportError('Zip archive contains invalid relative paths.')
        }
        mkdirSync(dirname(targetPath), { recursive: true })
        writeFileSync(targetPath, file.data)
      }
      normalizeLegacySkillMarkdown(tempDir)
      rmSync(destDir, { recursive: true, force: true })
      mkdirSync(dirname(destDir), { recursive: true })
      renameDirectory(tempDir, destDir)
      installed.push(skillId)
    } catch (error) {
      rmSync(tempDir, { recursive: true, force: true })
      throw error
    }
  }

  return { installedIds: installed }
}

function findSkillCandidates(
  entries: ArchiveEntry[],
  fileName: string,
  skillNameHint?: string
): SkillPackageCandidate[] {
  const rootSkill = entries.find(
    (entry) => isSkillMarkdownName(entry.name) && !entry.name.includes('/')
  )
  if (rootSkill) {
    return [
      {
        name: skillNameHint || basename(fileName, extname(fileName)),
        files: entries.map((entry) => ({
          name: isSkillMarkdownName(entry.name) ? 'SKILL.md' : entry.name,
          data: entry.data,
        })),
      },
    ]
  }

  const byTopDir = new Map<string, ArchiveEntry[]>()
  for (const entry of entries) {
    const [topDir, ...rest] = entry.name.split('/')
    if (!topDir || !rest.length) {
      continue
    }
    const files = byTopDir.get(topDir) ?? []
    files.push({ name: rest.join('/'), data: entry.data })
    byTopDir.set(topDir, files)
  }

  const candidates: SkillPackageCandidate[] = []
  const singleTopDir = byTopDir.size === 1
  for (const [topDir, files] of byTopDir) {
    if (!files.some((file) => isSkillMarkdownName(file.name) && !file.name.includes('/'))) {
      continue
    }
    candidates.push({
      name: skillNameHint && singleTopDir ? skillNameHint : topDir,
      files: files.map((file) => ({
        name: isSkillMarkdownName(file.name) ? 'SKILL.md' : file.name,
        data: file.data,
      })),
    })
  }
  return candidates
}

function readZipEntries(bytes: Buffer): ArchiveEntry[] {
  const eocdOffset = findEndOfCentralDirectory(bytes)
  if (eocdOffset < 0) {
    throwImportError('Uploaded file is not a valid zip archive.')
  }

  const entryCount = bytes.readUInt16LE(eocdOffset + 10)
  const centralDirectorySize = bytes.readUInt32LE(eocdOffset + 12)
  const centralDirectoryOffset = bytes.readUInt32LE(eocdOffset + 16)
  if (centralDirectoryOffset + centralDirectorySize > bytes.byteLength) {
    throwImportError('Zip archive central directory is invalid.')
  }

  const entries: ArchiveEntry[] = []
  let offset = centralDirectoryOffset
  for (let index = 0; index < entryCount; index += 1) {
    if (bytes.readUInt32LE(offset) !== 0x02014b50) {
      throwImportError('Zip archive central directory is invalid.')
    }
    const method = bytes.readUInt16LE(offset + 10)
    const compressedSize = bytes.readUInt32LE(offset + 20)
    const uncompressedSize = bytes.readUInt32LE(offset + 24)
    const fileNameLength = bytes.readUInt16LE(offset + 28)
    const extraLength = bytes.readUInt16LE(offset + 30)
    const commentLength = bytes.readUInt16LE(offset + 32)
    const localHeaderOffset = bytes.readUInt32LE(offset + 42)
    const name = bytes.subarray(offset + 46, offset + 46 + fileNameLength).toString('utf8')
    offset += 46 + fileNameLength + extraLength + commentLength

    if (name.endsWith('/')) {
      continue
    }
    const data = readLocalZipEntry(bytes, {
      method,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    })
    entries.push({ name, data })
  }
  return entries
}

function readLocalZipEntry(
  bytes: Buffer,
  entry: {
    method: number
    compressedSize: number
    uncompressedSize: number
    localHeaderOffset: number
  }
): Buffer {
  const offset = entry.localHeaderOffset
  if (bytes.readUInt32LE(offset) !== 0x04034b50) {
    throwImportError('Zip archive local header is invalid.')
  }
  const fileNameLength = bytes.readUInt16LE(offset + 26)
  const extraLength = bytes.readUInt16LE(offset + 28)
  const dataOffset = offset + 30 + fileNameLength + extraLength
  const compressed = bytes.subarray(dataOffset, dataOffset + entry.compressedSize)
  let data: Buffer
  if (entry.method === 0) {
    data = Buffer.from(compressed)
  } else if (entry.method === 8) {
    data = inflateRawSync(compressed)
  } else {
    throwImportError(`Zip compression method ${entry.method} is not supported.`)
  }
  if (data.byteLength !== entry.uncompressedSize) {
    throwImportError('Zip archive entry size is invalid.')
  }
  return data
}

function findEndOfCentralDirectory(bytes: Buffer): number {
  const minOffset = Math.max(0, bytes.byteLength - 65_557)
  for (let offset = bytes.byteLength - 22; offset >= minOffset; offset -= 1) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) {
      return offset
    }
  }
  return -1
}

function validateArchivePaths(names: string[]): void {
  for (const name of names) {
    if (!name || name.startsWith('/') || /^[A-Za-z]:/.test(name)) {
      throwImportError('Zip archive contains absolute paths.')
    }
    if (name.split('/').includes('..')) {
      throwImportError('Zip archive contains invalid relative paths.')
    }
  }
}

function ensureDestination(skillsRoot: string, destDir: string, overwrite: boolean): void {
  const root = resolve(skillsRoot)
  const target = resolve(destDir)
  if (!isPathInside(root, target)) {
    throwImportError('Skill destination is outside the configured skill root.')
  }
  if (existsSync(target) && !overwrite) {
    throw new SkillValidationError(
      skillError('import_failed', `Skill already exists: ${basename(target)}`, {
        recoverable: false,
      })
    )
  }
  mkdirSync(root, { recursive: true })
}

function normalizeLegacySkillMarkdown(skillDir: string): void {
  const legacy = join(skillDir, 'skill.md')
  const canonical = join(skillDir, 'SKILL.md')
  if (!existsSync(canonical) && existsSync(legacy)) {
    renameDirectory(legacy, canonical)
  }
  if (!existsSync(canonical)) {
    throwImportError('SKILL.md not found in imported skill.')
  }
}

function renameDirectory(from: string, to: string): void {
  renameSync(from, to)
}

function resolveSkillId(value: string): string {
  const id = normalizeSkillId(value)
  if (!id) {
    throwImportError('Invalid skill name.')
  }
  return id
}

function normalizeArchivePath(name: string): string {
  return name.replace(/\\/g, '/').replace(/^\.\/+/, '')
}

function isIgnoredZipEntry(name: string): boolean {
  const normalized = normalizeArchivePath(name)
  return normalized.split('/')[0] === '__MACOSX'
}

function isSkillMarkdownName(name: string): boolean {
  return name === 'SKILL.md' || name === 'skill.md'
}

function sanitizeFileName(value: string): string {
  return basename(String(value || '').replace(/\\/g, '/')) || 'skill.md'
}

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n?/g, '\n')
}

function shortHash(value: string): string {
  return createHash('sha1').update(value).digest('hex').slice(0, 8)
}

function throwImportError(message: string): never {
  throw new SkillValidationError(skillError('import_failed', message, { recoverable: false }))
}

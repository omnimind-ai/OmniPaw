import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'

import {
  isIgnoredZipEntry,
  normalizeArchivePath,
  readZipEntries,
  validateArchivePaths,
  type ZipArchiveEntry,
} from '@core/utils/zip'
import type { ImportSkillRequest } from '@shared/types/skill'
import { isPathInside } from './loader'
import {
  MAX_SKILL_IMPORT_ARCHIVE_BYTES,
  MAX_SKILL_IMPORT_FILES,
  MAX_SKILL_IMPORT_TOTAL_BYTES,
  normalizeSkillId,
  SkillValidationError,
  skillError,
} from './schema'

export interface SkillImportResult {
  installedIds: string[]
}

interface SkillPackageCandidate {
  name: string
  files: ZipArchiveEntry[]
}

export function importSkillPackage(
  input: ImportSkillRequest,
  skillsRoot: string
): SkillImportResult {
  const fileName = sanitizeFileName(input.fileName)
  const bytes =
    input.bytes instanceof ArrayBuffer
      ? Buffer.from(input.bytes)
      : Buffer.from(input.bytes.buffer, input.bytes.byteOffset, input.bytes.byteLength)
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

  const zipErrorOptions = { throwError: throwImportError }
  const entries = readZipEntries(input.bytes, zipErrorOptions)
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

  validateArchivePaths(
    entries.map((entry) => entry.name),
    zipErrorOptions
  )

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
  entries: ZipArchiveEntry[],
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

  const byTopDir = new Map<string, ZipArchiveEntry[]>()
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

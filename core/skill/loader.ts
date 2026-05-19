import { type Dirent, existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, relative, resolve } from 'node:path'

import type { SkillMetadata } from '@shared/types/skill'
import {
  MAX_SKILL_DESCRIPTION_CHARS,
  MAX_SKILL_FILE_BYTES,
  normalizeSkillId,
  truncateText,
} from './schema'

export interface SkillRoot {
  name: string
  path: string
}

export interface LoadedLocalSkill {
  id: string
  rootName: string
  rootPath: string
  directoryPath: string
  skillFilePath: string
  relativePath: string
  name: string
  description: string
  metadata: SkillMetadata
  content?: string
  status: 'available' | 'invalid'
  error?: string
  updatedAt?: number
}

export interface SkillReadContent {
  content: string
  updatedAt?: number
}

export class SkillLoader {
  constructor(private readonly options: { maxFileBytes?: number } = {}) {}

  loadFromRoots(roots: SkillRoot[]): LoadedLocalSkill[] {
    const loaded: LoadedLocalSkill[] = []
    const seen = new Map<string, number>()

    for (const root of roots) {
      const rootPath = resolve(root.path)
      if (!existsSync(rootPath)) {
        continue
      }

      const entries = safeReadDirectory(rootPath)
      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue
        }
        const directoryPath = resolve(rootPath, entry.name)
        const skillFilePath = resolve(directoryPath, 'SKILL.md')
        if (!existsSync(skillFilePath)) {
          continue
        }

        const baseId =
          normalizeSkillId(entry.name) || normalizeSkillId(basename(directoryPath)) || 'skill'
        const collisionCount = seen.get(baseId) ?? 0
        seen.set(baseId, collisionCount + 1)
        const id = collisionCount === 0 ? baseId : `${baseId}_${collisionCount + 1}`

        loaded.push(
          this.loadSkillFile({
            id,
            rootName: root.name,
            rootPath,
            directoryPath,
            skillFilePath,
            collision: collisionCount > 0,
          })
        )
      }
    }

    return loaded.sort((a, b) => a.id.localeCompare(b.id))
  }

  readSkillFile(skill: Pick<LoadedLocalSkill, 'rootPath' | 'skillFilePath'>): SkillReadContent {
    const rootPath = resolve(skill.rootPath)
    const skillFilePath = resolve(skill.skillFilePath)
    if (!isPathInside(rootPath, skillFilePath)) {
      throw new Error('Skill file is outside the configured skill root.')
    }
    const stat = statSync(skillFilePath)
    const maxFileBytes = this.options.maxFileBytes ?? MAX_SKILL_FILE_BYTES
    if (!stat.isFile()) {
      throw new Error('Skill document is not a file.')
    }
    if (stat.size > maxFileBytes) {
      throw new Error(`Skill document exceeds ${maxFileBytes} bytes.`)
    }
    return {
      content: normalizeLineEndings(readFileSync(skillFilePath, { encoding: 'utf8' })),
      updatedAt: stat.mtimeMs,
    }
  }

  private loadSkillFile(input: {
    id: string
    rootName: string
    rootPath: string
    directoryPath: string
    skillFilePath: string
    collision: boolean
  }): LoadedLocalSkill {
    const relativePath = relative(input.rootPath, input.directoryPath) || input.id
    try {
      const { content, updatedAt } = this.readSkillFile(input)
      const parsed = parseSkillMarkdown(content)
      const metadata = parsed.metadata
      const name = metadata.name || humanizeSkillId(input.id)
      const description = truncateText(metadata.description || '', MAX_SKILL_DESCRIPTION_CHARS)
      const collisionError = input.collision
        ? 'Skill id collided with another package and was assigned a deterministic suffix.'
        : undefined
      return {
        id: input.id,
        rootName: input.rootName,
        rootPath: input.rootPath,
        directoryPath: input.directoryPath,
        skillFilePath: input.skillFilePath,
        relativePath,
        name,
        description,
        metadata,
        content,
        status: 'available',
        error: collisionError,
        updatedAt,
      }
    } catch (error) {
      return {
        id: input.id,
        rootName: input.rootName,
        rootPath: input.rootPath,
        directoryPath: input.directoryPath,
        skillFilePath: input.skillFilePath,
        relativePath,
        name: humanizeSkillId(input.id),
        description: '',
        metadata: {},
        status: 'invalid',
        error: error instanceof Error ? error.message : 'Failed to load skill document.',
      }
    }
  }
}

export function parseSkillMarkdown(content: string): { metadata: SkillMetadata; body: string } {
  const normalized = normalizeLineEndings(content)
  if (!normalized.startsWith('---\n')) {
    return { metadata: {}, body: normalized }
  }

  const endIndex = normalized.indexOf('\n---\n', 4)
  if (endIndex === -1) {
    return { metadata: {}, body: normalized }
  }

  const frontmatter = normalized.slice(4, endIndex)
  const body = normalized.slice(endIndex + 5)
  return {
    metadata: parseScalarFrontmatter(frontmatter),
    body,
  }
}

export function isPathInside(rootPath: string, targetPath: string): boolean {
  const root = resolve(rootPath)
  const target = resolve(targetPath)
  const rel = relative(root, target)
  return rel === '' || (!rel.startsWith('..') && !rel.startsWith('/') && rel !== '..')
}

function parseScalarFrontmatter(value: string): SkillMetadata {
  const metadata: SkillMetadata = {}
  for (const rawLine of value.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) {
      continue
    }
    const separator = line.indexOf(':')
    if (separator <= 0) {
      continue
    }
    const key = line.slice(0, separator).trim()
    const rawValue = line.slice(separator + 1).trim()
    if (!isSupportedMetadataKey(key) || !rawValue) {
      continue
    }
    metadata[key] = unquote(rawValue)
  }
  return metadata
}

function isSupportedMetadataKey(key: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(key)
}

function unquote(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }
  return value
}

function safeReadDirectory(path: string): Dirent<string>[] {
  try {
    return readdirSync(path, { withFileTypes: true })
  } catch {
    return []
  }
}

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n?/g, '\n')
}

function humanizeSkillId(id: string): string {
  return (
    id
      .split(/[_-]+/)
      .filter(Boolean)
      .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
      .join(' ') || 'Local Skill'
  )
}

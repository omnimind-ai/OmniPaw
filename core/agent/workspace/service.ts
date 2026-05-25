import { constants } from 'node:fs'
import {
  access,
  copyFile,
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import type { Logger } from '@core/logging'
import type {
  AgentWorkspaceFileEntry,
  AgentWorkspaceStatus,
  DeleteWorkspaceFileResponse,
  ListWorkspaceFilesResponse,
  LocalAgentOperationError,
  LocalAgentWorkspaceSettings,
  LocalCommandSandboxLevel,
  ReadWorkspaceFileResponse,
} from '@shared/types/local-agent'

export interface AgentWorkspaceServiceOptions {
  userDataPath: string
  settings: () => LocalAgentWorkspaceSettings
  sandboxLevel?: () => LocalCommandSandboxLevel
  logger?: Logger
}

export interface WorkspaceFileWriteRequest {
  sessionId: string
  path: string
  content: string
  append?: boolean
}

export interface WorkspaceFileSearchRequest {
  sessionId: string
  query: string
  path?: string
  maxResults?: number
  contextChars?: number
}

export interface WorkspaceFilePatchRequest {
  sessionId: string
  path: string
  oldText?: string
  newText?: string
  replaceAll?: boolean
}

interface WorkspacePaths {
  id: string
  sessionId: string
  root: string
  files: string
  tmp: string
  logs: string
  exports: string
}

interface ResolvedPath {
  relativePath: string
  absolutePath: string
  rootPath: string
}

export class AgentWorkspaceError extends Error implements LocalAgentOperationError {
  readonly code: LocalAgentOperationError['code']
  readonly recoverable: boolean

  constructor(
    code: LocalAgentOperationError['code'],
    message: string,
    options: { recoverable?: boolean } = {}
  ) {
    super(message)
    this.name = 'AgentWorkspaceError'
    this.code = code
    this.recoverable = options.recoverable ?? true
  }
}

export class AgentWorkspaceService {
  private readonly rootPath: string
  private readonly logger?: Logger

  constructor(private readonly options: AgentWorkspaceServiceOptions) {
    this.rootPath = join(options.userDataPath, 'agent-workspaces', 'sessions')
    this.logger = options.logger
  }

  async ensureWorkspace(sessionId: string): Promise<WorkspacePaths> {
    const id = safeWorkspaceId(sessionId)
    const root = join(this.rootPath, id)
    const paths: WorkspacePaths = {
      id,
      sessionId,
      root,
      files: join(root, 'files'),
      tmp: join(root, 'tmp'),
      logs: join(root, 'logs'),
      exports: join(root, 'exports'),
    }
    await Promise.all([
      mkdir(paths.files, { recursive: true }),
      mkdir(paths.tmp, { recursive: true }),
      mkdir(paths.logs, { recursive: true }),
      mkdir(paths.exports, { recursive: true }),
    ])
    return paths
  }

  async getStatus(sessionId: string): Promise<AgentWorkspaceStatus> {
    const workspace = await this.ensureWorkspace(sessionId)
    const [rootStats, usage] = await Promise.all([
      stat(workspace.root),
      collectUsage(workspace.files, this.settings()),
    ])
    return {
      id: workspace.id,
      sessionId,
      rootName: basename(workspace.root),
      rootPath: workspace.root,
      filesPath: workspace.files,
      fileCount: usage.fileCount,
      sizeBytes: usage.sizeBytes,
      createdAt: rootStats.birthtimeMs,
      updatedAt: Math.max(rootStats.mtimeMs, usage.updatedAt),
      policy: {
        enabled: this.settings().enabled,
        rootStrategy: this.settings().rootStrategy,
        maxFileBytes: this.settings().maxFileBytes,
        maxReadBytes: this.settings().maxReadBytes,
        sandbox: this.options.sandboxLevel?.() ?? 'policy-only',
      },
    }
  }

  async listFiles(input: {
    sessionId: string
    path?: string
    recursive?: boolean
    maxEntries?: number
  }): Promise<ListWorkspaceFilesResponse> {
    this.ensureEnabled()
    const workspace = await this.ensureWorkspace(input.sessionId)
    const target = await this.resolveExistingPath(workspace, input.path ?? '')
    const targetStats = await lstat(target.absolutePath)
    if (!targetStats.isDirectory()) {
      throw new AgentWorkspaceError('invalid_request', 'Workspace list target must be a directory.')
    }

    const maxEntries = Math.max(1, Math.min(Math.floor(input.maxEntries ?? 200), 1000))
    const entries: AgentWorkspaceFileEntry[] = []
    await collectEntries(target.absolutePath, workspace.files, entries, {
      recursive: input.recursive === true,
      maxEntries,
    })
    return {
      sessionId: input.sessionId,
      path: target.relativePath,
      entries,
      truncated: entries.length >= maxEntries,
    }
  }

  async readFile(input: {
    sessionId: string
    path: string
    maxBytes?: number
  }): Promise<ReadWorkspaceFileResponse> {
    this.ensureEnabled()
    const workspace = await this.ensureWorkspace(input.sessionId)
    const target = await this.resolveExistingPath(workspace, input.path)
    const targetStats = await lstat(target.absolutePath)
    if (!targetStats.isFile()) {
      throw new AgentWorkspaceError('invalid_request', 'Workspace read target must be a file.')
    }
    if (targetStats.size > this.settings().maxFileBytes) {
      throw new AgentWorkspaceError(
        'file_too_large',
        'Workspace file exceeds the configured size limit.'
      )
    }

    const maxBytes = Math.max(
      1,
      Math.min(
        Math.floor(input.maxBytes ?? this.settings().maxReadBytes),
        this.settings().maxReadBytes
      )
    )
    const buffer = await readFile(target.absolutePath)
    const truncated = buffer.length > maxBytes
    const slice = truncated ? buffer.subarray(0, maxBytes) : buffer
    const binary = looksBinary(slice)
    return {
      sessionId: input.sessionId,
      path: target.relativePath,
      content: binary ? '' : slice.toString('utf8'),
      sizeBytes: targetStats.size,
      truncated,
      binary,
    }
  }

  async writeFile(input: WorkspaceFileWriteRequest): Promise<AgentWorkspaceFileEntry> {
    this.ensureEnabled()
    const workspace = await this.ensureWorkspace(input.sessionId)
    const target = await this.resolveWritablePath(workspace, input.path)
    const buffer = Buffer.from(input.content, 'utf8')
    if (buffer.length > this.settings().maxWriteBytes) {
      throw new AgentWorkspaceError(
        'file_too_large',
        'Workspace write exceeds the configured write size limit.'
      )
    }
    await mkdir(dirname(target.absolutePath), { recursive: true })
    if (input.append) {
      await writeFile(target.absolutePath, buffer, { flag: 'a' })
    } else {
      await writeFile(target.absolutePath, buffer)
    }
    return entryFor(target.absolutePath, target.rootPath)
  }

  async searchFiles(input: WorkspaceFileSearchRequest): Promise<{
    query: string
    matches: Array<{ path: string; line: number; snippet: string }>
    truncated: boolean
  }> {
    this.ensureEnabled()
    const query = input.query.trim()
    if (!query) {
      throw new AgentWorkspaceError('invalid_request', 'Workspace search requires a query.')
    }
    const workspace = await this.ensureWorkspace(input.sessionId)
    const target = await this.resolveExistingPath(workspace, input.path ?? '')
    const maxResults = Math.max(
      1,
      Math.min(
        Math.floor(input.maxResults ?? this.settings().maxSearchResults),
        this.settings().maxSearchResults
      )
    )
    const contextChars = Math.max(20, Math.min(Math.floor(input.contextChars ?? 120), 500))
    const matches: Array<{ path: string; line: number; snippet: string }> = []
    await searchPath(target.absolutePath, workspace.files, query, matches, {
      maxResults,
      contextChars,
      maxFileBytes: this.settings().maxReadBytes,
      settings: this.settings(),
    })
    return {
      query,
      matches,
      truncated: matches.length >= maxResults,
    }
  }

  async patchFile(input: WorkspaceFilePatchRequest): Promise<AgentWorkspaceFileEntry> {
    this.ensureEnabled()
    const oldText = input.oldText
    const newText = input.newText
    if (typeof oldText !== 'string' || typeof newText !== 'string') {
      throw new AgentWorkspaceError(
        'invalid_request',
        'Workspace patch requires oldText and newText.'
      )
    }
    const current = await this.readFile({
      sessionId: input.sessionId,
      path: input.path,
      maxBytes: this.settings().maxReadBytes,
    })
    if (current.binary) {
      throw new AgentWorkspaceError(
        'invalid_request',
        'Workspace patch target must be a text file.'
      )
    }
    if (!current.content.includes(oldText)) {
      throw new AgentWorkspaceError('invalid_request', 'Workspace patch oldText was not found.')
    }
    const nextContent = input.replaceAll
      ? current.content.split(oldText).join(newText)
      : current.content.replace(oldText, newText)
    return this.writeFile({
      sessionId: input.sessionId,
      path: input.path,
      content: nextContent,
    })
  }

  async exportFile(input: {
    sessionId: string
    path: string
    destinationPath: string
  }): Promise<{ sessionId: string; path: string; destinationPath: string }> {
    this.ensureEnabled()
    const workspace = await this.ensureWorkspace(input.sessionId)
    const source = await this.resolveExistingPath(workspace, input.path)
    const sourceStats = await lstat(source.absolutePath)
    if (!sourceStats.isFile()) {
      throw new AgentWorkspaceError('invalid_request', 'Workspace export target must be a file.')
    }
    await mkdir(dirname(input.destinationPath), { recursive: true })
    await copyFile(source.absolutePath, input.destinationPath, constants.COPYFILE_FICLONE)
    return {
      sessionId: input.sessionId,
      path: source.relativePath,
      destinationPath: input.destinationPath,
    }
  }

  async deleteFile(input: {
    sessionId: string
    path: string
  }): Promise<DeleteWorkspaceFileResponse> {
    this.ensureEnabled()
    const workspace = await this.ensureWorkspace(input.sessionId)
    const target = await this.resolveExistingPath(workspace, input.path)
    if (!target.relativePath) {
      throw new AgentWorkspaceError('path_denied', 'Workspace root cannot be deleted as a file.')
    }
    await rm(target.absolutePath, { recursive: true, force: true })
    return {
      sessionId: input.sessionId,
      path: target.relativePath,
      deleted: true,
    }
  }

  async cleanupWorkspace(sessionId: string): Promise<{ sessionId: string; deleted: boolean }> {
    const workspace = await this.ensureWorkspace(sessionId)
    await rm(workspace.root, { recursive: true, force: true })
    this.logger?.info('Agent workspace cleaned up.', { workspaceId: workspace.id })
    return { sessionId, deleted: true }
  }

  async resolveCwd(sessionId: string, requestedCwd: string | undefined): Promise<string> {
    const workspace = await this.ensureWorkspace(sessionId)
    if (!requestedCwd || requestedCwd.trim() === '') {
      return workspace.files
    }
    const target = await this.resolveExistingPath(workspace, requestedCwd)
    const targetStats = await lstat(target.absolutePath)
    if (!targetStats.isDirectory()) {
      throw new AgentWorkspaceError(
        'invalid_request',
        'Terminal cwd must be a workspace directory.'
      )
    }
    return target.absolutePath
  }

  async getWorkspacePaths(sessionId: string): Promise<WorkspacePaths> {
    return this.ensureWorkspace(sessionId)
  }

  private async resolveExistingPath(
    workspace: WorkspacePaths,
    relativePath: string
  ): Promise<ResolvedPath> {
    const target = this.resolveWorkspacePath(workspace, relativePath)
    await assertExists(target.absolutePath)
    const [rootReal, targetReal, linkStats] = await Promise.all([
      realpath(workspace.files),
      realpath(target.absolutePath),
      lstat(target.absolutePath),
    ])
    if (linkStats.isSymbolicLink() || !isInside(targetReal, rootReal)) {
      throw new AgentWorkspaceError(
        'path_denied',
        'Workspace path resolves outside the managed workspace.'
      )
    }
    return {
      ...target,
      absolutePath: targetReal,
      rootPath: rootReal,
    }
  }

  private async resolveWritablePath(
    workspace: WorkspacePaths,
    relativePath: string
  ): Promise<ResolvedPath> {
    const target = this.resolveWorkspacePath(workspace, relativePath)
    await mkdir(dirname(target.absolutePath), { recursive: true })
    const [rootReal, parentReal] = await Promise.all([
      realpath(workspace.files),
      realpath(dirname(target.absolutePath)),
    ])
    if (!isInside(parentReal, rootReal)) {
      throw new AgentWorkspaceError(
        'path_denied',
        'Workspace write path resolves outside the managed workspace.'
      )
    }

    try {
      const current = await lstat(target.absolutePath)
      if (!current.isFile()) {
        throw new AgentWorkspaceError(
          'path_denied',
          'Workspace write target is not a regular file.'
        )
      }
      if (current.nlink > 1) {
        throw new AgentWorkspaceError(
          'path_denied',
          'Workspace write target has multiple hard links.'
        )
      }
      const targetReal = await realpath(target.absolutePath)
      if (!isInside(targetReal, rootReal)) {
        throw new AgentWorkspaceError(
          'path_denied',
          'Workspace write path resolves outside the managed workspace.'
        )
      }
    } catch (error) {
      if (error instanceof AgentWorkspaceError) {
        throw error
      }
      if (!isMissingFileError(error)) {
        throw error
      }
    }

    return {
      ...target,
      rootPath: rootReal,
    }
  }

  private resolveWorkspacePath(workspace: WorkspacePaths, inputPath: string): ResolvedPath {
    const normalized = normalizeWorkspaceRelativePath(inputPath)
    assertNotSensitive(normalized, this.settings())
    const absolutePath = resolve(workspace.files, normalized)
    if (!isInside(absolutePath, workspace.files)) {
      throw new AgentWorkspaceError(
        'path_denied',
        'Workspace path must stay inside the managed workspace.'
      )
    }
    return {
      relativePath: normalized,
      absolutePath,
      rootPath: workspace.files,
    }
  }

  private ensureEnabled(): void {
    if (!this.settings().enabled) {
      throw new AgentWorkspaceError(
        'local_capability_unavailable',
        'Agent workspace capability is disabled.'
      )
    }
  }

  private settings(): LocalAgentWorkspaceSettings {
    return this.options.settings()
  }
}

async function collectEntries(
  directory: string,
  root: string,
  entries: AgentWorkspaceFileEntry[],
  options: { recursive: boolean; maxEntries: number }
): Promise<void> {
  if (entries.length >= options.maxEntries) return
  const children = await readdir(directory, { withFileTypes: true })
  for (const child of children) {
    if (entries.length >= options.maxEntries) return
    const childPath = join(directory, child.name)
    const childStats = await lstat(childPath)
    if (childStats.isSymbolicLink()) continue
    if (childStats.isFile() || childStats.isDirectory()) {
      entries.push(await entryFor(childPath, root))
    }
    if (options.recursive && childStats.isDirectory()) {
      await collectEntries(childPath, root, entries, options)
    }
  }
}

async function collectUsage(
  directory: string,
  settings: LocalAgentWorkspaceSettings
): Promise<{ fileCount: number; sizeBytes: number; updatedAt: number }> {
  let fileCount = 0
  let sizeBytes = 0
  let updatedAt = 0
  async function visit(current: string) {
    const children = await readdir(current, { withFileTypes: true }).catch(() => [])
    for (const child of children) {
      const childPath = join(current, child.name)
      const relativePath = relative(directory, childPath)
      if (isSensitivePath(relativePath, settings)) continue
      const childStats = await lstat(childPath).catch(() => undefined)
      if (!childStats || childStats.isSymbolicLink()) continue
      updatedAt = Math.max(updatedAt, childStats.mtimeMs)
      if (childStats.isDirectory()) {
        await visit(childPath)
      } else if (childStats.isFile()) {
        fileCount += 1
        sizeBytes += childStats.size
      }
    }
  }
  await visit(directory)
  return { fileCount, sizeBytes, updatedAt }
}

async function searchPath(
  targetPath: string,
  root: string,
  query: string,
  matches: Array<{ path: string; line: number; snippet: string }>,
  options: {
    maxResults: number
    contextChars: number
    maxFileBytes: number
    settings: LocalAgentWorkspaceSettings
  }
): Promise<void> {
  if (matches.length >= options.maxResults) return
  const targetStats = await lstat(targetPath)
  if (targetStats.isSymbolicLink()) return
  if (targetStats.isDirectory()) {
    const children = await readdir(targetPath)
    for (const child of children) {
      await searchPath(join(targetPath, child), root, query, matches, options)
      if (matches.length >= options.maxResults) return
    }
    return
  }
  if (!targetStats.isFile() || targetStats.size > options.maxFileBytes) return
  const relativePath = relative(root, targetPath)
  if (isSensitivePath(relativePath, options.settings)) return
  const buffer = await readFile(targetPath)
  if (looksBinary(buffer.subarray(0, Math.min(buffer.length, 4096)))) return
  const text = buffer.toString('utf8')
  const needle = query.toLowerCase()
  const haystack = text.toLowerCase()
  let index = 0
  while (matches.length < options.maxResults) {
    const found = haystack.indexOf(needle, index)
    if (found < 0) break
    matches.push({
      path: normalizeOutputPath(relativePath),
      line: lineForIndex(text, found),
      snippet: snippet(text, found, query.length, options.contextChars),
    })
    index = found + Math.max(query.length, 1)
  }
}

async function entryFor(absolutePath: string, root: string): Promise<AgentWorkspaceFileEntry> {
  const item = await lstat(absolutePath)
  return {
    name: basename(absolutePath),
    path: normalizeOutputPath(relative(root, absolutePath)),
    kind: item.isDirectory() ? 'directory' : 'file',
    sizeBytes: item.isDirectory() ? 0 : item.size,
    updatedAt: item.mtimeMs,
  }
}

function normalizeWorkspaceRelativePath(inputPath: string): string {
  if (typeof inputPath !== 'string') {
    throw new AgentWorkspaceError('invalid_request', 'Workspace path must be a string.')
  }
  if (inputPath.includes('\0')) {
    throw new AgentWorkspaceError('path_denied', 'Workspace path contains an invalid character.')
  }
  if (inputPath.startsWith('/') || /^[A-Za-z]:[\\/]/.test(inputPath)) {
    throw new AgentWorkspaceError('path_denied', 'Workspace path must be relative.')
  }
  const normalized = inputPath.replace(/\\/g, '/').replace(/^\/+/, '')
  const parts = normalized.split('/').filter(Boolean)
  if (parts.some((part) => part === '..')) {
    throw new AgentWorkspaceError('path_denied', 'Workspace path cannot contain parent traversal.')
  }
  return parts.join('/')
}

function assertNotSensitive(relativePath: string, settings: LocalAgentWorkspaceSettings): void {
  if (relativePath && isSensitivePath(relativePath, settings)) {
    throw new AgentWorkspaceError(
      'sensitive_path_denied',
      'Workspace path matches a sensitive path rule.'
    )
  }
}

function isSensitivePath(relativePath: string, settings: LocalAgentWorkspaceSettings): boolean {
  const normalized = normalizeOutputPath(relativePath).toLowerCase()
  const parts = normalized.split('/').filter(Boolean)
  const base = parts.at(-1) ?? ''
  if (
    base === '.env' ||
    base.startsWith('.env.') ||
    base === 'id_rsa' ||
    base === 'id_ed25519' ||
    parts.includes('.ssh') ||
    parts.some((part) => ['credentials', 'credential', 'secrets', 'secret'].includes(part)) ||
    base.includes('credential') ||
    base.includes('secret') ||
    base.includes('token')
  ) {
    return true
  }
  return settings.denyPatterns.some((pattern) => matchPattern(normalized, pattern.toLowerCase()))
}

function matchPattern(value: string, pattern: string): boolean {
  const doubleStarToken = '__DOUBLE_STAR__'
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, doubleStarToken)
    .replace(/\*/g, '[^/]*')
    .replaceAll(doubleStarToken, '.*')
  return new RegExp(`^${escaped}$`).test(value)
}

function looksBinary(buffer: Buffer): boolean {
  if (!buffer.length) return false
  return buffer.subarray(0, Math.min(buffer.length, 4096)).includes(0)
}

async function assertExists(path: string): Promise<void> {
  try {
    await access(path, constants.F_OK)
  } catch {
    throw new AgentWorkspaceError('workspace_not_found', 'Workspace path was not found.')
  }
}

function isInside(candidate: string, root: string): boolean {
  const relativePath = relative(root, candidate)
  return relativePath === '' || (!relativePath.startsWith('..') && !relativePath.startsWith(sep))
}

function normalizeOutputPath(path: string): string {
  return path.split(sep).join('/')
}

function safeWorkspaceId(sessionId: string): string {
  const value = String(sessionId || '').trim()
  if (!value) {
    throw new AgentWorkspaceError('invalid_request', 'sessionId is required.')
  }
  return value.replace(/[^A-Za-z0-9_.-]+/g, '_').slice(0, 120)
}

function isMissingFileError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
}

function lineForIndex(text: string, index: number): number {
  return text.slice(0, index).split('\n').length
}

function snippet(text: string, index: number, length: number, contextChars: number): string {
  const start = Math.max(0, index - contextChars)
  const end = Math.min(text.length, index + length + contextChars)
  return `${start > 0 ? '...' : ''}${text.slice(start, end)}${end < text.length ? '...' : ''}`
}

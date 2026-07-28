import { randomUUID } from 'node:crypto'
import { EventEmitter, once } from 'node:events'
import { createWriteStream, existsSync, statSync } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import type { Logger } from '@core/logging'
import type {
  OmniInferCatalogDownloadFile,
  OmniInferModelDownloadTask,
  RetryOmniInferModelDownloadRequest,
  StartOmniInferModelDownloadRequest,
} from '@shared/types/omniinfer'
import type { InstalledModelRegistry } from './installed-models'

const GIB = 1024 * 1024 * 1024
const SNAPSHOT_INTERVAL_MS = 200
const ALLOWED_DOWNLOAD_HOSTS = new Set([
  'huggingface.co',
  'hf-mirror.com',
  'modelscope.cn',
  'www.modelscope.cn',
  'omnimind-model.oss-cn-beijing.aliyuncs.com',
])

type FetchLike = typeof fetch
type DownloadTaskListener = (task: OmniInferModelDownloadTask) => void

interface InternalDownloadTask {
  snapshot: OmniInferModelDownloadTask
  request: StartOmniInferModelDownloadRequest
  controller: AbortController
  targetFiles: string[]
}

export interface OmniInferModelDownloadManagerOptions {
  installedModels: InstalledModelRegistry
  fetchImpl?: FetchLike
  logger?: Logger
  now?: () => number
}

export class OmniInferModelDownloadManager {
  private readonly installedModels: InstalledModelRegistry
  private readonly fetchImpl: FetchLike
  private readonly logger?: Logger
  private readonly now: () => number
  private readonly emitter = new EventEmitter()
  private readonly tasks = new Map<string, InternalDownloadTask>()

  constructor(options: OmniInferModelDownloadManagerOptions) {
    this.installedModels = options.installedModels
    this.fetchImpl = options.fetchImpl ?? fetch
    this.logger = options.logger
    this.now = options.now ?? Date.now
    this.emitter.setMaxListeners(50)
  }

  list(): OmniInferModelDownloadTask[] {
    return Array.from(this.tasks.values())
      .map((task) => cloneTask(task.snapshot))
      .sort((left, right) => right.updatedAt - left.updatedAt)
  }

  onChanged(listener: DownloadTaskListener): () => void {
    this.emitter.on('changed', listener)
    return () => {
      this.emitter.off('changed', listener)
    }
  }

  start(request: StartOmniInferModelDownloadRequest): OmniInferModelDownloadTask {
    const normalized = validateDownloadRequest(request)
    const duplicate = Array.from(this.tasks.values()).find(
      (task) =>
        task.snapshot.modelId === normalized.modelId &&
        (task.snapshot.status === 'queued' || task.snapshot.status === 'downloading')
    )
    if (duplicate) return cloneTask(duplicate.snapshot)

    const now = this.now()
    const id = `${now}-${randomUUID().slice(0, 8)}`
    const task: InternalDownloadTask = {
      request: normalized,
      controller: new AbortController(),
      targetFiles: [],
      snapshot: {
        id,
        modelId: normalized.modelId,
        modelName: normalized.modelName,
        source: normalized.source,
        status: 'queued',
        progress: 0,
        downloadedBytes: 0,
        totalBytes: expectedTotalBytes(normalized.files),
        createdAt: now,
        updatedAt: now,
      },
    }
    this.tasks.set(id, task)
    this.emit(task)
    void this.run(task)
    return cloneTask(task.snapshot)
  }

  cancel(taskId: string): OmniInferModelDownloadTask {
    const task = this.requireTask(taskId)
    if (task.snapshot.status === 'queued' || task.snapshot.status === 'downloading') {
      task.controller.abort()
      this.update(task, {
        status: 'canceled',
        speedBytesPerSecond: undefined,
        errorMessage: undefined,
      })
      void this.removePartialFiles(task.targetFiles)
    }
    return cloneTask(task.snapshot)
  }

  retry(request: RetryOmniInferModelDownloadRequest): OmniInferModelDownloadTask {
    const task = this.requireTask(request.taskId)
    if (task.snapshot.status !== 'failed' && task.snapshot.status !== 'canceled') {
      return cloneTask(task.snapshot)
    }
    task.controller = new AbortController()
    task.targetFiles = []
    this.update(task, {
      status: 'queued',
      progress: 0,
      downloadedBytes: 0,
      speedBytesPerSecond: undefined,
      errorMessage: undefined,
    })
    void this.run(task)
    return cloneTask(task.snapshot)
  }

  dispose(): void {
    for (const task of this.tasks.values()) {
      if (task.snapshot.status === 'queued' || task.snapshot.status === 'downloading') {
        task.controller.abort()
      }
    }
    this.emitter.removeAllListeners()
  }

  private async run(task: InternalDownloadTask): Promise<void> {
    const modelsDir = resolve(this.installedModels.getModelsDir())
    const modelDir = join(modelsDir, safePathSegment(task.request.modelId))
    await mkdir(modelDir, { recursive: true })
    const files = task.request.files.map((file, index) => ({
      ...file,
      targetPath: join(modelDir, safeFilename(file, index)),
    }))
    task.targetFiles = files.map((file) => file.targetPath)

    try {
      this.update(task, { status: 'downloading', errorMessage: undefined })
      let completedBytes = 0
      for (const file of files) {
        completedBytes += await this.downloadFile(task, file, completedBytes)
      }
      if (task.controller.signal.aborted) return
      await this.installedModels.scan()
      const primaryPath = files[0]?.targetPath
      const primaryModelId = primaryPath
        ? this.installedModels.resolveModelId(primaryPath)
        : undefined
      if (primaryModelId) {
        this.installedModels.updateMetadata(primaryModelId, {
          displayName: task.request.modelName,
          supportsVision: task.request.supportsVision,
          supportsThinking: task.request.supportsThinking,
          contextLength: task.request.contextLength,
        })
      }
      this.update(task, {
        status: 'completed',
        progress: 100,
        downloadedBytes: completedBytes,
        totalBytes: task.snapshot.totalBytes ?? completedBytes,
        speedBytesPerSecond: undefined,
      })
    } catch (error) {
      if (task.controller.signal.aborted || task.snapshot.status === 'canceled') return
      const message = error instanceof Error ? error.message : String(error)
      this.logger?.warn('OmniInfer model download failed.', {
        taskId: task.snapshot.id,
        modelId: task.snapshot.modelId,
        error,
      })
      this.update(task, {
        status: 'failed',
        speedBytesPerSecond: undefined,
        errorMessage: message,
      })
    }
  }

  private async downloadFile(
    task: InternalDownloadTask,
    file: OmniInferCatalogDownloadFile & { targetPath: string },
    completedBefore: number
  ): Promise<number> {
    const finalSize = existingFileSize(file.targetPath)
    const expectedBytes = sizeGiBToBytes(file.sizeGiB)
    if (finalSize > 0) {
      this.updateAggregateProgress(task, completedBefore + finalSize)
      return finalSize
    }

    const partialPath = `${file.targetPath}.partial`
    let downloaded = existingFileSize(partialPath)
    const url = validateDownloadUrl(file.download, task.request.source)
    const headers: Record<string, string> = {
      Accept: '*/*',
      'Accept-Encoding': 'identity',
      'User-Agent': 'OmniPaw/1.0',
    }
    if (downloaded > 0) {
      headers.Range = `bytes=${downloaded}-`
    }
    const response = await this.fetchImpl(url, {
      method: 'GET',
      headers,
      redirect: 'follow',
      signal: task.controller.signal,
    })
    if (!response.ok && response.status !== 206) {
      throw new Error(`Model download failed with HTTP ${response.status}.`)
    }
    const append = downloaded > 0 && response.status === 206
    if (!append) downloaded = 0
    const responseLength = parseContentLength(response.headers.get('content-length'))
    const fileTotal = expectedBytes ?? (responseLength ? responseLength + downloaded : undefined)
    if (fileTotal) {
      const fileIndex = task.request.files.findIndex((item) => item.download === file.download)
      const remainingExpected = task.request.files
        .slice(fileIndex + 1)
        .reduce((sum, item) => sum + (sizeGiBToBytes(item.sizeGiB) ?? 0), 0)
      task.snapshot.totalBytes = Math.max(
        task.snapshot.totalBytes ?? 0,
        completedBefore + fileTotal + remainingExpected
      )
    }
    if (!response.body) {
      throw new Error('Model download response did not include a body.')
    }

    const output = createWriteStream(partialPath, { flags: append ? 'a' : 'w' })
    let speedWindowStarted = this.now()
    let speedWindowBytes = 0
    let lastSnapshotAt = 0

    try {
      for await (const rawChunk of response.body as AsyncIterable<Uint8Array>) {
        if (task.controller.signal.aborted) throw task.controller.signal.reason
        const chunk = Buffer.from(rawChunk)
        if (!output.write(chunk)) {
          await once(output, 'drain')
        }
        downloaded += chunk.byteLength
        speedWindowBytes += chunk.byteLength
        const now = this.now()
        const elapsed = now - speedWindowStarted
        if (elapsed >= 450) {
          task.snapshot.speedBytesPerSecond = Math.round((speedWindowBytes / elapsed) * 1000)
          speedWindowStarted = now
          speedWindowBytes = 0
        }
        this.updateAggregateProgress(task, completedBefore + downloaded, false)
        if (now - lastSnapshotAt >= SNAPSHOT_INTERVAL_MS) {
          task.snapshot.updatedAt = now
          this.emit(task)
          lastSnapshotAt = now
        }
      }
      output.end()
      await once(output, 'finish')
    } catch (error) {
      output.destroy()
      throw error
    }

    await rename(partialPath, file.targetPath)
    this.updateAggregateProgress(task, completedBefore + downloaded)
    return downloaded
  }

  private updateAggregateProgress(
    task: InternalDownloadTask,
    downloadedBytes: number,
    shouldEmit = true
  ): void {
    task.snapshot.downloadedBytes = downloadedBytes
    const total = task.snapshot.totalBytes
    task.snapshot.progress = total ? Math.min(100, Math.max(0, (downloadedBytes / total) * 100)) : 0
    task.snapshot.updatedAt = this.now()
    if (shouldEmit) this.emit(task)
  }

  private update(task: InternalDownloadTask, patch: Partial<OmniInferModelDownloadTask>): void {
    task.snapshot = {
      ...task.snapshot,
      ...patch,
      updatedAt: this.now(),
    }
    this.emit(task)
  }

  private emit(task: InternalDownloadTask): void {
    this.emitter.emit('changed', cloneTask(task.snapshot))
  }

  private requireTask(taskId: string): InternalDownloadTask {
    const task = this.tasks.get(taskId)
    if (!task) throw new Error('OmniInfer model download task was not found.')
    return task
  }

  private async removePartialFiles(targetFiles: string[]): Promise<void> {
    await Promise.all(
      targetFiles.map((targetPath) => rm(`${targetPath}.partial`, { force: true }).catch(() => {}))
    )
  }
}

function validateDownloadRequest(
  request: StartOmniInferModelDownloadRequest
): StartOmniInferModelDownloadRequest {
  const modelId = request.modelId?.trim()
  const modelName = request.modelName?.trim()
  if (!modelId || !modelName) {
    throw new Error('Model id and name are required.')
  }
  if (request.source !== 'omnicore' && request.source !== 'huggingface') {
    throw new Error('Unknown OmniInfer model catalog source.')
  }
  if (!Array.isArray(request.files) || request.files.length === 0) {
    throw new Error('At least one model download file is required.')
  }
  const files = request.files.map((file) => {
    validateDownloadUrl(file.download, request.source)
    return {
      download: file.download,
      sizeGiB:
        typeof file.sizeGiB === 'number' && Number.isFinite(file.sizeGiB)
          ? Math.max(0, file.sizeGiB)
          : undefined,
      filename: file.filename?.trim() || undefined,
    }
  })
  return {
    ...request,
    modelId,
    modelName,
    files,
  }
}

function validateDownloadUrl(
  value: string,
  source: StartOmniInferModelDownloadRequest['source']
): string {
  const url = new URL(value)
  if (url.protocol !== 'https:') {
    throw new Error('Model downloads require HTTPS.')
  }
  const host = url.hostname.toLowerCase()
  const allowed =
    ALLOWED_DOWNLOAD_HOSTS.has(host) || (source === 'omnicore' && host.endsWith('.aliyuncs.com'))
  if (!allowed) {
    throw new Error(`Model download host is not allowed: ${host}`)
  }
  return url.toString()
}

function safeFilename(file: OmniInferCatalogDownloadFile, index: number): string {
  const fromRequest = file.filename?.trim()
  let filename = fromRequest || filenameFromUrl(file.download) || `model-${index + 1}.gguf`
  filename = basename(filename)
    .split('')
    .map((character) => (character.charCodeAt(0) < 32 ? '-' : character))
    .join('')
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/[. ]+$/g, '')
    .slice(0, 180)
  if (!filename.toLowerCase().endsWith('.gguf')) {
    filename = `${filename}.gguf`
  }
  return filename || `model-${index + 1}.gguf`
}

function filenameFromUrl(value: string): string {
  try {
    const url = new URL(value)
    const raw = url.searchParams.get('FilePath') || url.pathname.split('/').pop() || ''
    return decodeURIComponent(raw)
  } catch {
    return ''
  }
}

function safePathSegment(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 120) || 'model'
  )
}

function existingFileSize(path: string): number {
  if (!existsSync(path)) return 0
  try {
    return statSync(path).size
  } catch {
    return 0
  }
}

function sizeGiBToBytes(value?: number): number | undefined {
  if (!value || !Number.isFinite(value) || value <= 0) return undefined
  return Math.round(value * GIB)
}

function expectedTotalBytes(files: OmniInferCatalogDownloadFile[]): number | undefined {
  const sizes = files.map((file) => sizeGiBToBytes(file.sizeGiB))
  if (sizes.some((size) => size === undefined)) return undefined
  return sizes.reduce<number>((sum, size) => sum + (size ?? 0), 0)
}

function parseContentLength(value: string | null): number | undefined {
  if (!value) return undefined
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

function cloneTask(task: OmniInferModelDownloadTask): OmniInferModelDownloadTask {
  return { ...task }
}

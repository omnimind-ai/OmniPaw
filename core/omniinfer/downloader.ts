import { createWriteStream } from 'node:fs'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { dirname } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

export interface DownloadFileRequest {
  url: string
  targetPath: string
  expectedBytes?: number
  fetchImpl?: typeof fetch
  onProgress?: (progress: { bytesReceived: number; totalBytes?: number }) => void
}

export async function fileExists(path: string): Promise<boolean> {
  return stat(path)
    .then((stats) => stats.isFile() && stats.size > 0)
    .catch(() => false)
}

export async function fileSize(path: string): Promise<number | undefined> {
  return stat(path)
    .then((stats) => (stats.isFile() ? stats.size : undefined))
    .catch(() => undefined)
}

export async function downloadFile(request: DownloadFileRequest): Promise<void> {
  const existingSize = await fileSize(request.targetPath)
  if (existingSize && (!request.expectedBytes || existingSize >= request.expectedBytes)) {
    request.onProgress?.({ bytesReceived: existingSize, totalBytes: request.expectedBytes })
    return
  }

  const fetchImpl = request.fetchImpl ?? fetch
  const response = await fetchImpl(request.url)
  if (!response.ok || !response.body) {
    throw new Error(`Model download failed with HTTP ${response.status}.`)
  }

  const totalBytes =
    request.expectedBytes ?? parseContentLength(response.headers.get('content-length'))
  await mkdir(dirname(request.targetPath), { recursive: true })
  const partPath = `${request.targetPath}.part`
  await rm(partPath, { force: true })

  let bytesReceived = 0
  const source = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0])
  source.on('data', (chunk: Buffer) => {
    bytesReceived += chunk.byteLength
    request.onProgress?.({ bytesReceived, totalBytes })
  })

  await pipeline(source, createWriteStream(partPath))

  if (totalBytes && bytesReceived < totalBytes) {
    await rm(partPath, { force: true })
    throw new Error(`Model download was incomplete: ${bytesReceived}/${totalBytes} bytes.`)
  }

  await rename(partPath, request.targetPath)
}

function parseContentLength(value: string | null): number | undefined {
  if (!value) {
    return undefined
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

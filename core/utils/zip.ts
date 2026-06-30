import { inflateRawSync } from 'node:zlib'

export interface ZipArchiveEntry {
  name: string
  data: Buffer
}

export interface ZipArchiveReaderOptions {
  throwError?: (message: string) => never
}

export function readZipEntries(
  bytes: Buffer,
  options: ZipArchiveReaderOptions = {}
): ZipArchiveEntry[] {
  const eocdOffset = findEndOfCentralDirectory(bytes)
  if (eocdOffset < 0) {
    failZip('Uploaded file is not a valid zip archive.', options)
  }

  const entryCount = bytes.readUInt16LE(eocdOffset + 10)
  const centralDirectorySize = bytes.readUInt32LE(eocdOffset + 12)
  const centralDirectoryOffset = bytes.readUInt32LE(eocdOffset + 16)
  if (centralDirectoryOffset + centralDirectorySize > bytes.byteLength) {
    failZip('Zip archive central directory is invalid.', options)
  }

  const entries: ZipArchiveEntry[] = []
  let offset = centralDirectoryOffset
  for (let index = 0; index < entryCount; index += 1) {
    if (bytes.readUInt32LE(offset) !== 0x02014b50) {
      failZip('Zip archive central directory is invalid.', options)
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
      options,
    })
    entries.push({ name, data })
  }
  return entries
}

export function normalizeArchivePath(name: string): string {
  return name.replace(/\\/g, '/').replace(/^\.\/+/, '')
}

export function isIgnoredZipEntry(name: string): boolean {
  const normalized = normalizeArchivePath(name)
  return normalized.split('/')[0] === '__MACOSX'
}

export function validateArchivePaths(names: string[], options: ZipArchiveReaderOptions = {}): void {
  for (const name of names) {
    if (!name || name.startsWith('/') || /^[A-Za-z]:/.test(name)) {
      failZip('Zip archive contains absolute paths.', options)
    }
    if (name.split('/').includes('..')) {
      failZip('Zip archive contains invalid relative paths.', options)
    }
  }
}

function readLocalZipEntry(
  bytes: Buffer,
  entry: {
    method: number
    compressedSize: number
    uncompressedSize: number
    localHeaderOffset: number
    options: ZipArchiveReaderOptions
  }
): Buffer {
  const offset = entry.localHeaderOffset
  if (bytes.readUInt32LE(offset) !== 0x04034b50) {
    failZip('Zip archive local header is invalid.', entry.options)
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
    failZip(`Zip compression method ${entry.method} is not supported.`, entry.options)
  }
  if (data.byteLength !== entry.uncompressedSize) {
    failZip('Zip archive entry size is invalid.', entry.options)
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

function failZip(message: string, options: ZipArchiveReaderOptions): never {
  if (options.throwError) {
    options.throwError(message)
  }
  throw new Error(message)
}

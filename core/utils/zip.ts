import { deflateRawSync, inflateRawSync } from 'node:zlib'

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

export function writeZipEntries(entries: ZipArchiveEntry[]): Buffer {
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let localOffset = 0

  for (const entry of entries) {
    const name = normalizeArchivePath(entry.name)
    const nameBytes = Buffer.from(name, 'utf8')
    const compressed = deflateRawSync(entry.data)
    const crc = crc32(entry.data)
    const localHeader = Buffer.alloc(30)
    localHeader.writeUInt32LE(0x04034b50, 0)
    localHeader.writeUInt16LE(20, 4)
    localHeader.writeUInt16LE(0, 6)
    localHeader.writeUInt16LE(8, 8)
    localHeader.writeUInt16LE(0, 10)
    localHeader.writeUInt16LE(0, 12)
    localHeader.writeUInt32LE(crc, 14)
    localHeader.writeUInt32LE(compressed.byteLength, 18)
    localHeader.writeUInt32LE(entry.data.byteLength, 22)
    localHeader.writeUInt16LE(nameBytes.byteLength, 26)
    localHeader.writeUInt16LE(0, 28)
    localParts.push(localHeader, nameBytes, compressed)

    const centralHeader = Buffer.alloc(46)
    centralHeader.writeUInt32LE(0x02014b50, 0)
    centralHeader.writeUInt16LE(20, 4)
    centralHeader.writeUInt16LE(20, 6)
    centralHeader.writeUInt16LE(0, 8)
    centralHeader.writeUInt16LE(8, 10)
    centralHeader.writeUInt16LE(0, 12)
    centralHeader.writeUInt16LE(0, 14)
    centralHeader.writeUInt32LE(crc, 16)
    centralHeader.writeUInt32LE(compressed.byteLength, 20)
    centralHeader.writeUInt32LE(entry.data.byteLength, 24)
    centralHeader.writeUInt16LE(nameBytes.byteLength, 28)
    centralHeader.writeUInt16LE(0, 30)
    centralHeader.writeUInt16LE(0, 32)
    centralHeader.writeUInt16LE(0, 34)
    centralHeader.writeUInt16LE(0, 36)
    centralHeader.writeUInt32LE(0, 38)
    centralHeader.writeUInt32LE(localOffset, 42)
    centralParts.push(centralHeader, nameBytes)

    localOffset += localHeader.byteLength + nameBytes.byteLength + compressed.byteLength
  }

  const localData = Buffer.concat(localParts)
  const centralDirectory = Buffer.concat(centralParts)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralDirectory.byteLength, 12)
  end.writeUInt32LE(localData.byteLength, 16)
  end.writeUInt16LE(0, 20)
  return Buffer.concat([localData, centralDirectory, end])
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

const crc32Table = new Uint32Array(256).map((_value, index) => {
  let current = index
  for (let bit = 0; bit < 8; bit += 1) {
    current = current & 1 ? 0xedb88320 ^ (current >>> 1) : current >>> 1
  }
  return current >>> 0
})

function crc32(data: Buffer): number {
  let current = 0xffffffff
  for (const byte of data) {
    current = crc32Table[(current ^ byte) & 0xff] ^ (current >>> 8)
  }
  return (current ^ 0xffffffff) >>> 0
}

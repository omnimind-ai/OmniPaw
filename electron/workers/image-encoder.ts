import { deflateSync } from 'node:zlib'

interface EncodeRequest {
  id: string
  bitmap: Uint8Array
  width: number
  height: number
  encodePng: boolean
}

interface EncodeResponse {
  id: string
  ok: boolean
  png?: Buffer
  dataUrl?: string
  error?: string
}

const parentPort = process.parentPort
if (!parentPort) {
  throw new Error('image-encoder worker must be spawned via utilityProcess.fork')
}
const port = parentPort

const CRC_TABLE = new Uint32Array(256)
for (let i = 0; i < 256; i++) {
  let c = i
  for (let j = 0; j < 8; j++) {
    c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  CRC_TABLE[i] = c
}

function crc32(buf: Buffer): number {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc = (CRC_TABLE[(crc ^ buf[i]) & 0xff] ?? 0) ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function makeChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, 'ascii')
  const len = Buffer.allocUnsafe(4)
  len.writeUInt32BE(data.length, 0)
  const crcInput = Buffer.concat([typeBytes, data])
  const crc = Buffer.allocUnsafe(4)
  crc.writeUInt32BE(crc32(crcInput), 0)
  return Buffer.concat([len, typeBytes, data, crc])
}

function encodePng(bgra: Buffer, width: number, height: number): Buffer {
  if (bgra.length !== width * height * 4) {
    throw new Error(
      `bitmap length ${bgra.length} does not match expected ${width * height * 4} (width=${width}, height=${height})`
    )
  }

  const stride = width * 4
  const rowSize = stride + 1
  const withFilters = Buffer.allocUnsafe(height * rowSize)

  for (let y = 0; y < height; y++) {
    const rowOff = y * rowSize
    withFilters[rowOff] = 0
    const srcRow = y * stride
    const dstRow = rowOff + 1
    for (let x = 0; x < stride; x += 4) {
      withFilters[dstRow + x] = bgra[srcRow + x + 2] ?? 0
      withFilters[dstRow + x + 1] = bgra[srcRow + x + 1] ?? 0
      withFilters[dstRow + x + 2] = bgra[srcRow + x] ?? 0
      withFilters[dstRow + x + 3] = bgra[srcRow + x + 3] ?? 0
    }
  }

  const compressed = deflateSync(withFilters)
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  const ihdrData = Buffer.allocUnsafe(13)
  ihdrData.writeUInt32BE(width, 0)
  ihdrData.writeUInt32BE(height, 4)
  ihdrData[8] = 8
  ihdrData[9] = 6
  ihdrData[10] = 0
  ihdrData[11] = 0
  ihdrData[12] = 0

  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdrData),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ])
}

port.on('message', (event) => {
  const data = event.data as EncodeRequest
  try {
    const png = encodePng(Buffer.from(data.bitmap), data.width, data.height)
    const dataUrl = `data:image/png;base64,${png.toString('base64')}`
    const response: EncodeResponse = {
      id: data.id,
      ok: true,
      dataUrl,
    }
    if (data.encodePng) {
      response.png = png
    }
    port.postMessage(response)
  } catch (error) {
    const response: EncodeResponse = {
      id: data.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
    port.postMessage(response)
  }
})

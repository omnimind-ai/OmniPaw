import { nativeImage } from 'electron'

interface EncodeRequest {
  id: string
  bitmap: Uint8Array
  width: number
  height: number
  scaleFactor?: number
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

port.on('message', (event) => {
  const data = event.data as EncodeRequest
  try {
    const image = nativeImage.createFromBitmap(Buffer.from(data.bitmap), {
      width: data.width,
      height: data.height,
      scaleFactor: data.scaleFactor ?? 1,
    })
    const png = image.toPNG()
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

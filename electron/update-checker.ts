import { isVersionNewer, parseUpdateInfoDocument } from '@core/update/update-info'
import type { UpdateCheckResult } from '@shared/types/update'
import { net } from 'electron'

const DEFAULT_UPDATE_INFO_URL = ''
const UPDATE_REQUEST_TIMEOUT_MS = 10_000
const MAX_UPDATE_INFO_BYTES = 64 * 1024

export async function checkForUpdates(currentVersion: string): Promise<UpdateCheckResult> {
  const updateInfoUrl = process.env.OMNIPAW_UPDATE_INFO_URL?.trim() || DEFAULT_UPDATE_INFO_URL
  if (!updateInfoUrl) {
    throw new Error('Update information URL is not configured.')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), UPDATE_REQUEST_TIMEOUT_MS)

  try {
    const response = await net.fetch(updateInfoUrl, {
      headers: {
        Accept: 'application/json',
        'Cache-Control': 'no-cache',
      },
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`Update information request returned HTTP ${response.status}.`)
    }

    const declaredLength = Number(response.headers.get('content-length') ?? 0)
    if (declaredLength > MAX_UPDATE_INFO_BYTES) {
      throw new Error('Update information response is too large.')
    }

    const body = await response.arrayBuffer()
    if (body.byteLength > MAX_UPDATE_INFO_BYTES) {
      throw new Error('Update information response is too large.')
    }

    const document = JSON.parse(new TextDecoder().decode(body)) as unknown
    const updateInfo = parseUpdateInfoDocument(document)

    return {
      ...updateInfo,
      currentVersion,
      hasUpdate: isVersionNewer(currentVersion, updateInfo.version),
    }
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('Update information request timed out.', { cause: error })
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

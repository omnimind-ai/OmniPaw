import { parseUpdateCheckResponseDocument } from '@core/update/update-info'
import type { UpdateCheckResult } from '@shared/types/update'
import { net } from 'electron'

const DEFAULT_UPDATE_SERVICE_URL = 'https://omnipaw-app-update-worker.dx390264.workers.dev'
const UPDATE_REQUEST_TIMEOUT_MS = 10_000
const MAX_UPDATE_INFO_BYTES = 64 * 1024

export async function checkForUpdates(currentVersion: string): Promise<UpdateCheckResult> {
  const updateServiceUrl = process.env.OMNIPAW_UPDATE_INFO_URL?.trim() || DEFAULT_UPDATE_SERVICE_URL
  if (!updateServiceUrl) {
    throw new Error('Update service URL is not configured.')
  }

  const requestUrl = buildUpdateCheckUrl(updateServiceUrl, currentVersion)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), UPDATE_REQUEST_TIMEOUT_MS)

  try {
    const response = await net.fetch(requestUrl.toString(), {
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
    return parseUpdateCheckResponseDocument(document, currentVersion)
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('Update information request timed out.', { cause: error })
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

function buildUpdateCheckUrl(baseUrl: string, currentVersion: string): URL {
  const url = new URL(baseUrl)
  const normalizedPath = url.pathname.replace(/\/+$/, '')
  if (!normalizedPath.toLowerCase().endsWith('/updates')) {
    url.pathname = `${normalizedPath}/updates`.replace(/^\/\//, '/')
  }
  url.searchParams.set('currentVersion', currentVersion)
  return url
}

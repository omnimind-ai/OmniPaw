import { join, resolve } from 'node:path'
import { OMNIPAW_DATA_ROOT_DIR } from '@core/utils/data-paths'

export interface ResolveApplicationDataRootOptions {
  appDataPath: string
  isPackaged: boolean
  overridePath?: string
}

export function resolveApplicationDataRoot(options: ResolveApplicationDataRootOptions): string {
  const overridePath = options.overridePath?.trim()
  if (overridePath) {
    return resolve(overridePath)
  }

  const directoryName = options.isPackaged ? OMNIPAW_DATA_ROOT_DIR : `${OMNIPAW_DATA_ROOT_DIR}-dev`
  return join(options.appDataPath, directoryName)
}

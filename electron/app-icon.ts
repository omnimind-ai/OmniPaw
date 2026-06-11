import { join } from 'node:path'

import { type app, type NativeImage, nativeImage } from 'electron'

export const APP_ICON_PNG_RELATIVE_PATH = 'resources/app-icon.png'
export const TRAY_ICON_PNG_RELATIVE_PATH = 'resources/tray.png'

export function resolveAppIconPath(electronApp: typeof app): string {
  return join(electronApp.getAppPath(), APP_ICON_PNG_RELATIVE_PATH)
}

export function createAppIconImage(electronApp: typeof app): NativeImage {
  return nativeImage.createFromPath(resolveAppIconPath(electronApp))
}

export function resolveTrayIconPath(electronApp: typeof app): string {
  return join(electronApp.getAppPath(), TRAY_ICON_PNG_RELATIVE_PATH)
}

export function createTrayIconImage(electronApp: typeof app): NativeImage {
  return nativeImage.createFromPath(resolveTrayIconPath(electronApp))
}

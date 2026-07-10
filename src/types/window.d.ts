import type { OmniPawBridge } from '@shared/types/bridge'

export interface OmniPawDebugApi {
  showFirstLaunchGuide(): void
  hideFirstLaunchGuide(): void
  isFirstLaunchGuideForced(): boolean
}

declare global {
  interface Window {
    omniPaw?: OmniPawBridge
    omniPawDebug?: OmniPawDebugApi
  }
}

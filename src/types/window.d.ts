import type { RendererOmniPawBridge } from '@/bridge/app'

export interface OmniPawDebugApi {
  showFirstLaunchGuide(): void
  hideFirstLaunchGuide(): void
  isFirstLaunchGuideForced(): boolean
}

declare global {
  interface Window {
    omniPaw?: RendererOmniPawBridge
    omniPawDebug?: OmniPawDebugApi
  }
}

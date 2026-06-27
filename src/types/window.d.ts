import type { RendererOmniPawBridge } from '@/bridge/app'

declare global {
  interface Window {
    omniPaw?: RendererOmniPawBridge
  }
}

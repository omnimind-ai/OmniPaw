import type { RendererOpenOmniClawBridge } from '@/bridge/app'

declare global {
  interface Window {
    openOmniClaw?: RendererOpenOmniClawBridge
  }
}

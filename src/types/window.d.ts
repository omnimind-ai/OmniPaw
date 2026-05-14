import type { OpenOmniClawBridge } from '@shared/types/bridge'

declare global {
  interface Window {
    openOmniClaw: OpenOmniClawBridge
  }
}

export {}

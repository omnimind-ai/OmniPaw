import type { BridgeDesktopSettingsConfig } from '@/bridge/app'

export type CompanionRole = BridgeDesktopSettingsConfig['app']['companionRoles'][number]

export type CompanionRolePromptTone = 'blue' | 'violet' | 'slate' | 'teal' | 'amber'

export interface CompanionRolePromptSegment {
  id: string
  owner: string
  text: string
  tone: CompanionRolePromptTone
  estimatedTokens: number
}

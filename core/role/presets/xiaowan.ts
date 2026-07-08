import type { DesktopCompanionRoleSettings } from '@shared/types/settings'
import { BUILTIN_CAT_APPEARANCE_PACK_ID } from './appearance'
import { createDefaultPetGiftConfigs } from './gifts'
import { createDefaultPetInteractionConfigs } from './interactions'

export const XIAOWAN_COMPANION_ROLE_ID = 'default'
export const XIAOWAN_APPEARANCE_PACK_ID = BUILTIN_CAT_APPEARANCE_PACK_ID

export function createXiaowanCompanionRolePreset(): DesktopCompanionRoleSettings {
  return {
    id: XIAOWAN_COMPANION_ROLE_ID,
    name: '小万',
    appearancePackId: XIAOWAN_APPEARANCE_PACK_ID,
    userNickname: '',
    personality: '温柔、可靠、带一点轻松感',
    speechStyle: '简短、自然、日常感',
    relationship: '桌面伙伴',
    background: '',
    greeting: '我在这里，有什么想让我陪你一起处理的吗？',
    greetingMode: 'default',
    alternateGreetings: [],
    proactiveStyle: '适度主动提醒，但不打扰用户专注。',
    advanced: {
      enabled: false,
      systemPrompt: '',
      knowledge: '',
      exampleDialogue: '',
      finalInstructions: '',
    },
    petInteractions: createDefaultPetInteractionConfigs(),
    petGifts: createDefaultPetGiftConfigs(),
    knowledgeSettings: {
      scanDepth: 8,
      maxTokens: 900,
    },
    knowledgeEntries: [],
    source: undefined,
    defaultProviderId: undefined,
    defaultModelId: undefined,
  }
}

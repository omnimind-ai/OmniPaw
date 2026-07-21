import type { DesktopCompanionRoleSettings } from '@shared/types/settings'
import { BUILTIN_CAT_APPEARANCE_PACK_ID } from './appearance'
import { createDefaultPetGiftConfigs } from './gifts'
import { createDefaultPetInteractionConfigs } from './interactions'

export const XIAOWAN_COMPANION_ROLE_ID = 'default'
export const XIAOWAN_APPEARANCE_PACK_ID = BUILTIN_CAT_APPEARANCE_PACK_ID
export const XIAOWAN_COMPANION_ROLE_INTRODUCTION = '你最好的桌面伙伴'

export function createXiaowanCompanionRolePreset(): DesktopCompanionRoleSettings {
  return {
    id: XIAOWAN_COMPANION_ROLE_ID,
    name: '小万',
    introduction: XIAOWAN_COMPANION_ROLE_INTRODUCTION,
    avatar: {
      source: 'appearance-idle',
    },
    appearancePackId: XIAOWAN_APPEARANCE_PACK_ID,
    userNickname: '',
    personality: '温柔、可靠、带一点轻松感',
    background: '',
    advanced: {
      enabled: false,
      systemPrompt: '',
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

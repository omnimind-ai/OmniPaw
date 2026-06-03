import type { TavernLorebookEntryDraft } from '@shared/types/tavern'

export interface TavernCharacterDraftState {
  name: string
  description: string
  personality: string
  scenario: string
  systemPrompt: string
  postHistoryInstructions: string
  firstMessage: string
  alternateGreetingsText: string
  messageExamplesText: string
  tagsText: string
  enabled: boolean
}

export interface TavernLorebookDraftState {
  name: string
  description: string
  enabled: boolean
  entries: TavernLorebookEntryDraft[]
}

export interface TavernPromptPresetDraftState {
  name: string
  description: string
  enabled: boolean
  mainPrompt: string
  mainEnabled: boolean
  finalPrompt: string
  finalEnabled: boolean
}

export interface TavernUserProfileDraftState {
  name: string
  description: string
  enabled: boolean
  copyPersonaId: string
}

import type { CatPetAction, CatPetInteractionEffect, CatPetMood } from '@shared/types/cat-pet'

export type PetInteractionIntensity = 'soft' | 'active' | 'deep'

export interface PetInteractionTemplate {
  intensity: PetInteractionIntensity
  customizable: boolean
  positive: CatPetInteractionEffect
  negative: CatPetInteractionEffect
  positiveProbability: number
}

export const CAT_PET_INTERACTION_TEMPLATES: Record<CatPetAction, PetInteractionTemplate> = {
  pat: {
    intensity: 'soft',
    customizable: false,
    positive: { affection: 1, mood: 8 },
    negative: { affection: 0, mood: -3 },
    positiveProbability: 0.92,
  },
  tease: {
    intensity: 'active',
    customizable: false,
    positive: { affection: 3, mood: 10 },
    negative: { affection: -2, mood: -12 },
    positiveProbability: 0.68,
  },
  custom_100: {
    intensity: 'active',
    customizable: true,
    positive: { affection: 5, mood: 13 },
    negative: { affection: -2, mood: -14 },
    positiveProbability: 0.64,
  },
  custom_150: {
    intensity: 'deep',
    customizable: true,
    positive: { affection: 9, mood: 18 },
    negative: { affection: -5, mood: -25 },
    positiveProbability: 0.48,
  },
}

export const CAT_PET_MOOD_TEXT: Record<CatPetMood, string> = {
  angry: '有点生气',
  sad: '伤心',
  down: '失落',
  normal: '平静',
  happy: '开心',
  attached: '很亲近',
}

export const PET_CHAT_RUNTIME_INSTRUCTION = {
  opening: '桌宠养成状态会轻微影响你的回复方式，但不要机械复述数值，除非用户主动询问。',
  style:
    '回复时保持当前角色设定：心情低落时可以更柔软、委屈或别扭一点；心情好时可以更轻快亲近；不要夸张表演，不要责备用户。',
  interaction: '如果用户进行了桌宠互动或提到陪伴状态，可以自然承接互动带来的情绪变化。',
} as const

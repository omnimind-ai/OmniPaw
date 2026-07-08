export type {
  CatPetAction as PresetCatPetAction,
  CatPetCustomAction as PresetCatPetCustomAction,
  CatPetInteractionConfig as PresetCatPetInteractionConfig,
} from '@shared/types/cat-pet'
export {
  CAT_PET_ACTIONS,
  CAT_PET_CUSTOM_ACTIONS,
  CAT_PET_DAILY_LIMITS,
  CAT_PET_UNLOCK_AFFECTION,
  defaultCatPetInteractionConfigs as createDefaultPetInteractionConfigs,
  isCatPetAction as isPresetCatPetAction,
  isCatPetCustomAction as isPresetCatPetCustomAction,
  normalizeCatPetInteractionConfigs as normalizePetInteractionConfigs,
} from '@shared/types/cat-pet'

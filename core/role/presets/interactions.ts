export type {
  CatPetAction as PresetCatPetAction,
  CatPetCustomAction as PresetCatPetCustomAction,
  CatPetGiftConfig as PresetCatPetGiftConfig,
  CatPetInteractionConfig as PresetCatPetInteractionConfig,
} from '@shared/types/cat-pet'
export {
  CAT_PET_ACTIONS,
  CAT_PET_CUSTOM_ACTIONS,
  CAT_PET_DAILY_LIMITS,
  CAT_PET_UNLOCK_AFFECTION,
  defaultCatPetGiftConfigs as createDefaultPetGiftConfigs,
  defaultCatPetInteractionConfigs as createDefaultPetInteractionConfigs,
  isCatPetAction as isPresetCatPetAction,
  isCatPetCustomAction as isPresetCatPetCustomAction,
  normalizeCatPetGiftConfigs as normalizePetGiftConfigs,
  normalizeCatPetInteractionConfigs as normalizePetInteractionConfigs,
} from '@shared/types/cat-pet'

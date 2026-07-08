import {
  type CatPetGiftConfig,
  type CatPetGiftImage,
  defaultCatPetGiftConfigs,
  normalizeCatPetGiftConfigs,
} from '@shared/types/cat-pet'

export const CAT_PET_GIFT_PRESET_IMAGE_PATHS = {
  gift_100: 'presets/gifts/paw-print-sticker.png',
  gift_200: 'presets/gifts/warm-bell.png',
  gift_300: 'presets/gifts/star-pendant.png',
} as const satisfies Record<'gift_100' | 'gift_200' | 'gift_300', string>

export type PresetCatPetGiftConfig = CatPetGiftConfig

export function createDefaultPetGiftConfigs(): CatPetGiftConfig[] {
  return withPresetGiftImages(defaultCatPetGiftConfigs())
}

export function normalizePetGiftConfigs(input: unknown): CatPetGiftConfig[] {
  return withPresetGiftImages(normalizeCatPetGiftConfigs(input))
}

function withPresetGiftImages(gifts: readonly CatPetGiftConfig[]): CatPetGiftConfig[] {
  return gifts.map((gift) => ({
    ...gift,
    image: gift.image ? { ...gift.image } : presetGiftImage(gift.id),
    storyLines: [...gift.storyLines],
  }))
}

function presetGiftImage(giftId: string): CatPetGiftImage | undefined {
  const packagePath =
    CAT_PET_GIFT_PRESET_IMAGE_PATHS[giftId as keyof typeof CAT_PET_GIFT_PRESET_IMAGE_PATHS]
  if (!packagePath) {
    return undefined
  }

  return {
    packagePath,
    mimeType: 'image/png',
    fileName: packagePath.split('/').at(-1) ?? `${giftId}.png`,
  }
}

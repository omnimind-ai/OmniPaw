import type { CatPetGiftImage } from '@shared/types/cat-pet'
import pawPrintStickerUrl from '@/asserts/cat/gifts/paw-print-sticker.png'
import starPendantUrl from '@/asserts/cat/gifts/star-pendant.png'
import warmBellUrl from '@/asserts/cat/gifts/warm-bell.png'
import collarNameplateUrl from '@/asserts/dog/gifts/collar-nameplate.png'
import crystalBoneUrl from '@/asserts/dog/gifts/crystal-bone.png'
import squeakyBallUrl from '@/asserts/dog/gifts/squeaky-ball.png'

const builtinGiftImageByPackagePath: Record<string, string> = {
  'presets/gifts/paw-print-sticker.png': pawPrintStickerUrl,
  'presets/gifts/warm-bell.png': warmBellUrl,
  'presets/gifts/star-pendant.png': starPendantUrl,
  'presets/dog/gifts/squeaky-ball.png': squeakyBallUrl,
  'presets/dog/gifts/collar-nameplate.png': collarNameplateUrl,
  'presets/dog/gifts/crystal-bone.png': crystalBoneUrl,
}

const builtinGiftImageByGiftId: Record<string, string> = {
  gift_100: pawPrintStickerUrl,
  gift_200: warmBellUrl,
  gift_300: starPendantUrl,
}

export function catPetGiftImageSrc(image: CatPetGiftImage | undefined, giftId?: string): string {
  const dataUrl = image?.dataUrl?.trim()
  if (dataUrl) {
    return dataUrl
  }

  const packagePath = image?.packagePath?.trim()
  if (packagePath) {
    return builtinGiftImageByPackagePath[packagePath] ?? ''
  }

  return giftId ? (builtinGiftImageByGiftId[giftId] ?? '') : ''
}

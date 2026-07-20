import { BUILTIN_CAT_APPEARANCE_PACK_ID, BUILTIN_DOG_APPEARANCE_PACK_ID } from '@shared/constants'
import type { CatAppearanceAssetKey } from '@shared/types/cat-appearance'

import catDoingImage from '@/asserts/cat/anim_cat_doing_task.webp'
import catDraggedImage from '@/asserts/cat/anim_cat_dragging.webp'
import catEndDoingImage from '@/asserts/cat/anim_cat_end_doing.webp'
import catFinishImage from '@/asserts/cat/anim_cat_finish.webp'
import catShowImage from '@/asserts/cat/anim_cat_show.webp'
import catStartDoingImage from '@/asserts/cat/anim_cat_start_doing.webp'
import catDoingFallbackImage from '@/asserts/cat/ic_cat_doing_task.png'
import catShowFallbackImage from '@/asserts/cat/ic_cat_first_show.png'
import catIdleImage from '@/asserts/cat/ic_cat_normal.png'
import catDraggedFallbackImage from '@/asserts/cat/ic_cat_normal_dragging.png'
import dogDoingImage from '@/asserts/dog/anim_dog_doing_task.webp'
import dogDraggedImage from '@/asserts/dog/anim_dog_dragging.webp'
import dogEndDoingImage from '@/asserts/dog/anim_dog_end_doing.webp'
import dogFinishImage from '@/asserts/dog/anim_dog_finish.webp'
import dogIdleImage from '@/asserts/dog/anim_dog_idle.webp'
import dogShowImage from '@/asserts/dog/anim_dog_show.webp'
import dogStartDoingImage from '@/asserts/dog/anim_dog_start_doing.webp'
import dogStartDraggingImage from '@/asserts/dog/anim_dog_start_dragging.webp'
import dogDoingFallbackImage from '@/asserts/dog/ic_dog_doing_task.png'
import dogShowFallbackImage from '@/asserts/dog/ic_dog_first_show.png'
import dogIdleFallbackImage from '@/asserts/dog/ic_dog_normal.png'
import dogDraggedFallbackImage from '@/asserts/dog/ic_dog_normal_dragging.png'

export const BUILTIN_PET_APPEARANCE_ASSETS = {
  [BUILTIN_CAT_APPEARANCE_PACK_ID]: {
    show: catShowImage,
    showFallback: catShowFallbackImage,
    idle: catIdleImage,
    drag: catDraggedImage,
    dragFallback: catDraggedFallbackImage,
    startDoing: catStartDoingImage,
    doing: catDoingImage,
    doingFallback: catDoingFallbackImage,
    endDoing: catEndDoingImage,
    finish: catFinishImage,
  },
  [BUILTIN_DOG_APPEARANCE_PACK_ID]: {
    show: dogShowImage,
    showFallback: dogShowFallbackImage,
    idle: dogIdleImage,
    dragTransition: dogStartDraggingImage,
    drag: dogDraggedImage,
    dragFallback: dogDraggedFallbackImage,
    startDoing: dogStartDoingImage,
    doing: dogDoingImage,
    doingFallback: dogDoingFallbackImage,
    endDoing: dogEndDoingImage,
    finish: dogFinishImage,
  },
} as const satisfies Record<string, Partial<Record<CatAppearanceAssetKey, string>>>

export const BUILTIN_PET_IDLE_IMAGE_BY_PACK_ID: Record<string, string> = {
  [BUILTIN_CAT_APPEARANCE_PACK_ID]: catIdleImage,
  [BUILTIN_DOG_APPEARANCE_PACK_ID]: dogIdleFallbackImage,
}

export function builtinPetAppearanceAssets(
  packId: string
): Partial<Record<CatAppearanceAssetKey, string>> | undefined {
  return BUILTIN_PET_APPEARANCE_ASSETS[packId as keyof typeof BUILTIN_PET_APPEARANCE_ASSETS]
}

export function builtinPetAppearanceIdleImage(packId: string): string | undefined {
  return BUILTIN_PET_IDLE_IMAGE_BY_PACK_ID[packId]
}

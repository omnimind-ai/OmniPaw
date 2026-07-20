import { BUILTIN_CAT_APPEARANCE_PACK_ID } from '@shared/constants'
import type { CatAppearanceResolvedPack } from '@shared/types/cat-appearance'
import { type MaybeRefOrGetter, onBeforeUnmount, onMounted, shallowRef, toValue, watch } from 'vue'

import { appBridge, type BridgeUnsubscribe } from '@/bridge/app'
import {
  BUILTIN_PET_IDLE_IMAGE_BY_PACK_ID,
  builtinPetAppearanceIdleImage,
} from '@/utils/builtin-pet-appearance-assets'

export function useCompanionRoleIdleImages(appearancePackIds: MaybeRefOrGetter<readonly string[]>) {
  const idleImageByPackId = shallowRef<Record<string, string>>({
    ...BUILTIN_PET_IDLE_IMAGE_BY_PACK_ID,
  })
  let appearanceUnsubscribe: BridgeUnsubscribe | undefined
  let idleImageRequestId = 0

  watch(
    () => normalizePackIds(toValue(appearancePackIds)),
    () => void loadIdleImages(),
    { immediate: true }
  )

  onMounted(() => {
    appearanceUnsubscribe = appBridge.catAppearance.onChanged(() => {
      void loadIdleImages()
    })
  })

  onBeforeUnmount(() => {
    idleImageRequestId += 1
    appearanceUnsubscribe?.()
    appearanceUnsubscribe = undefined
  })

  async function loadIdleImages(): Promise<void> {
    const requestId = idleImageRequestId + 1
    idleImageRequestId = requestId
    const packIds = normalizePackIds(toValue(appearancePackIds))
    const entries = await Promise.all(
      packIds.map(async (packId) => {
        try {
          const pack = await appBridge.catAppearance.getPack({ packId })
          return [packId, resolveIdleImage(pack)] as const
        } catch {
          return [
            packId,
            builtinPetAppearanceIdleImage(packId) ??
              BUILTIN_PET_IDLE_IMAGE_BY_PACK_ID[BUILTIN_CAT_APPEARANCE_PACK_ID],
          ] as const
        }
      })
    )
    if (idleImageRequestId !== requestId) return
    idleImageByPackId.value = Object.fromEntries(entries)
  }

  return {
    idleImageByPackId,
    reloadIdleImages: loadIdleImages,
  }
}

function normalizePackIds(packIds: readonly string[]): string[] {
  return [
    ...new Set([
      BUILTIN_CAT_APPEARANCE_PACK_ID,
      ...packIds.map((packId) => packId.trim() || BUILTIN_CAT_APPEARANCE_PACK_ID),
    ]),
  ].sort()
}

function resolveIdleImage(pack: CatAppearanceResolvedPack): string {
  const fallbackIdleImage =
    builtinPetAppearanceIdleImage(pack.id) ??
    BUILTIN_PET_IDLE_IMAGE_BY_PACK_ID[BUILTIN_CAT_APPEARANCE_PACK_ID]
  if (pack.source === 'builtin') return fallbackIdleImage
  return pack.assets.idle || fallbackIdleImage
}

import type { CatAppearanceResolvedPack } from '@shared/types/cat-appearance'
import { type MaybeRefOrGetter, onBeforeUnmount, onMounted, shallowRef, toValue, watch } from 'vue'

import builtinIdleImage from '@/asserts/cat/ic_cat_normal.png'
import { appBridge, type BridgeUnsubscribe } from '@/bridge/app'

export function useCompanionRoleIdleImages(appearancePackIds: MaybeRefOrGetter<readonly string[]>) {
  const idleImageByPackId = shallowRef<Record<string, string>>({ builtin: builtinIdleImage })
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
          return [packId, builtinIdleImage] as const
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
  return [...new Set(['builtin', ...packIds.map((packId) => packId.trim() || 'builtin')])].sort()
}

function resolveIdleImage(pack: CatAppearanceResolvedPack): string {
  if (pack.source === 'builtin') return builtinIdleImage
  return pack.assets.idle || builtinIdleImage
}

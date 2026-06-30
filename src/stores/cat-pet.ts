import type {
  CatPetAction,
  CatPetChangedEvent,
  CatPetMood,
  CatPetPerformResponse,
  CatPetRecentInteraction,
  CatPetState,
} from '@shared/types/cat-pet'
import {
  CAT_PET_AFFECTION_DEFAULT,
  CAT_PET_AFFECTION_MAX,
  CAT_PET_AFFECTION_MIN,
  CAT_PET_DAILY_LIMITS,
  moodFromAffection,
} from '@shared/types/cat-pet'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { appBridge, type BridgeUnsubscribe } from '@/bridge/app'

function fallbackState(): CatPetState {
  return {
    affection: CAT_PET_AFFECTION_DEFAULT,
    affectionMax: CAT_PET_AFFECTION_MAX,
    affectionMin: CAT_PET_AFFECTION_MIN,
    mood: moodFromAffection(CAT_PET_AFFECTION_DEFAULT),
    todayUsage: { pat: 0, tease: 0 },
    limits: { pat: CAT_PET_DAILY_LIMITS.pat, tease: CAT_PET_DAILY_LIMITS.tease },
  }
}

export const useCatPetStore = defineStore('catPet', () => {
  const state = ref<CatPetState>(fallbackState())
  const loading = ref(false)
  const performing = ref(false)
  const error = ref<unknown>(null)
  let loadPromise: Promise<CatPetState> | undefined
  let unsubscribe: BridgeUnsubscribe | undefined

  const affection = computed(() => state.value.affection)
  const affectionMax = computed(() => state.value.affectionMax)
  const affectionMin = computed(() => state.value.affectionMin)
  const mood = computed<CatPetMood>(() => state.value.mood)
  const todayUsage = computed(() => state.value.todayUsage)
  const limits = computed(() => state.value.limits)
  const recent = computed<CatPetRecentInteraction | undefined>(() => state.value.recent)

  const progressPercent = computed(() => {
    const range = affectionMax.value - affectionMin.value
    if (range <= 0) return 0
    const normalized = (affection.value - affectionMin.value) / range
    return Math.max(0, Math.min(1, normalized)) * 100
  })

  const remainingPat = computed(() => Math.max(0, limits.value.pat - todayUsage.value.pat))
  const remainingTease = computed(() => Math.max(0, limits.value.tease - todayUsage.value.tease))
  const canPat = computed(() => remainingPat.value > 0)
  const canTease = computed(() => remainingTease.value > 0)

  async function load(force = false): Promise<CatPetState> {
    if (!force && loadPromise) return loadPromise
    if (!appBridge.catPet) {
      state.value = fallbackState()
      return state.value
    }
    loading.value = true
    error.value = null
    loadPromise = (async () => {
      try {
        const next = await appBridge.catPet!.getState()
        state.value = next
        subscribe()
        return next
      } catch (err) {
        error.value = err
        throw err
      } finally {
        loading.value = false
        loadPromise = undefined
      }
    })()
    return loadPromise
  }

  async function perform(action: CatPetAction): Promise<CatPetPerformResponse> {
    if (!appBridge.catPet) {
      return { ok: false, reason: 'daily_limit', state: state.value }
    }
    performing.value = true
    error.value = null
    try {
      const response = await appBridge.catPet.perform({ action })
      state.value = response.state
      return response
    } catch (err) {
      error.value = err
      throw err
    } finally {
      performing.value = false
    }
  }

  function subscribe(): void {
    if (unsubscribe || !appBridge.catPet) return
    unsubscribe = appBridge.catPet.onChanged((event: CatPetChangedEvent) => {
      state.value = event.state
    })
  }

  function dispose(): void {
    unsubscribe?.()
    unsubscribe = undefined
  }

  return {
    state,
    loading,
    performing,
    error,
    affection,
    affectionMax,
    affectionMin,
    mood,
    todayUsage,
    limits,
    recent,
    progressPercent,
    remainingPat,
    remainingTease,
    canPat,
    canTease,
    load,
    perform,
    dispose,
  }
})

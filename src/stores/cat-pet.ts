import type {
  CatPetAction,
  CatPetActionCounters,
  CatPetChangedEvent,
  CatPetCustomInteractionConfig,
  CatPetMood,
  CatPetPerformResponse,
  CatPetRecentInteraction,
  CatPetState,
  CatPetUpdateInteractionsResponse,
} from '@shared/types/cat-pet'
import {
  CAT_PET_ACTIONS,
  CAT_PET_AFFECTION_DEFAULT,
  CAT_PET_AFFECTION_MAX,
  CAT_PET_AFFECTION_MIN,
  CAT_PET_CUSTOM_ACTIONS,
  CAT_PET_DAILY_LIMITS,
  CAT_PET_MOOD_DEFAULT,
  CAT_PET_MOOD_MAX,
  CAT_PET_MOOD_MIN,
  emptyCatPetActionCounters,
  moodFromScore,
} from '@shared/types/cat-pet'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { appBridge, type BridgeUnsubscribe } from '@/bridge/app'

function fallbackState(): CatPetState {
  const moodScore = CAT_PET_MOOD_DEFAULT
  return {
    affection: CAT_PET_AFFECTION_DEFAULT,
    affectionMax: CAT_PET_AFFECTION_MAX,
    affectionMin: CAT_PET_AFFECTION_MIN,
    mood: moodFromScore(moodScore, CAT_PET_AFFECTION_DEFAULT),
    moodScore,
    moodMax: CAT_PET_MOOD_MAX,
    moodMin: CAT_PET_MOOD_MIN,
    todayUsage: emptyCatPetActionCounters(),
    limits: { ...CAT_PET_DAILY_LIMITS },
    interactions: CAT_PET_ACTIONS.map((id) => ({
      id,
      risk:
        id === 'custom_high' ? 'high' : id === 'tease' || id === 'custom_medium' ? 'medium' : 'low',
      enabled: true,
      customizable: id.startsWith('custom_'),
      dailyLimit: CAT_PET_DAILY_LIMITS[id],
      positive: { affection: 1, mood: 4 },
      negative: { affection: 0, mood: -2 },
      positiveProbability: 0.8,
    })),
    customInteractions: CAT_PET_CUSTOM_ACTIONS.map((id) => ({ id, enabled: true })),
    launchCount: 0,
  }
}

export const useCatPetStore = defineStore('catPet', () => {
  const state = ref<CatPetState>(fallbackState())
  const loading = ref(false)
  const performing = ref(false)
  const savingInteractions = ref(false)
  const error = ref<unknown>(null)
  let loadPromise: Promise<CatPetState> | undefined
  let unsubscribe: BridgeUnsubscribe | undefined

  const affection = computed(() => state.value.affection)
  const affectionMax = computed(() => state.value.affectionMax)
  const affectionMin = computed(() => state.value.affectionMin)
  const mood = computed<CatPetMood>(() => state.value.mood)
  const moodScore = computed(() => state.value.moodScore)
  const moodMax = computed(() => state.value.moodMax)
  const moodMin = computed(() => state.value.moodMin)
  const todayUsage = computed(() => state.value.todayUsage)
  const limits = computed(() => state.value.limits)
  const interactions = computed(() => state.value.interactions)
  const customInteractions = computed(() => state.value.customInteractions)
  const recent = computed<CatPetRecentInteraction | undefined>(() => state.value.recent)

  const progressPercent = computed(() => {
    const range = affectionMax.value - affectionMin.value
    if (range <= 0) return 0
    const normalized = (affection.value - affectionMin.value) / range
    return Math.max(0, Math.min(1, normalized)) * 100
  })

  const moodPercent = computed(() => {
    const range = moodMax.value - moodMin.value
    if (range <= 0) return 50
    const normalized = (moodScore.value - moodMin.value) / range
    return Math.max(0, Math.min(1, normalized)) * 100
  })

  const remainingByAction = computed<CatPetActionCounters>(() => {
    const remaining = emptyCatPetActionCounters()
    for (const action of CAT_PET_ACTIONS) {
      remaining[action] = Math.max(0, (limits.value[action] ?? 0) - (todayUsage.value[action] ?? 0))
    }
    return remaining
  })

  const remainingPat = computed(() => remainingByAction.value.pat)
  const remainingTease = computed(() => remainingByAction.value.tease)
  const canPat = computed(() => canPerform('pat'))
  const canTease = computed(() => canPerform('tease'))

  async function load(force = false): Promise<CatPetState> {
    if (!force && loadPromise) return loadPromise
    const catPetBridge = appBridge.catPet
    if (!catPetBridge) {
      state.value = fallbackState()
      return state.value
    }
    loading.value = true
    error.value = null
    loadPromise = (async () => {
      try {
        const next = await catPetBridge.getState()
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

  async function updateInteractions(
    customInteractionsInput: CatPetCustomInteractionConfig[]
  ): Promise<CatPetUpdateInteractionsResponse> {
    if (!appBridge.catPet?.updateInteractions) {
      throw new Error('Cat pet interaction settings are not available.')
    }
    savingInteractions.value = true
    error.value = null
    try {
      const response = await appBridge.catPet.updateInteractions({
        customInteractions: customInteractionsInput,
      })
      state.value = response.state
      return response
    } catch (err) {
      error.value = err
      throw err
    } finally {
      savingInteractions.value = false
    }
  }

  function canPerform(action: CatPetAction): boolean {
    const definition = interactions.value.find((item) => item.id === action)
    return Boolean(definition?.enabled && remainingByAction.value[action] > 0)
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
    savingInteractions,
    error,
    affection,
    affectionMax,
    affectionMin,
    mood,
    moodScore,
    moodMax,
    moodMin,
    todayUsage,
    limits,
    interactions,
    customInteractions,
    recent,
    progressPercent,
    moodPercent,
    remainingByAction,
    remainingPat,
    remainingTease,
    canPat,
    canTease,
    canPerform,
    load,
    perform,
    updateInteractions,
    dispose,
  }
})

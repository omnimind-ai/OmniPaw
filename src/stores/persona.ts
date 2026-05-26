import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  appBridge,
  type BridgeCreatePersonaRequest,
  type BridgeDeletePersonaRequest,
  type BridgePersonaProfile,
  type BridgePersonaProfileDraft,
  type BridgePersonaRegistry,
  type BridgePersonaRegistryChangedEvent,
  type BridgePersonaRegistryStatus,
  type BridgeSetDefaultPersonaRequest,
  type BridgeUnsubscribe,
  type BridgeUpdatePersonaRequest,
  ensureElectronBridge,
  isFallbackBridge,
} from '@/bridge/app'

export const usePersonaStore = defineStore('persona', () => {
  const registry = ref<BridgePersonaRegistry | null>(null)
  const status = ref<BridgePersonaRegistryStatus | null>(null)
  const loading = ref(false)
  const saving = ref(false)
  const error = ref<unknown>(null)
  let unsubscribe: BridgeUnsubscribe | undefined
  let loadPromise: Promise<BridgePersonaRegistry> | undefined

  const persistenceAvailable = computed(() => !isFallbackBridge)
  const profiles = computed<BridgePersonaProfile[]>(() => registry.value?.profiles ?? [])
  const activePersonaId = computed(() => registry.value?.defaultPersonaId)
  const activePersona = computed(() =>
    activePersonaId.value
      ? (profiles.value.find((profile) => profile.id === activePersonaId.value) ?? null)
      : null
  )
  const recoverable = computed(() => status.value?.recoverable ?? false)
  const recoveryError = computed(() => status.value?.error)
  const isEmpty = computed(() => profiles.value.length === 0)

  async function load(): Promise<BridgePersonaRegistry> {
    if (loadPromise) return loadPromise
    if (!appBridge.persona) {
      registry.value = emptyRegistry()
      return registry.value
    }

    loading.value = true
    error.value = null
    loadPromise = (async () => {
      const response = await appBridge.persona!.load()
      registry.value = response.registry
      status.value = response.status
      subscribeToChanges()
      return response.registry
    })()

    try {
      return await loadPromise
    } catch (err) {
      error.value = normalizeError(err)
      throw err
    } finally {
      loadPromise = undefined
      loading.value = false
    }
  }

  async function refreshStatus(): Promise<void> {
    if (!appBridge.persona?.status) return
    try {
      status.value = await appBridge.persona.status()
    } catch (err) {
      error.value = normalizeError(err)
    }
  }

  async function createProfile(draft: BridgePersonaProfileDraft): Promise<BridgePersonaProfile> {
    return runMutation((bridge) =>
      bridge.create({ profile: draft } as BridgeCreatePersonaRequest)
    ).then((result) => {
      if (!result.profile) {
        throw new Error('Persona create did not return a profile.')
      }
      return result.profile
    })
  }

  async function updateProfile(
    id: string,
    draft: BridgePersonaProfileDraft
  ): Promise<BridgePersonaProfile> {
    return runMutation((bridge) =>
      bridge.update({ id, profile: draft } as BridgeUpdatePersonaRequest)
    ).then((result) => {
      if (!result.profile) {
        throw new Error('Persona update did not return a profile.')
      }
      return result.profile
    })
  }

  async function deleteProfile(id: string): Promise<void> {
    await runMutation((bridge) => bridge.delete({ id } as BridgeDeletePersonaRequest))
  }

  async function setActivePersona(id: string | undefined): Promise<void> {
    await runMutation((bridge) => bridge.setDefault({ id } as BridgeSetDefaultPersonaRequest))
  }

  function subscribeToChanges(): void {
    if (unsubscribe || !appBridge.persona?.onChanged) return
    unsubscribe = appBridge.persona.onChanged((event: BridgePersonaRegistryChangedEvent) => {
      registry.value = event.registry
      status.value = event.status
    })
  }

  function stopSubscription(): void {
    if (unsubscribe) {
      unsubscribe()
      unsubscribe = undefined
    }
  }

  async function runMutation<
    T extends {
      registry: BridgePersonaRegistry
      status: BridgePersonaRegistryStatus
      profile?: BridgePersonaProfile
    },
  >(fn: (bridge: NonNullable<typeof appBridge.persona>) => Promise<T>): Promise<T> {
    ensureElectronBridge('persona.mutation')
    if (!appBridge.persona) {
      throw new Error('Persona bridge unavailable.')
    }
    saving.value = true
    error.value = null
    try {
      const result = await fn(appBridge.persona)
      registry.value = result.registry
      status.value = result.status
      return result
    } catch (err) {
      error.value = normalizeError(err)
      throw err
    } finally {
      saving.value = false
    }
  }

  return {
    registry,
    status,
    profiles,
    activePersona,
    activePersonaId,
    persistenceAvailable,
    recoverable,
    recoveryError,
    isEmpty,
    loading,
    saving,
    error,
    load,
    refreshStatus,
    createProfile,
    updateProfile,
    deleteProfile,
    setActivePersona,
    stopSubscription,
  }
})

function emptyRegistry(): BridgePersonaRegistry {
  return {
    version: 1,
    profiles: [],
    defaultPersonaId: undefined,
    updatedAt: 0,
  }
}

function normalizeError(value: unknown): Error {
  if (value instanceof Error) return value
  if (typeof value === 'string') return new Error(value)
  return new Error('Persona operation failed.')
}

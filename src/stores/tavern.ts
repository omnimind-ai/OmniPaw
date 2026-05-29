import type {
  CreateTavernCharacterRequest,
  CreateTavernLorebookRequest,
  CreateTavernSessionRequest,
  DeleteTavernCharacterRequest,
  DeleteTavernLorebookRequest,
  ExportTavernCharacterPersonaRequest,
  ImportTavernCharacterRequest,
  ImportTavernCharacterResult,
  SetTavernCharacterEnabledRequest,
  SetTavernLorebookEnabledRequest,
  TavernCharacter,
  TavernLorebook,
  TavernRegistry,
  TavernRegistryChangedEvent,
  TavernRegistryLoadResponse,
  TavernRegistryMutationResult,
  TavernRegistryStatus,
  TavernSessionOperationResult,
  UpdateTavernCharacterRequest,
  UpdateTavernLorebookRequest,
  UpdateTavernSessionBindingRequest,
} from '@shared/types/tavern'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  appBridge,
  type BridgeUnsubscribe,
  ensureElectronBridge,
  isFallbackBridge,
} from '@/bridge/app'

export const useTavernStore = defineStore('tavern', () => {
  const registry = ref<TavernRegistry>(emptyRegistry())
  const status = ref<TavernRegistryStatus | null>(null)
  const loading = ref(false)
  const saving = ref(false)
  const error = ref<unknown>(null)
  let unsubscribe: BridgeUnsubscribe | undefined
  let loadPromise: Promise<TavernRegistry> | undefined

  const persistenceAvailable = computed(() => !isFallbackBridge)
  const characters = computed<TavernCharacter[]>(() => registry.value.characters)
  const lorebooks = computed<TavernLorebook[]>(() => registry.value.lorebooks)
  const recoverable = computed(() => status.value?.recoverable ?? false)
  const recoveryError = computed(() => status.value?.error)
  const isEmpty = computed(() => characters.value.length === 0 && lorebooks.value.length === 0)

  async function load(): Promise<TavernRegistry> {
    if (loadPromise) return loadPromise
    if (!appBridge.tavern) {
      registry.value = emptyRegistry()
      return registry.value
    }

    loading.value = true
    error.value = null
    loadPromise = (async () => {
      const response = await appBridge.tavern!.load()
      applyLoadResponse(response)
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
    if (!appBridge.tavern?.status) return
    try {
      status.value = await appBridge.tavern.status()
    } catch (err) {
      error.value = normalizeError(err)
    }
  }

  async function importCharacter(
    request: ImportTavernCharacterRequest
  ): Promise<ImportTavernCharacterResult> {
    return runMutation((bridge) => bridge.importCharacter(request))
  }

  async function createCharacter(
    request: CreateTavernCharacterRequest
  ): Promise<TavernRegistryMutationResult> {
    return runMutation((bridge) => bridge.createCharacter(request))
  }

  async function updateCharacter(
    request: UpdateTavernCharacterRequest
  ): Promise<TavernRegistryMutationResult> {
    return runMutation((bridge) => bridge.updateCharacter(request))
  }

  async function deleteCharacter(id: string): Promise<TavernRegistryMutationResult> {
    return runMutation((bridge) => bridge.deleteCharacter({ id } as DeleteTavernCharacterRequest))
  }

  async function setCharacterEnabled(
    request: SetTavernCharacterEnabledRequest
  ): Promise<TavernRegistryMutationResult> {
    return runMutation((bridge) => bridge.setCharacterEnabled(request))
  }

  async function createLorebook(
    request: CreateTavernLorebookRequest
  ): Promise<TavernRegistryMutationResult> {
    return runMutation((bridge) => bridge.createLorebook(request))
  }

  async function updateLorebook(
    request: UpdateTavernLorebookRequest
  ): Promise<TavernRegistryMutationResult> {
    return runMutation((bridge) => bridge.updateLorebook(request))
  }

  async function deleteLorebook(id: string): Promise<TavernRegistryMutationResult> {
    return runMutation((bridge) => bridge.deleteLorebook({ id } as DeleteTavernLorebookRequest))
  }

  async function setLorebookEnabled(
    request: SetTavernLorebookEnabledRequest
  ): Promise<TavernRegistryMutationResult> {
    return runMutation((bridge) => bridge.setLorebookEnabled(request))
  }

  async function exportCharacterAsPersona(
    request: ExportTavernCharacterPersonaRequest
  ): Promise<TavernRegistryMutationResult> {
    return runMutation((bridge) => bridge.exportCharacterAsPersona(request))
  }

  async function createSession(
    request: CreateTavernSessionRequest
  ): Promise<TavernSessionOperationResult> {
    return runMutation((bridge) => bridge.createSession(request))
  }

  async function updateSessionBinding(
    request: UpdateTavernSessionBindingRequest
  ): Promise<TavernSessionOperationResult> {
    return runMutation((bridge) => bridge.updateSessionBinding(request))
  }

  function characterById(id: string | undefined): TavernCharacter | undefined {
    return id ? characters.value.find((character) => character.id === id) : undefined
  }

  function lorebookById(id: string | undefined): TavernLorebook | undefined {
    return id ? lorebooks.value.find((lorebook) => lorebook.id === id) : undefined
  }

  function subscribeToChanges(): void {
    if (unsubscribe || !appBridge.tavern?.onChanged) return
    unsubscribe = appBridge.tavern.onChanged((event: TavernRegistryChangedEvent) => {
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
      registry: TavernRegistry
      status: TavernRegistryStatus
    },
  >(fn: (bridge: NonNullable<typeof appBridge.tavern>) => Promise<T>): Promise<T> {
    ensureElectronBridge('tavern.mutation')
    if (!appBridge.tavern) {
      throw new Error('Tavern bridge unavailable.')
    }
    saving.value = true
    error.value = null
    try {
      const result = await fn(appBridge.tavern)
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

  function applyLoadResponse(response: TavernRegistryLoadResponse): void {
    registry.value = response.registry
    status.value = response.status
  }

  return {
    registry,
    status,
    characters,
    lorebooks,
    persistenceAvailable,
    recoverable,
    recoveryError,
    isEmpty,
    loading,
    saving,
    error,
    load,
    refreshStatus,
    importCharacter,
    createCharacter,
    updateCharacter,
    deleteCharacter,
    setCharacterEnabled,
    createLorebook,
    updateLorebook,
    deleteLorebook,
    setLorebookEnabled,
    exportCharacterAsPersona,
    createSession,
    updateSessionBinding,
    characterById,
    lorebookById,
    stopSubscription,
  }
})

function emptyRegistry(): TavernRegistry {
  return {
    version: 1,
    characters: [],
    lorebooks: [],
    updatedAt: 0,
  }
}

function normalizeError(value: unknown): Error {
  if (value instanceof Error) return value
  if (typeof value === 'string') return new Error(value)
  return new Error('Tavern operation failed.')
}

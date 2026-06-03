import type {
  CopyPersonaToTavernUserProfileRequest,
  CreateTavernCharacterRequest,
  CreateTavernLorebookRequest,
  CreateTavernPromptPresetRequest,
  CreateTavernSessionRequest,
  CreateTavernUserProfileRequest,
  DeleteTavernCharacterRequest,
  DeleteTavernLorebookRequest,
  DeleteTavernPromptPresetRequest,
  DeleteTavernUserProfileRequest,
  ExportTavernCharacterPersonaRequest,
  ImportTavernCharacterRequest,
  ImportTavernCharacterResult,
  SetTavernCharacterEnabledRequest,
  SetTavernLorebookEnabledRequest,
  SetTavernPromptPresetEnabledRequest,
  SetTavernUserProfileEnabledRequest,
  TavernCharacter,
  TavernLorebook,
  TavernPromptPreset,
  TavernPromptPreviewRequest,
  TavernPromptPreviewResult,
  TavernRegistry,
  TavernRegistryChangedEvent,
  TavernRegistryLoadResponse,
  TavernRegistryMutationResult,
  TavernRegistryStatus,
  TavernSessionOperationResult,
  TavernUserProfile,
  UpdateTavernCharacterRequest,
  UpdateTavernLorebookRequest,
  UpdateTavernPromptPresetRequest,
  UpdateTavernSessionBindingRequest,
  UpdateTavernUserProfileRequest,
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
  const promptPresets = computed<TavernPromptPreset[]>(() => registry.value.promptPresets)
  const userProfiles = computed<TavernUserProfile[]>(() => registry.value.userProfiles)
  const recoverable = computed(() => status.value?.recoverable ?? false)
  const recoveryError = computed(() => status.value?.error)
  const isEmpty = computed(
    () =>
      characters.value.length === 0 &&
      lorebooks.value.length === 0 &&
      promptPresets.value.length === 0 &&
      userProfiles.value.length === 0
  )

  async function load(): Promise<TavernRegistry> {
    if (loadPromise) return loadPromise
    const tavernBridge = appBridge.tavern
    if (!tavernBridge) {
      registry.value = emptyRegistry()
      return registry.value
    }

    loading.value = true
    error.value = null
    loadPromise = (async () => {
      const response = await tavernBridge.load()
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

  async function createPromptPreset(
    request: CreateTavernPromptPresetRequest
  ): Promise<TavernRegistryMutationResult> {
    return runMutation((bridge) => bridge.createPromptPreset(request))
  }

  async function updatePromptPreset(
    request: UpdateTavernPromptPresetRequest
  ): Promise<TavernRegistryMutationResult> {
    return runMutation((bridge) => bridge.updatePromptPreset(request))
  }

  async function deletePromptPreset(id: string): Promise<TavernRegistryMutationResult> {
    return runMutation((bridge) =>
      bridge.deletePromptPreset({ id } as DeleteTavernPromptPresetRequest)
    )
  }

  async function setPromptPresetEnabled(
    request: SetTavernPromptPresetEnabledRequest
  ): Promise<TavernRegistryMutationResult> {
    return runMutation((bridge) => bridge.setPromptPresetEnabled(request))
  }

  async function createUserProfile(
    request: CreateTavernUserProfileRequest
  ): Promise<TavernRegistryMutationResult> {
    return runMutation((bridge) => bridge.createUserProfile(request))
  }

  async function updateUserProfile(
    request: UpdateTavernUserProfileRequest
  ): Promise<TavernRegistryMutationResult> {
    return runMutation((bridge) => bridge.updateUserProfile(request))
  }

  async function deleteUserProfile(id: string): Promise<TavernRegistryMutationResult> {
    return runMutation((bridge) =>
      bridge.deleteUserProfile({ id } as DeleteTavernUserProfileRequest)
    )
  }

  async function setUserProfileEnabled(
    request: SetTavernUserProfileEnabledRequest
  ): Promise<TavernRegistryMutationResult> {
    return runMutation((bridge) => bridge.setUserProfileEnabled(request))
  }

  async function copyPersonaToUserProfile(
    request: CopyPersonaToTavernUserProfileRequest
  ): Promise<TavernRegistryMutationResult> {
    return runMutation((bridge) => bridge.copyPersonaToUserProfile(request))
  }

  async function exportCharacterAsPersona(
    request: ExportTavernCharacterPersonaRequest
  ): Promise<TavernRegistryMutationResult> {
    return runMutation((bridge) => bridge.exportCharacterAsPersona(request))
  }

  async function createSession(
    request: CreateTavernSessionRequest
  ): Promise<TavernSessionOperationResult> {
    return runMutation((bridge) => bridge.createSession(normalizeCreateSessionRequest(request)))
  }

  async function updateSessionBinding(
    request: UpdateTavernSessionBindingRequest
  ): Promise<TavernSessionOperationResult> {
    return runMutation((bridge) =>
      bridge.updateSessionBinding(normalizeUpdateSessionBindingRequest(request))
    )
  }

  async function previewPrompt(
    request: TavernPromptPreviewRequest
  ): Promise<TavernPromptPreviewResult> {
    ensureElectronBridge('tavern.previewPrompt')
    if (!appBridge.tavern) {
      throw new Error('Tavern bridge unavailable.')
    }
    return appBridge.tavern.previewPrompt(request)
  }

  function characterById(id: string | undefined): TavernCharacter | undefined {
    return id ? characters.value.find((character) => character.id === id) : undefined
  }

  function lorebookById(id: string | undefined): TavernLorebook | undefined {
    return id ? lorebooks.value.find((lorebook) => lorebook.id === id) : undefined
  }

  function promptPresetById(id: string | undefined): TavernPromptPreset | undefined {
    return id ? promptPresets.value.find((preset) => preset.id === id) : undefined
  }

  function userProfileById(id: string | undefined): TavernUserProfile | undefined {
    return id ? userProfiles.value.find((profile) => profile.id === id) : undefined
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
    promptPresets,
    userProfiles,
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
    createPromptPreset,
    updatePromptPreset,
    deletePromptPreset,
    setPromptPresetEnabled,
    createUserProfile,
    updateUserProfile,
    deleteUserProfile,
    setUserProfileEnabled,
    copyPersonaToUserProfile,
    exportCharacterAsPersona,
    createSession,
    updateSessionBinding,
    previewPrompt,
    characterById,
    lorebookById,
    promptPresetById,
    userProfileById,
    stopSubscription,
  }
})

function emptyRegistry(): TavernRegistry {
  return {
    version: 2,
    characters: [],
    lorebooks: [],
    promptPresets: [],
    userProfiles: [],
    updatedAt: 0,
  }
}

function normalizeCreateSessionRequest(
  request: CreateTavernSessionRequest
): CreateTavernSessionRequest {
  return {
    ...request,
    lorebookIds: request.lorebookIds ? [...request.lorebookIds] : undefined,
  }
}

function normalizeUpdateSessionBindingRequest(
  request: UpdateTavernSessionBindingRequest
): UpdateTavernSessionBindingRequest {
  return {
    ...request,
    lorebookIds: request.lorebookIds ? [...request.lorebookIds] : undefined,
  }
}

function normalizeError(value: unknown): Error {
  if (value instanceof Error) return value
  if (typeof value === 'string') return new Error(value)
  return new Error('Tavern operation failed.')
}

import { PersonaRegistryValidationError } from '@core/persona/registry-schema'
import { IPC_CHANNELS } from '@shared/constants'
import type {
  CreatePersonaRequest,
  DeletePersonaRequest,
  PersonaRegistryChangedEvent,
  PersonaRegistryChangeReason,
  PersonaRegistryLoadResponse,
  PersonaRegistryMutationResult,
  PersonaRegistryOperationError,
  PersonaRegistryStatus,
  SetDefaultPersonaRequest,
  SetPersonaEnabledRequest,
  UpdatePersonaRequest,
} from '@shared/types/persona'
import { registerLoggedIpcHandler } from './common'
import type { IpcHandlerOptions } from './types'

type Runtime = IpcHandlerOptions['runtime']

interface PersonaResult<T> {
  ok: boolean
  value?: T
  error?: PersonaRegistryOperationError
}

export function registerPersonaIpcHandlers(options: IpcHandlerOptions): void {
  const runtime = options.runtime

  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.persona.load,
    (): PersonaResult<PersonaRegistryLoadResponse> => safe(() => runtime.personaManager.load())
  )

  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.persona.status,
    (): PersonaResult<PersonaRegistryStatus> => safe(() => runtime.personaManager.status())
  )

  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.persona.list,
    (): PersonaResult<PersonaRegistryLoadResponse> => safe(() => runtime.personaManager.list())
  )

  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.persona.create,
    async (event, request: CreatePersonaRequest) => {
      const result = safe(() => runtime.personaManager.create(request))
      if (result.ok && result.value) {
        emitPersonaChanged(event, 'create', result.value)
      }
      return result
    }
  )

  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.persona.update,
    async (event, request: UpdatePersonaRequest) => {
      const result = safe(() => runtime.personaManager.update(request))
      if (result.ok && result.value) {
        emitPersonaChanged(event, 'update', result.value)
      }
      return result
    }
  )

  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.persona.delete,
    async (event, request: DeletePersonaRequest | string) => {
      const result = safe(() => runtime.personaManager.delete(request))
      if (result.ok && result.value) {
        emitPersonaChanged(event, 'delete', result.value)
      }
      return result
    }
  )

  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.persona.setEnabled,
    async (event, request: SetPersonaEnabledRequest) => {
      const result = safe(() => runtime.personaManager.setEnabled(request))
      if (result.ok && result.value) {
        emitPersonaChanged(event, 'enable', result.value)
      }
      return result
    }
  )

  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.persona.setDefault,
    async (event, request: SetDefaultPersonaRequest) => {
      const result = safe(() => runtime.personaManager.setDefault(request))
      if (result.ok && result.value) {
        emitPersonaChanged(event, 'default', result.value)
      }
      return result
    }
  )
}

function emitPersonaChanged(
  event: Electron.IpcMainInvokeEvent,
  reason: PersonaRegistryChangeReason,
  mutation: PersonaRegistryMutationResult
): void {
  const payload: PersonaRegistryChangedEvent = {
    reason,
    registry: mutation.registry,
    status: mutation.status,
    profile: mutation.profile,
  }
  event.sender.send(IPC_CHANNELS.persona.changed, payload)
}

function safe<T>(operation: () => T): PersonaResult<T> {
  try {
    const value = operation()
    return { ok: true, value }
  } catch (error) {
    if (error instanceof PersonaRegistryValidationError) {
      return { ok: false, error: error.details }
    }
    return {
      ok: false,
      error: {
        code: 'invalid_registry',
        message:
          error instanceof Error ? error.message : 'Unknown persona registry error occurred.',
        recoverable: false,
      },
    }
  }
}

// Mark intentional Runtime usage for future expansion to context-aware operations.
export type _PersonaRuntime = Runtime

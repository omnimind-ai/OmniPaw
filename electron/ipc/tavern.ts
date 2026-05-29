import { TavernRegistryValidationError } from '@core/tavern'
import { IPC_CHANNELS } from '@shared/constants'
import type { ChatSessionChangedEvent } from '@shared/types/chat'
import type {
  CreateTavernCharacterRequest,
  CreateTavernLorebookRequest,
  CreateTavernSessionRequest,
  DeleteTavernCharacterRequest,
  DeleteTavernLorebookRequest,
  ExportTavernCharacterPersonaRequest,
  ImportTavernCharacterRequest,
  SetTavernCharacterEnabledRequest,
  SetTavernLorebookEnabledRequest,
  TavernRegistryChangedEvent,
  TavernRegistryChangeReason,
  TavernRegistryLoadResponse,
  TavernRegistryMutationResult,
  TavernRegistryOperationError,
  TavernRegistryStatus,
  TavernSessionOperationResult,
  UpdateTavernCharacterRequest,
  UpdateTavernLorebookRequest,
  UpdateTavernSessionBindingRequest,
} from '@shared/types/tavern'
import { registerLoggedIpcHandler } from './common'
import type { IpcHandlerOptions } from './types'

interface TavernResult<T> {
  ok: boolean
  value?: T
  error?: TavernRegistryOperationError
}

export function registerTavernIpcHandlers(options: IpcHandlerOptions): void {
  const runtime = options.runtime

  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.tavern.load,
    (): TavernResult<TavernRegistryLoadResponse> => safe(() => runtime.tavernManager.load())
  )

  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.tavern.status,
    (): TavernResult<TavernRegistryStatus> => safe(() => runtime.tavernManager.status())
  )

  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.tavern.list,
    (): TavernResult<TavernRegistryLoadResponse> => safe(() => runtime.tavernManager.list())
  )

  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.tavern.importCharacter,
    (event, request: ImportTavernCharacterRequest) => {
      const result = safe(() => runtime.tavernManager.importCharacter(request))
      if (result.ok && result.value) emitTavernChanged(event, 'import', result.value)
      return result
    }
  )

  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.tavern.createCharacter,
    (event, request: CreateTavernCharacterRequest) => {
      const result = safe(() => runtime.tavernManager.createCharacter(request))
      if (result.ok && result.value) emitTavernChanged(event, 'character', result.value)
      return result
    }
  )

  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.tavern.updateCharacter,
    (event, request: UpdateTavernCharacterRequest) => {
      const result = safe(() => runtime.tavernManager.updateCharacter(request))
      if (result.ok && result.value) emitTavernChanged(event, 'character', result.value)
      return result
    }
  )

  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.tavern.deleteCharacter,
    (event, request: DeleteTavernCharacterRequest | string) => {
      const result = safe(() => runtime.tavernManager.deleteCharacter(request))
      if (result.ok && result.value) emitTavernChanged(event, 'character', result.value)
      return result
    }
  )

  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.tavern.setCharacterEnabled,
    (event, request: SetTavernCharacterEnabledRequest) => {
      const result = safe(() => runtime.tavernManager.setCharacterEnabled(request))
      if (result.ok && result.value) emitTavernChanged(event, 'character', result.value)
      return result
    }
  )

  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.tavern.createLorebook,
    (event, request: CreateTavernLorebookRequest) => {
      const result = safe(() => runtime.tavernManager.createLorebook(request))
      if (result.ok && result.value) emitTavernChanged(event, 'lorebook', result.value)
      return result
    }
  )

  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.tavern.updateLorebook,
    (event, request: UpdateTavernLorebookRequest) => {
      const result = safe(() => runtime.tavernManager.updateLorebook(request))
      if (result.ok && result.value) emitTavernChanged(event, 'lorebook', result.value)
      return result
    }
  )

  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.tavern.deleteLorebook,
    (event, request: DeleteTavernLorebookRequest | string) => {
      const result = safe(() => runtime.tavernManager.deleteLorebook(request))
      if (result.ok && result.value) emitTavernChanged(event, 'lorebook', result.value)
      return result
    }
  )

  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.tavern.setLorebookEnabled,
    (event, request: SetTavernLorebookEnabledRequest) => {
      const result = safe(() => runtime.tavernManager.setLorebookEnabled(request))
      if (result.ok && result.value) emitTavernChanged(event, 'lorebook', result.value)
      return result
    }
  )

  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.tavern.exportCharacterAsPersona,
    (event, request: ExportTavernCharacterPersonaRequest) => {
      const result = safe(() => runtime.tavernManager.exportCharacterAsPersona(request))
      if (result.ok && result.value) emitTavernChanged(event, 'persona', result.value)
      return result
    }
  )

  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.tavern.createSession,
    async (event, request: CreateTavernSessionRequest) => {
      const result = await safeAsync(() => runtime.chatService.createTavernSession(request))
      if (result.ok && result.value) {
        emitTavernChanged(event, 'session', result.value)
        emitChatSessionChanged(event, 'created', result.value.session)
      }
      return result
    }
  )

  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.tavern.updateSessionBinding,
    (event, request: UpdateTavernSessionBindingRequest) => {
      const result = safe(() => runtime.chatService.updateTavernSessionBinding(request))
      if (result.ok && result.value) {
        emitTavernChanged(event, 'session', result.value)
        emitChatSessionChanged(event, 'updated', result.value.session)
      }
      return result
    }
  )
}

function emitTavernChanged(
  event: Electron.IpcMainInvokeEvent,
  reason: TavernRegistryChangeReason,
  mutation: TavernRegistryMutationResult | TavernSessionOperationResult
): void {
  const payload: TavernRegistryChangedEvent = {
    reason,
    registry: mutation.registry,
    status: mutation.status,
    character: 'character' in mutation ? mutation.character : undefined,
    lorebook: 'lorebook' in mutation ? mutation.lorebook : undefined,
  }
  event.sender.send(IPC_CHANNELS.tavern.changed, payload)
}

function emitChatSessionChanged(
  event: Electron.IpcMainInvokeEvent,
  reason: ChatSessionChangedEvent['reason'],
  session: ChatSessionChangedEvent['session']
): void {
  if (!session) return
  event.sender.send(IPC_CHANNELS.chat.sessionChanged, {
    reason,
    sessionId: session.id,
    session,
  } satisfies ChatSessionChangedEvent)
}

function safe<T>(operation: () => T): TavernResult<T> {
  try {
    return { ok: true, value: operation() }
  } catch (error) {
    return { ok: false, error: tavernError(error) }
  }
}

async function safeAsync<T>(operation: () => Promise<T>): Promise<TavernResult<T>> {
  try {
    return { ok: true, value: await operation() }
  } catch (error) {
    return { ok: false, error: tavernError(error) }
  }
}

function tavernError(error: unknown): TavernRegistryOperationError {
  if (error instanceof TavernRegistryValidationError) {
    return error.details
  }
  return {
    code: 'invalid_registry',
    message: error instanceof Error ? error.message : 'Unknown tavern operation error occurred.',
    recoverable: false,
  }
}

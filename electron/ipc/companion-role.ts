import { IPC_CHANNELS } from '@shared/constants'
import type { ImportCompanionRoleCardRequest } from '@shared/types/companion-role'
import { registerLoggedIpcHandler } from './common'
import type { IpcHandlerOptions } from './types'

export function registerCompanionRoleIpcHandlers(options: IpcHandlerOptions): void {
  const runtime = options.runtime

  registerLoggedIpcHandler(options, IPC_CHANNELS.companionRole.importCard, (_event, request) =>
    runtime.companionRoleService.importCard(normalizeImportCompanionRoleCardRequest(request))
  )
}

function normalizeImportCompanionRoleCardRequest(request: unknown): ImportCompanionRoleCardRequest {
  const payload = request as ImportCompanionRoleCardRequest | undefined
  return {
    content: typeof payload?.content === 'string' ? payload.content : undefined,
    dataBase64: typeof payload?.dataBase64 === 'string' ? payload.dataBase64 : undefined,
    sourceKind:
      payload?.sourceKind === 'json' ||
      payload?.sourceKind === 'png' ||
      payload?.sourceKind === 'webp'
        ? payload.sourceKind
        : undefined,
    mimeType: typeof payload?.mimeType === 'string' ? payload.mimeType : undefined,
    sourceName: typeof payload?.sourceName === 'string' ? payload.sourceName : undefined,
  }
}

import { IPC_CHANNELS } from '@shared/constants'
import type {
  CompanionMemoryDeleteRequest,
  CompanionMemoryFilters,
  CompanionMemoryImportanceRequest,
  CompanionMemoryProposalListRequest,
  CompanionMemorySettingsRequest,
  CreateCompanionMemoryRequest,
  DesktopMemorySettings,
  UpdateCompanionMemoryProposalRequest,
  UpdateCompanionMemoryRequest,
} from '@shared/types/memory'
import { registerLoggedIpcHandler } from './common'
import type { IpcHandlerOptions } from './types'

export function registerMemoryIpcHandlers(options: IpcHandlerOptions): void {
  const service = options.runtime.memoryService

  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.memory.list,
    (_event, filters?: CompanionMemoryFilters) => service.list(filters)
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.memory.search,
    (_event, filters?: CompanionMemoryFilters) => service.search(filters)
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.memory.inspect,
    (_event, memoryId: string) => service.inspect(memoryId) ?? null
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.memory.create,
    (_event, request: CreateCompanionMemoryRequest) => service.create(request)
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.memory.update,
    (_event, request: UpdateCompanionMemoryRequest) => service.update(request) ?? null
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.memory.archive,
    (_event, memoryId: string) => service.archive(memoryId) ?? null
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.memory.delete,
    (_event, request: CompanionMemoryDeleteRequest | string) => ({
      deleted: service.delete(request),
    })
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.memory.setImportance,
    (_event, request: CompanionMemoryImportanceRequest) => service.setImportance(request) ?? null
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.memory.listProposals,
    (_event, request?: CompanionMemoryProposalListRequest) => service.listProposals(request)
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.memory.updateProposal,
    (_event, request: UpdateCompanionMemoryProposalRequest) =>
      service.updateProposal(request) ?? null
  )
  registerLoggedIpcHandler(options, IPC_CHANNELS.memory.getSettings, () => service.getSettings())
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.memory.updateSettings,
    (_event, request: CompanionMemorySettingsRequest | DesktopMemorySettings) => {
      const settings = isSettingsRequest(request) ? request.settings : request
      return service.updateSettings(settings)
    }
  )
}

function isSettingsRequest(
  value: CompanionMemorySettingsRequest | DesktopMemorySettings
): value is CompanionMemorySettingsRequest {
  return Boolean(value && typeof value === 'object' && 'settings' in value)
}

import { writeFile } from 'node:fs/promises'
import { IPC_CHANNELS } from '@shared/constants'
import type {
  ExportCompanionRoleCardRequest,
  ImportCompanionRoleCardRequest,
} from '@shared/types/companion-role'
import { dialog } from 'electron'
import { registerLoggedIpcHandler } from './common'
import type { IpcHandlerOptions } from './types'

export function registerCompanionRoleIpcHandlers(options: IpcHandlerOptions): void {
  const runtime = options.runtime

  registerLoggedIpcHandler(options, IPC_CHANNELS.companionRole.importCard, (_event, request) =>
    importCompanionRole(runtime, normalizeImportCompanionRoleCardRequest(request))
  )

  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.companionRole.exportCard,
    async (_event, request) => {
      const exported = runtime.companionRoleService.exportCard(
        withEmbeddedAppearancePack(runtime, normalizeExportCompanionRoleCardRequest(request))
      )
      const result = await dialog.showSaveDialog({
        defaultPath: exported.defaultFileName,
        filters: [
          { name: 'OmniPaw role files', extensions: ['json'] },
          { name: 'All files', extensions: ['*'] },
        ],
        properties: ['createDirectory', 'showOverwriteConfirmation'],
      })
      if (result.canceled || !result.filePath) {
        return { exported: false, canceled: true }
      }

      await writeFile(result.filePath, exported.content, 'utf8')
      return {
        exported: true,
        destinationPath: result.filePath,
      }
    }
  )
}

type CompanionRoleRuntime = IpcHandlerOptions['runtime']

function importCompanionRole(
  runtime: CompanionRoleRuntime,
  request: ImportCompanionRoleCardRequest
): ReturnType<CompanionRoleRuntime['companionRoleService']['importCard']> {
  const result = runtime.companionRoleService.importCard(request)
  if (result.appearancePack) {
    const imported = runtime.catAppearanceManager.importEmbeddedPack(result.appearancePack)
    if (imported.importedPackId) {
      result.role.appearancePackId = imported.importedPackId
    }
  }
  return result
}

function withEmbeddedAppearancePack(
  runtime: CompanionRoleRuntime,
  request: ExportCompanionRoleCardRequest
): ExportCompanionRoleCardRequest {
  return {
    ...request,
    appearancePack:
      request.appearancePack ??
      runtime.catAppearanceManager.exportEmbeddedPack(request.role.appearancePackId),
  }
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

function normalizeExportCompanionRoleCardRequest(request: unknown): ExportCompanionRoleCardRequest {
  const payload = request as ExportCompanionRoleCardRequest | undefined
  return {
    role:
      payload?.role && typeof payload.role === 'object'
        ? payload.role
        : {
            name: 'Imported role',
          },
    sourceName: typeof payload?.sourceName === 'string' ? payload.sourceName : undefined,
  }
}

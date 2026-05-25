import { basename } from 'node:path'
import { AgentWorkspaceError } from '@core/agent/workspace'
import { IPC_CHANNELS } from '@shared/constants'
import type {
  AgentWorkspaceStatusRequest,
  CleanupWorkspaceRequest,
  DeleteWorkspaceFileRequest,
  ExportWorkspaceFileRequest,
  ListWorkspaceFilesRequest,
  LocalAgentOperationError,
  ReadWorkspaceFileRequest,
} from '@shared/types/local-agent'
import { dialog } from 'electron'
import { registerLoggedIpcHandler } from './common'
import type { IpcHandlerOptions } from './types'

type LocalIpcResult<T> = { ok: true; value: T } | { ok: false; error: LocalAgentOperationError }

export function registerWorkspaceIpcHandlers(options: IpcHandlerOptions): void {
  const runtime = options.runtime

  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.workspace.status,
    (_event, request: AgentWorkspaceStatusRequest | string) =>
      localResult(() =>
        runtime.agentWorkspaceService.getStatus(
          typeof request === 'string' ? request : request.sessionId
        )
      )
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.workspace.listFiles,
    (_event, request: ListWorkspaceFilesRequest) =>
      localResult(() => runtime.agentWorkspaceService.listFiles(request))
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.workspace.readFile,
    (_event, request: ReadWorkspaceFileRequest) =>
      localResult(() => runtime.agentWorkspaceService.readFile(request))
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.workspace.exportFile,
    async (_event, request: ExportWorkspaceFileRequest) =>
      localResult(async () => {
        const result = await dialog.showSaveDialog({
          defaultPath: basename(request.path),
          properties: ['createDirectory', 'showOverwriteConfirmation'],
        })
        if (result.canceled || !result.filePath) {
          return {
            sessionId: request.sessionId,
            path: request.path,
            canceled: true,
          }
        }
        return runtime.agentWorkspaceService.exportFile({
          sessionId: request.sessionId,
          path: request.path,
          destinationPath: result.filePath,
        })
      })
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.workspace.deleteFile,
    (_event, request: DeleteWorkspaceFileRequest) =>
      localResult(() => runtime.agentWorkspaceService.deleteFile(request))
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.workspace.cleanup,
    (_event, request: CleanupWorkspaceRequest | string) =>
      localResult(() =>
        runtime.agentWorkspaceService.cleanupWorkspace(
          typeof request === 'string' ? request : request.sessionId
        )
      )
  )
}

async function localResult<T>(operation: () => T | Promise<T>): Promise<LocalIpcResult<T>> {
  try {
    return { ok: true, value: await operation() }
  } catch (error) {
    if (error instanceof AgentWorkspaceError) {
      return {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          recoverable: error.recoverable,
        },
      }
    }
    return {
      ok: false,
      error: {
        code: 'local_capability_unavailable',
        message: error instanceof Error ? error.message : 'Local capability operation failed.',
        recoverable: true,
      },
    }
  }
}

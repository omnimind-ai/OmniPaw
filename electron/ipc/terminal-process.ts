import { IPC_CHANNELS } from '@shared/constants'
import type {
  GetLocalProcessRequest,
  KillLocalProcessRequest,
  KillLocalProcessResponse,
  ListLocalProcessesRequest,
  LocalAgentOperationError,
  LocalProcessSummary,
} from '@shared/types/local-agent'
import { registerLoggedIpcHandler } from './common'
import type { IpcHandlerOptions } from './types'

type LocalIpcResult<T> = { ok: true; value: T } | { ok: false; error: LocalAgentOperationError }

export function registerTerminalProcessIpcHandlers(options: IpcHandlerOptions): void {
  const runtime = options.runtime

  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.terminalProcess.list,
    (_event, request?: ListLocalProcessesRequest) =>
      localResult<LocalProcessSummary[]>(() => runtime.terminalService.listProcesses(request))
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.terminalProcess.get,
    (_event, request: GetLocalProcessRequest | string) =>
      localResult<LocalProcessSummary | null>(() =>
        runtime.terminalService.getProcess(
          typeof request === 'string' ? request : request.processId
        )
      )
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.terminalProcess.kill,
    (_event, request: KillLocalProcessRequest | string) =>
      localResult<KillLocalProcessResponse>(() => {
        const processId = typeof request === 'string' ? request : request.processId
        return {
          processId,
          killed: runtime.terminalService.killProcess(processId),
        }
      })
  )
}

async function localResult<T>(operation: () => T | Promise<T>): Promise<LocalIpcResult<T>> {
  try {
    return { ok: true, value: await operation() }
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'process_failed',
        message: error instanceof Error ? error.message : 'Local process operation failed.',
        recoverable: true,
      },
    }
  }
}

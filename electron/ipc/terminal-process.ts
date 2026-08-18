import { IPC_CHANNELS } from '@shared/constants'
import type {
  GetLocalProcessRequest,
  InstallTerminalSandboxResponse,
  KillLocalProcessRequest,
  KillLocalProcessResponse,
  ListLocalProcessesRequest,
  LocalAgentOperationError,
  LocalProcessSummary,
  TerminalSandboxStatus,
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
      localResult<KillLocalProcessResponse>(async () => {
        const processId = typeof request === 'string' ? request : request.processId
        return {
          processId,
          killed: await runtime.terminalService.killProcess(processId),
        }
      })
  )
  registerLoggedIpcHandler(options, IPC_CHANNELS.terminalProcess.sandboxStatus, () =>
    localResult<TerminalSandboxStatus>(() => runtime.terminalService.getSandboxStatus())
  )
  registerLoggedIpcHandler(options, IPC_CHANNELS.terminalProcess.installSandbox, () =>
    localResult<InstallTerminalSandboxResponse>(() => runtime.terminalService.installSandbox())
  )
}

async function localResult<T>(operation: () => T | Promise<T>): Promise<LocalIpcResult<T>> {
  try {
    return { ok: true, value: await operation() }
  } catch (error) {
    const code = terminalOperationErrorCode(error)
    return {
      ok: false,
      error: {
        code,
        message: error instanceof Error ? error.message : 'Local process operation failed.',
        recoverable: true,
      },
    }
  }
}

function terminalOperationErrorCode(error: unknown): LocalAgentOperationError['code'] {
  if (!error || typeof error !== 'object' || !('code' in error)) return 'process_failed'
  if (
    error.code === 'terminal_sandbox_unavailable' ||
    error.code === 'terminal_sandbox_setup_required' ||
    error.code === 'terminal_sandbox_install_failed'
  ) {
    return error.code
  }
  return 'process_failed'
}

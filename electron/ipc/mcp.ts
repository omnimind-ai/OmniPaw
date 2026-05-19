import { McpValidationError, mcpError } from '@core/mcp'
import { IPC_CHANNELS } from '@shared/constants'
import type {
  DeleteMcpServerRequest,
  McpOperationError,
  RefreshMcpServerRequest,
  SaveMcpServerRequest,
  SetMcpServerEnabledRequest,
} from '@shared/types/mcp'
import { registerLoggedIpcHandler } from './common'
import type { IpcHandlerOptions } from './types'

type McpIpcResult<T> = { ok: true; value: T } | { ok: false; error: McpOperationError }

export function registerMcpIpcHandlers(options: IpcHandlerOptions): void {
  const runtime = options.runtime

  registerLoggedIpcHandler(options, IPC_CHANNELS.mcp.listServers, () =>
    mcpResult(options, () => runtime.mcpServerManager.listServers())
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.mcp.saveServer,
    (_event, request: SaveMcpServerRequest) =>
      mcpResult(options, () => runtime.mcpServerManager.saveServer(request))
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.mcp.deleteServer,
    (_event, request: DeleteMcpServerRequest | string) =>
      mcpResult(options, () =>
        runtime.mcpServerManager.deleteServer(
          typeof request === 'string' ? request : request.serverId
        )
      )
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.mcp.setServerEnabled,
    (_event, request: SetMcpServerEnabledRequest) =>
      mcpResult(options, () => runtime.mcpServerManager.setServerEnabled(request))
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.mcp.refreshServer,
    (_event, request?: RefreshMcpServerRequest | string) =>
      mcpResult(options, () =>
        runtime.mcpServerManager.refreshServer(
          typeof request === 'string' ? request : request?.serverId
        )
      )
  )
  registerLoggedIpcHandler(options, IPC_CHANNELS.mcp.listTools, () =>
    mcpResult(options, () => runtime.mcpServerManager.listTools())
  )
}

async function mcpResult<T>(
  options: IpcHandlerOptions,
  operation: () => T | Promise<T>
): Promise<McpIpcResult<T>> {
  try {
    return {
      ok: true,
      value: await operation(),
    }
  } catch (error) {
    if (error instanceof McpValidationError) {
      options.ipcLogger.warn('MCP operation failed.', {
        errorCode: error.details.code,
        recoverable: error.details.recoverable,
      })
      return {
        ok: false,
        error: error.details,
      }
    }
    options.ipcLogger.error('MCP operation failed unexpectedly.', { error })
    return {
      ok: false,
      error: mcpError(
        'mcp_io_error',
        error instanceof Error ? error.message : 'MCP operation failed.',
        {
          recoverable: true,
        }
      ),
    }
  }
}

import { IPC_CHANNELS } from '@shared/constants'
import type {
  CreateCronTaskRequest,
  DeleteCronTaskRequest,
  ListCronRunsRequest,
  ListCronTasksRequest,
  RunCronTaskNowRequest,
  UpdateCronTaskRequest,
} from '@shared/types/cron'
import { registerLoggedIpcHandler } from './common'
import type { IpcHandlerOptions } from './types'

export function registerCronIpcHandlers(options: IpcHandlerOptions): void {
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.cron.list,
    (_event, request?: ListCronTasksRequest) => options.runtime.cronManager.list(request)
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.cron.create,
    (_event, request: CreateCronTaskRequest) => options.runtime.cronManager.create(request)
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.cron.update,
    (_event, request: UpdateCronTaskRequest) => options.runtime.cronManager.update(request)
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.cron.delete,
    (_event, request: DeleteCronTaskRequest | string) => options.runtime.cronManager.delete(request)
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.cron.runNow,
    (_event, request: RunCronTaskNowRequest | string) => options.runtime.cronManager.runNow(request)
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.cron.listRuns,
    (_event, request?: ListCronRunsRequest) => options.runtime.cronManager.listRuns(request)
  )
}

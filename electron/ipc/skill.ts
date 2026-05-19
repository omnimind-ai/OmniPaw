import { SkillValidationError, skillError } from '@core/skill'
import { IPC_CHANNELS } from '@shared/constants'
import type {
  ImportSkillRequest,
  SetSkillEnabledRequest,
  SkillOperationError,
} from '@shared/types/skill'
import { registerLoggedIpcHandler } from './common'
import type { IpcHandlerOptions } from './types'

type SkillIpcResult<T> = { ok: true; value: T } | { ok: false; error: SkillOperationError }

export function registerSkillIpcHandlers(options: IpcHandlerOptions): void {
  const runtime = options.runtime

  registerLoggedIpcHandler(options, IPC_CHANNELS.skill.list, () =>
    skillResult(options, () => runtime.skillManager.list())
  )
  registerLoggedIpcHandler(options, IPC_CHANNELS.skill.refresh, () =>
    skillResult(options, () => runtime.skillManager.refresh())
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.skill.setEnabled,
    (_event, request: SetSkillEnabledRequest) =>
      skillResult(options, () => runtime.skillManager.setEnabled(request))
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.skill.importSkill,
    (_event, request: ImportSkillRequest) =>
      skillResult(options, () => runtime.skillManager.importSkill(request))
  )
}

function skillResult<T>(options: IpcHandlerOptions, operation: () => T): SkillIpcResult<T> {
  try {
    return {
      ok: true,
      value: operation(),
    }
  } catch (error) {
    if (error instanceof SkillValidationError) {
      options.ipcLogger.warn('Skill operation failed.', {
        errorCode: error.details.code,
        recoverable: error.details.recoverable,
      })
      return {
        ok: false,
        error: error.details,
      }
    }
    options.ipcLogger.error('Skill operation failed unexpectedly.', { error })
    return {
      ok: false,
      error: skillError(
        'skill_io_error',
        error instanceof Error ? error.message : 'Skill operation failed.',
        {
          recoverable: true,
        }
      ),
    }
  }
}

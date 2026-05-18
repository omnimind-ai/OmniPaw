import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'

import type { SkillOperationError, SkillState, SkillStateStatus } from '@shared/types/skill'
import {
  cloneDefaultSkillState,
  cloneSkillState,
  normalizeSkillId,
  normalizeSkillState,
  serializeSkillState,
  SKILL_STATE_FILE_NAME,
  skillError,
  SkillValidationError,
} from './schema'

export interface SkillStateStoreOptions {
  userDataPath: string
  fileName?: string
}

export class SkillStateStore {
  readonly statePath: string
  readonly backupPath: string
  private loadedState: SkillState | undefined
  private lastError: SkillOperationError | undefined

  constructor(options: SkillStateStoreOptions) {
    this.statePath = resolveSkillStatePath(options.userDataPath, options.fileName)
    this.backupPath = `${this.statePath}.bak`
  }

  load(): SkillState {
    this.ensureDirectory()

    if (!existsSync(this.statePath)) {
      return this.writeLoaded(cloneDefaultSkillState(), false)
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(readFileSync(this.statePath, 'utf8')) as unknown
    } catch (error) {
      this.lastError = skillError(
        'invalid_json',
        errorMessage(error, 'Failed to parse skill state.'),
        {
          path: this.statePath,
          recoverable: existsSync(this.backupPath),
        }
      )
      throw new SkillValidationError(this.lastError)
    }

    const { state, changed } = this.normalizeOrThrow(parsed)
    if (changed) {
      this.save(state)
      return this.get()
    }

    this.loadedState = cloneSkillState(state)
    this.lastError = undefined
    return this.get()
  }

  get(): SkillState {
    if (!this.loadedState) {
      return this.load()
    }
    return cloneSkillState(this.loadedState)
  }

  save(nextState: SkillState): SkillState {
    const { state } = this.normalizeOrThrow(nextState)
    this.writeLoaded(state, true)
    return this.get()
  }

  setEnabled(skillId: string, enabled: boolean): SkillState {
    const id = normalizeSkillId(skillId)
    if (!id) {
      throw new SkillValidationError(
        skillError('validation_failed', 'Skill id is invalid.', {
          issues: [{ path: 'skillId', message: 'Skill id is required.', code: 'required' }],
        })
      )
    }
    const state = this.get()
    return this.save({
      ...state,
      enabledById: {
        ...state.enabledById,
        [id]: enabled,
      },
    })
  }

  status(): SkillStateStatus {
    return {
      path: this.statePath,
      backupPath: this.backupPath,
      exists: existsSync(this.statePath),
      backupExists: existsSync(this.backupPath),
      loaded: Boolean(this.loadedState),
      version: this.loadedState?.version,
      recoverable: existsSync(this.backupPath),
      error: this.lastError,
    }
  }

  private normalizeOrThrow(raw: unknown): ReturnType<typeof normalizeSkillState> {
    try {
      const result = normalizeSkillState(raw)
      this.lastError = undefined
      return result
    } catch (error) {
      if (error instanceof SkillValidationError) {
        this.lastError = {
          ...error.details,
          path: error.details.path ?? this.statePath,
          recoverable: error.details.recoverable || existsSync(this.backupPath),
        }
        throw new SkillValidationError(this.lastError)
      }

      this.lastError = skillError(
        'invalid_state',
        errorMessage(error, 'Failed to normalize skill state.'),
        {
          path: this.statePath,
          recoverable: existsSync(this.backupPath),
        }
      )
      throw new SkillValidationError(this.lastError)
    }
  }

  private writeLoaded(state: SkillState, backupExisting: boolean): SkillState {
    try {
      atomicWriteJson(
        this.statePath,
        serializeSkillState(state),
        backupExisting ? this.backupPath : undefined
      )
      this.loadedState = cloneSkillState(state)
      this.lastError = undefined
      return this.get()
    } catch (error) {
      this.lastError = skillError(
        'save_failed',
        errorMessage(error, 'Failed to save skill state.'),
        {
          path: this.statePath,
          recoverable: existsSync(this.backupPath),
        }
      )
      throw new SkillValidationError(this.lastError)
    }
  }

  private ensureDirectory(): void {
    mkdirSync(dirname(this.statePath), { recursive: true })
  }
}

export function resolveSkillStatePath(
  userDataPath: string,
  fileName = SKILL_STATE_FILE_NAME
): string {
  return join(userDataPath, fileName)
}

function atomicWriteJson(path: string, content: string, backupPath?: string): void {
  mkdirSync(dirname(path), { recursive: true })

  if (backupPath && existsSync(path)) {
    copyFileSync(path, backupPath)
  }

  const tempPath = `${path}.${process.pid}.${Date.now()}.tmp`
  const fd = openSync(tempPath, 'w')
  try {
    writeFileSync(fd, content, 'utf8')
    fsyncSync(fd)
  } catch (error) {
    rmSync(tempPath, { force: true })
    throw error
  } finally {
    closeSync(fd)
  }
  renameSync(tempPath, path)
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

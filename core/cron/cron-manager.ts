import type { CronRunRepo, CronTaskRepo } from '@core/db/repos'
import type { Logger } from '@core/logging'
import type { ChatSession } from '@shared/types/chat'
import type {
  CreateCronTaskRequest,
  CreateCronTaskResponse,
  CronRun,
  CronRunError,
  CronRunReason,
  CronRunStatus,
  CronSchedule,
  CronTask,
  CronTaskChangedEvent,
  CronValidationError,
  DeleteCronTaskRequest,
  DeleteCronTaskResponse,
  ListCronRunsRequest,
  ListCronRunsResponse,
  ListCronTasksRequest,
  ListCronTasksResponse,
  RunCronTaskNowRequest,
  RunCronTaskNowResponse,
  UpdateCronTaskRequest,
  UpdateCronTaskResponse,
} from '@shared/types/cron'
import type { DesktopScheduledTaskSettings } from '@shared/types/settings'
import {
  nextRunAt,
  scheduleFromCreateRequest,
  scheduleFromUpdateRequest,
  validateCronExpression,
} from './schedule'

export interface CronSessionLookup {
  get(id: string): { id: string; status?: string } | undefined
  getOrCreateCronSession?: () => Pick<ChatSession, 'id' | 'status' | 'kind'>
}

export interface ScheduledTaskExecutionResult {
  resultMessageId?: string
  resultSummary?: string
}

export interface ScheduledTaskExecutor {
  execute(input: {
    task: CronTask
    run: CronRun
    signal: AbortSignal
  }): Promise<ScheduledTaskExecutionResult>
}

export interface CronManagerOptions {
  tasks: CronTaskRepo
  runs: CronRunRepo
  sessions?: CronSessionLookup
  settings: () => DesktopScheduledTaskSettings
  executor?: ScheduledTaskExecutor
  logger?: Logger
  onChanged?: (event: CronTaskChangedEvent) => void
  maxTimerMs?: number
}

export class CronOperationError extends Error {
  readonly errors: CronValidationError[]

  constructor(message: string, errors: CronValidationError[]) {
    super(message)
    this.name = 'CronOperationError'
    this.errors = errors
  }
}

export class CronManager {
  private readonly maxTimerMs: number
  private executor: ScheduledTaskExecutor | undefined
  private timer: NodeJS.Timeout | undefined
  private started = false
  private stopped = false
  private startupMisfireHandled = false
  private readonly activeRuns = new Map<string, AbortController>()

  constructor(private readonly options: CronManagerOptions) {
    this.maxTimerMs = Math.max(1_000, options.maxTimerMs ?? 60_000)
    this.executor = options.executor
  }

  setExecutor(executor: ScheduledTaskExecutor): void {
    this.executor = executor
  }

  start(): void {
    if (this.started) {
      return
    }
    this.started = true
    this.stopped = false
    this.cleanupStaleRunning()
    this.handleStartupMisfires()
    this.armTimer()
    this.options.logger?.info('Cron manager started.', {
      enabled: this.options.settings().enabled,
    })
  }

  stop(): void {
    this.stopped = true
    this.clearTimer()
    for (const controller of this.activeRuns.values()) {
      controller.abort('cron_manager_stopped')
    }
    this.activeRuns.clear()
    this.options.logger?.info('Cron manager stopped.')
  }

  reloadSettings(): void {
    if (!this.started || this.stopped) {
      return
    }
    this.options.logger?.info('Cron manager settings reloaded.', {
      enabled: this.options.settings().enabled,
      misfirePolicy: this.options.settings().misfirePolicy,
      misfireStartupLimit: this.options.settings().misfireStartupLimit,
    })
    this.armTimer()
  }

  list(request: ListCronTasksRequest = {}): ListCronTasksResponse {
    return {
      tasks: this.options.tasks.list(request),
    }
  }

  create(request: CreateCronTaskRequest): CreateCronTaskResponse {
    const now = Date.now()
    const errors: CronValidationError[] = []
    const targetSessionId = this.resolveTargetSessionId(request)
    const sourceSessionId = request.sourceSessionId?.trim() || targetSessionId
    const normalizedRequest: CreateCronTaskRequest = {
      ...request,
      sourceSessionId,
      targetSessionId,
    }
    errors.push(...this.validateTaskInput(normalizedRequest, now))
    const scheduleResult = scheduleFromCreateRequest(normalizedRequest, now)
    errors.push(...scheduleResult.errors)
    if (scheduleResult.schedule?.kind === 'cron') {
      errors.push(...validateCronExpression(scheduleResult.schedule.cronExpression))
    }
    if (
      scheduleResult.schedule?.kind === 'at' &&
      isExpiredOneShot(scheduleResult.schedule, now, this.options.settings())
    ) {
      errors.push({
        path: 'runAt',
        code: 'invalid_schedule',
        message: 'One-shot task time is outside the configured missed-task grace window.',
      })
    }
    if (errors.length || !scheduleResult.schedule) {
      throw new CronOperationError('Scheduled task request is invalid.', errors)
    }

    const next = initialNextRunAt(scheduleResult.schedule, now, this.options.settings())
    const task: CronTask = {
      id: crypto.randomUUID(),
      name: request.name.trim(),
      note: request.note.trim(),
      sourceSessionId,
      targetSessionId,
      schedule: scheduleResult.schedule,
      enabled: request.enabled ?? true,
      state: request.enabled === false ? 'disabled' : 'idle',
      nextRunAt: next,
      failureCount: 0,
      createdAt: now,
      updatedAt: now,
    }
    const saved = this.options.tasks.save(task)
    this.options.logger?.info('Cron task created.', {
      taskId: saved.id,
      sourceSessionId: saved.sourceSessionId,
      targetSessionId: saved.targetSessionId,
      scheduleKind: saved.schedule.kind,
      enabled: saved.enabled,
      nextRunAt: saved.nextRunAt,
    })
    this.emit({ reason: 'created', taskId: saved.id, task: saved })
    this.armTimer()
    return { task: saved }
  }

  update(request: UpdateCronTaskRequest): UpdateCronTaskResponse {
    const existing = this.requireTask(request.taskId, request.sessionId)
    const now = Date.now()
    const name = request.name === undefined ? existing.name : request.name.trim()
    const note = request.note === undefined ? existing.note : request.note.trim()
    const targetSessionId =
      request.targetSessionId === undefined
        ? existing.targetSessionId
        : request.targetSessionId.trim()
    const scheduleResult = scheduleFromUpdateRequest(request, existing.schedule, now)
    const errors = this.validateTaskInput(
      {
        name,
        note,
        targetSessionId,
        sourceSessionId: existing.sourceSessionId,
      },
      now,
      { partial: true }
    )
    errors.push(...scheduleResult.errors)
    if (errors.length || !scheduleResult.schedule) {
      throw new CronOperationError('Scheduled task update is invalid.', errors)
    }

    const enabled = request.enabled ?? existing.enabled
    const scheduleChanged = !schedulesEqual(existing.schedule, scheduleResult.schedule)
    if (
      scheduleChanged &&
      scheduleResult.schedule.kind === 'at' &&
      isExpiredOneShot(scheduleResult.schedule, now, this.options.settings())
    ) {
      throw new CronOperationError('Scheduled task update is invalid.', [
        {
          path: 'runAt',
          code: 'invalid_schedule',
          message: 'One-shot task time is outside the configured missed-task grace window.',
        },
      ])
    }
    const task: CronTask = {
      ...existing,
      name,
      note,
      targetSessionId,
      schedule: scheduleResult.schedule,
      enabled,
      state: enabled ? (existing.state === 'disabled' ? 'idle' : existing.state) : 'disabled',
      nextRunAt:
        enabled && (scheduleChanged || existing.nextRunAt === undefined)
          ? initialNextRunAt(scheduleResult.schedule, now, this.options.settings())
          : existing.nextRunAt,
      updatedAt: now,
    }
    const saved = this.options.tasks.save(task)
    this.options.logger?.info('Cron task updated.', {
      taskId: saved.id,
      sourceSessionId: saved.sourceSessionId,
      targetSessionId: saved.targetSessionId,
      scheduleKind: saved.schedule.kind,
      enabled: saved.enabled,
      nextRunAt: saved.nextRunAt,
    })
    this.emit({ reason: 'updated', taskId: saved.id, task: saved })
    this.armTimer()
    return { task: saved }
  }

  delete(request: DeleteCronTaskRequest | string): DeleteCronTaskResponse {
    const normalized = typeof request === 'string' ? { taskId: request } : request
    const task = this.requireTask(normalized.taskId, normalized.sessionId)
    const deleted = this.options.tasks.delete(task.id, normalized.sessionId)
    this.options.logger?.info('Cron task deleted.', {
      taskId: task.id,
      sourceSessionId: task.sourceSessionId,
      targetSessionId: task.targetSessionId,
      deleted,
    })
    this.emit({ reason: 'deleted', taskId: task.id })
    this.armTimer()
    return { deleted }
  }

  async runNow(request: RunCronTaskNowRequest | string): Promise<RunCronTaskNowResponse> {
    const normalized = typeof request === 'string' ? { taskId: request } : request
    const task = this.requireTask(normalized.taskId, normalized.sessionId)
    const run = await this.executeTask(task, 'manual', Date.now(), { manual: true })
    return { run }
  }

  listRuns(request: ListCronRunsRequest = {}): ListCronRunsResponse {
    return {
      runs: this.options.runs.list(request),
    }
  }

  async executeDue(now = Date.now()): Promise<CronRun[]> {
    if (!this.options.settings().enabled || this.stopped) {
      return []
    }
    const due = this.options.tasks.findDue(now)
    const runs: CronRun[] = []
    for (const task of due) {
      const reason: CronRunReason =
        task.nextRunAt && task.nextRunAt < now - 60_000 ? 'misfire' : 'scheduled'
      runs.push(await this.executeTask(task, reason, now))
    }
    this.armTimer()
    return runs
  }

  private async executeTask(
    inputTask: CronTask,
    reason: CronRunReason,
    now: number,
    options: { manual?: boolean } = {}
  ): Promise<CronRun> {
    const task = this.options.tasks.tryMarkRunning(inputTask.id, now)
    if (!task) {
      const skipped = this.options.runs.createTerminal({
        taskId: inputTask.id,
        reason,
        status: 'skipped',
        scheduledFor: inputTask.nextRunAt,
        error: { code: 'already_running', message: 'Task is already running.' },
        createdAt: now,
      })
      this.options.logger?.warn('Cron task skipped because it is already running.', {
        taskId: inputTask.id,
        runId: skipped.id,
        reason,
        status: skipped.status,
      })
      return skipped
    }

    const run = this.options.runs.createRunning({
      taskId: task.id,
      reason,
      scheduledFor: options.manual ? undefined : task.nextRunAt,
      startedAt: now,
    })
    this.emit({ reason: 'run_started', taskId: task.id, task, run })
    this.options.logger?.info('Cron task execution started.', {
      taskId: task.id,
      runId: run.id,
      reason,
      scheduledFor: run.scheduledFor,
    })

    const abort = new AbortController()
    this.activeRuns.set(run.id, abort)
    try {
      const result = await this.executeWithDependency(task, run, abort.signal)
      const completed = this.options.runs.finish(run.id, {
        status: 'complete',
        completedAt: Date.now(),
        resultMessageId: result.resultMessageId,
        resultSummary: result.resultSummary,
      })
      if (!completed) {
        throw new Error('Scheduled task run was not found during completion.')
      }
      this.finalizeTaskAfterRun(task, completed, options.manual)
      this.options.logger?.info('Cron task execution completed.', {
        taskId: task.id,
        runId: completed.id,
        status: completed.status,
        durationMs: completed.durationMs,
      })
      this.emit({
        reason: 'run_completed',
        taskId: task.id,
        task: this.options.tasks.get(task.id),
        run: completed,
      })
      return completed
    } catch (error) {
      const runError = normalizeCronError(error)
      const status: CronRunStatus = runError.code === 'aborted' ? 'interrupted' : 'failed'
      const failed = this.options.runs.finish(run.id, {
        status,
        completedAt: Date.now(),
        error: runError,
      })
      if (!failed) {
        throw new Error('Scheduled task run was not found during failure handling.')
      }
      this.finalizeTaskAfterRun(task, failed, options.manual)
      this.options.logger?.warn('Cron task execution failed.', {
        taskId: task.id,
        runId: failed.id,
        status: failed.status,
        errorCode: runError.code,
        durationMs: failed.durationMs,
      })
      this.emit({
        reason: 'run_failed',
        taskId: task.id,
        task: this.options.tasks.get(task.id),
        run: failed,
      })
      return failed
    } finally {
      this.activeRuns.delete(run.id)
      this.armTimer()
    }
  }

  private async executeWithDependency(
    task: CronTask,
    run: CronRun,
    signal: AbortSignal
  ): Promise<ScheduledTaskExecutionResult> {
    if (!this.executor) {
      return { resultSummary: 'Scheduled task execution dependency is not configured.' }
    }
    return this.executor.execute({ task, run, signal })
  }

  private finalizeTaskAfterRun(task: CronTask, run: CronRun, manual: boolean | undefined): void {
    const now = run.completedAt ?? Date.now()
    const failed = run.status === 'failed' || run.status === 'interrupted'
    const next =
      manual || task.schedule.kind === 'at' ? task.nextRunAt : nextRunAt(task.schedule, now)
    this.options.tasks.save({
      ...task,
      state: task.enabled ? (failed ? 'error' : 'idle') : 'disabled',
      runningAt: undefined,
      nextRunAt: task.schedule.kind === 'at' && !manual ? undefined : next,
      lastRunAt: run.startedAt ?? task.lastRunAt,
      lastCompletedAt: now,
      lastStatus: run.status,
      lastError: run.error,
      failureCount: failed ? task.failureCount + 1 : 0,
      updatedAt: now,
    })
  }

  private cleanupStaleRunning(): void {
    const now = Date.now()
    for (const run of this.options.runs.listRunning()) {
      this.options.runs.finish(run.id, {
        status: 'interrupted',
        completedAt: now,
        error: { code: 'interrupted', message: 'Task was interrupted by a previous shutdown.' },
      })
    }
    for (const task of this.options.tasks.findRunning()) {
      this.options.tasks.save({
        ...task,
        state: task.enabled ? 'error' : 'disabled',
        runningAt: undefined,
        lastStatus: 'interrupted',
        lastError: { code: 'interrupted', message: 'Task was interrupted by a previous shutdown.' },
        failureCount: task.failureCount + 1,
        updatedAt: now,
      })
    }
  }

  private handleStartupMisfires(): void {
    if (this.startupMisfireHandled || !this.options.settings().enabled) {
      return
    }
    this.startupMisfireHandled = true
    const settings = this.options.settings()
    let started = 0
    for (const task of this.options.tasks.findDue(Date.now(), 100)) {
      if (!task.nextRunAt) {
        continue
      }
      if (task.schedule.kind === 'at') {
        if (
          Date.now() - task.nextRunAt <= settings.misfireGraceMs &&
          started < settings.misfireStartupLimit
        ) {
          started += 1
          void this.executeTask(task, 'misfire', Date.now())
        } else {
          this.markTaskTerminal(task, 'missed', {
            code: 'missed',
            message: 'One-shot task was missed outside the configured grace window.',
          })
        }
        continue
      }

      if (settings.misfirePolicy === 'run_once' && started < settings.misfireStartupLimit) {
        started += 1
        void this.executeTask(task, 'misfire', Date.now())
        continue
      }

      const next = nextRunAt(task.schedule, Date.now())
      const skipped = this.options.runs.createTerminal({
        taskId: task.id,
        reason: 'misfire',
        status: 'skipped',
        scheduledFor: task.nextRunAt,
        error: { code: 'misfire_skipped', message: 'Repeating task backfill was skipped.' },
      })
      this.options.tasks.save({
        ...task,
        nextRunAt: next,
        lastStatus: skipped.status,
        lastError: skipped.error,
        updatedAt: Date.now(),
      })
    }
  }

  private markTaskTerminal(
    task: CronTask,
    status: 'missed' | 'skipped',
    error: CronRunError
  ): void {
    const now = Date.now()
    const run = this.options.runs.createTerminal({
      taskId: task.id,
      reason: 'misfire',
      status,
      scheduledFor: task.nextRunAt,
      error,
      createdAt: now,
    })
    this.options.tasks.save({
      ...task,
      state: status === 'missed' ? 'missed' : task.state,
      nextRunAt: undefined,
      lastStatus: run.status,
      lastError: error,
      updatedAt: now,
    })
    this.options.logger?.info('Cron task marked terminal after missed schedule.', {
      taskId: task.id,
      runId: run.id,
      status,
      errorCode: error.code,
    })
  }

  private armTimer(): void {
    this.clearTimer()
    if (this.stopped || !this.options.settings().enabled) {
      return
    }
    const now = Date.now()
    const next = this.options.tasks.findDue(now, 1)[0] ?? this.options.tasks.findNextPending(now)
    if (!next?.nextRunAt) {
      return
    }
    const waitMs = Math.max(0, Math.min(next.nextRunAt - now, this.maxTimerMs))
    this.timer = setTimeout(() => {
      this.timer = undefined
      void this.executeDue()
    }, waitMs)
    this.timer.unref?.()
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = undefined
    }
  }

  private requireTask(taskId: string, sessionId?: string): CronTask {
    const task = sessionId
      ? this.options.tasks.getForSession(taskId, sessionId)
      : this.options.tasks.get(taskId)
    if (!task) {
      throw new CronOperationError('Scheduled task was not found.', [
        { path: 'taskId', code: 'not_found', message: 'Scheduled task was not found.' },
      ])
    }
    return task
  }

  private validateTaskInput(
    request: Pick<CreateCronTaskRequest, 'name' | 'note' | 'targetSessionId' | 'sourceSessionId'>,
    _now: number,
    options: { partial?: boolean } = {}
  ): CronValidationError[] {
    const errors: CronValidationError[] = []
    if (!request.name?.trim()) {
      errors.push({ path: 'name', code: 'required', message: 'Task name is required.' })
    }
    if (!request.note?.trim()) {
      errors.push({ path: 'note', code: 'required', message: 'Task note is required.' })
    }
    if (!request.targetSessionId?.trim()) {
      errors.push({
        path: 'targetSessionId',
        code: 'required',
        message: 'Target chat session is required.',
      })
    }
    const sourceSessionId = request.sourceSessionId?.trim() || request.targetSessionId?.trim()
    if (!options.partial || request.targetSessionId) {
      this.validateSession('targetSessionId', request.targetSessionId, errors)
    }
    if (sourceSessionId) {
      this.validateSession('sourceSessionId', sourceSessionId, errors)
    }
    return errors
  }

  private validateSession(
    path: 'sourceSessionId' | 'targetSessionId',
    sessionId: string | undefined,
    errors: CronValidationError[]
  ): void {
    if (!sessionId || !this.options.sessions) {
      return
    }
    const session = this.options.sessions.get(sessionId)
    if (!session || session.status === 'deleted') {
      errors.push({
        path,
        code: 'not_found',
        message: 'Chat session was not found.',
      })
    }
  }

  private emit(event: CronTaskChangedEvent): void {
    this.options.onChanged?.(event)
  }

  private resolveTargetSessionId(request: Pick<CreateCronTaskRequest, 'targetSessionId'>): string {
    const requested = request.targetSessionId?.trim()
    if (requested) {
      return requested
    }
    const cronSession = this.options.sessions?.getOrCreateCronSession?.()
    if (cronSession?.id) {
      return cronSession.id
    }
    return ''
  }
}

function isExpiredOneShot(
  schedule: Extract<CronSchedule, { kind: 'at' }>,
  now: number,
  settings: DesktopScheduledTaskSettings
): boolean {
  return schedule.runAt < now - settings.misfireGraceMs
}

function initialNextRunAt(
  schedule: CronSchedule,
  now: number,
  settings: DesktopScheduledTaskSettings
): number | undefined {
  if (schedule.kind === 'at') {
    return isExpiredOneShot(schedule, now, settings) ? undefined : schedule.runAt
  }
  return nextRunAt(schedule, now)
}

function schedulesEqual(first: CronSchedule, second: CronSchedule): boolean {
  return JSON.stringify(first) === JSON.stringify(second)
}

function normalizeCronError(error: unknown): CronRunError {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return { code: 'aborted', message: 'Scheduled task execution was aborted.' }
  }
  if (error instanceof Error) {
    return { code: error.name || 'error', message: error.message || 'Scheduled task failed.' }
  }
  return { code: 'unknown', message: 'Scheduled task failed.' }
}

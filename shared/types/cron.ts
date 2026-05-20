import type { ID, UnixMs } from './chat'

export type CronScheduleKind = 'at' | 'cron'

export interface CronAtSchedule {
  kind: 'at'
  runAt: UnixMs
  timezone?: string
}

export interface CronExpressionSchedule {
  kind: 'cron'
  cronExpression: string
  timezone?: string
}

export type CronSchedule = CronAtSchedule | CronExpressionSchedule

export type CronTaskState = 'idle' | 'running' | 'missed' | 'disabled' | 'error'

export type CronRunReason = 'scheduled' | 'manual' | 'misfire'

export type CronRunStatus = 'running' | 'complete' | 'failed' | 'interrupted' | 'skipped' | 'missed'

export type CronValidationCode =
  | 'required'
  | 'invalid_type'
  | 'invalid_schedule'
  | 'unsupported_cron'
  | 'conflicting_schedule'
  | 'not_found'
  | 'permission_denied'
  | 'already_running'
  | 'disabled'

export interface CronValidationError {
  path: string
  code: CronValidationCode
  message: string
}

export interface CronRunError {
  code: string
  message: string
  retryable?: boolean
}

export interface CronTask {
  id: ID
  name: string
  note: string
  sourceSessionId: ID
  targetSessionId: ID
  schedule: CronSchedule
  enabled: boolean
  state: CronTaskState
  nextRunAt?: UnixMs
  runningAt?: UnixMs
  lastRunAt?: UnixMs
  lastCompletedAt?: UnixMs
  lastStatus?: CronRunStatus
  lastError?: CronRunError
  failureCount: number
  createdAt: UnixMs
  updatedAt: UnixMs
}

export interface CronRun {
  id: ID
  taskId: ID
  reason: CronRunReason
  status: CronRunStatus
  scheduledFor?: UnixMs
  startedAt?: UnixMs
  completedAt?: UnixMs
  durationMs?: number
  resultMessageId?: ID
  resultSummary?: string
  error?: CronRunError
  createdAt: UnixMs
  updatedAt: UnixMs
}

export interface ListCronTasksRequest {
  sessionId?: ID
  includeDisabled?: boolean
}

export interface ListCronTasksResponse {
  tasks: CronTask[]
}

export interface CreateCronTaskRequest {
  name: string
  note: string
  targetSessionId: ID
  sourceSessionId?: ID
  runAt?: UnixMs
  cronExpression?: string
  timezone?: string
  enabled?: boolean
}

export interface CreateCronTaskResponse {
  task: CronTask
}

export interface UpdateCronTaskRequest {
  taskId: ID
  sessionId?: ID
  name?: string
  note?: string
  targetSessionId?: ID
  runAt?: UnixMs | null
  cronExpression?: string | null
  timezone?: string | null
  enabled?: boolean
}

export interface UpdateCronTaskResponse {
  task: CronTask
}

export interface DeleteCronTaskRequest {
  taskId: ID
  sessionId?: ID
}

export interface DeleteCronTaskResponse {
  deleted: boolean
}

export interface RunCronTaskNowRequest {
  taskId: ID
  sessionId?: ID
}

export interface RunCronTaskNowResponse {
  run: CronRun
}

export interface ListCronRunsRequest {
  taskId?: ID
  sessionId?: ID
  limit?: number
}

export interface ListCronRunsResponse {
  runs: CronRun[]
}

export interface CronTaskChangedEvent {
  reason: 'created' | 'updated' | 'deleted' | 'run_started' | 'run_completed' | 'run_failed'
  taskId?: ID
  task?: CronTask
  run?: CronRun
}

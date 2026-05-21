import type { CreateCronTaskRequest, UpdateCronTaskRequest } from '@shared/types/cron'

export type ScheduledTaskSubmitPayload =
  | {
      kind: 'create'
      request: CreateCronTaskRequest
    }
  | {
      kind: 'update'
      request: UpdateCronTaskRequest
    }

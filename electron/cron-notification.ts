import type { CronTask } from '@shared/types/cron'

const cronNotificationSessionKinds = new Set(['chat', 'cat', 'vision'])

export function resolveCronNotificationSessionId(
  task: CronTask,
  getSessionKind: (sessionId: string) => string | undefined
): string | null {
  const targetKind = getSessionKind(task.targetSessionId)
  if (targetKind && cronNotificationSessionKinds.has(targetKind)) {
    return task.targetSessionId
  }

  const sourceKind = getSessionKind(task.sourceSessionId)
  if (sourceKind && cronNotificationSessionKinds.has(sourceKind)) {
    return task.sourceSessionId
  }

  return null
}

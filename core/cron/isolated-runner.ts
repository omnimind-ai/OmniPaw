import type { CronTask } from '@shared/types/cron'

export class IsolatedRunner {
  async run(task: CronTask): Promise<string> {
    return `Task ${task.name} is queued for implementation.`
  }
}

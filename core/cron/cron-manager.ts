import type { CronTask } from '@shared/types/cron'

export class CronManager {
  private readonly tasks: CronTask[] = []

  list(): CronTask[] {
    return this.tasks
  }
}

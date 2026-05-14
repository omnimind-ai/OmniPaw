export interface CronTask {
  id: string
  name: string
  cron: string
  sessionId: string
  prompt: string
  enabled: boolean
  lastRunAt?: number
  lastResult?: string
}

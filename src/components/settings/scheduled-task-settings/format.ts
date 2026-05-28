import { SYSTEM_SESSION_IDS } from '@shared/constants'
import type { CronRun, CronSchedule, CronTask } from '@shared/types/cron'
import type { BadgeVariants } from '@/components/ui/badge'

export function scheduleSummary(schedule: CronSchedule): string {
  if (schedule.kind === 'at') {
    return formatTime(schedule.runAt)
  }
  return schedule.cronExpression
}

export function taskSessionLabel(task: CronTask): string {
  if (task.targetSessionId === SYSTEM_SESSION_IDS.cron) {
    return '计划任务会话'
  }
  return `会话 ${task.targetSessionId.slice(0, 8)}`
}

export function statusLabel(task: CronTask): string {
  if (!task.enabled) return '已停用'
  if (task.state === 'running') return '运行中'
  if (task.lastStatus === 'failed') return '失败'
  if (task.lastStatus === 'complete') return '已完成'
  if (task.nextRunAt) return '等待中'
  return '空闲'
}

export function statusVariant(task: CronTask): BadgeVariants['variant'] {
  if (!task.enabled) return 'outline'
  if (task.state === 'running') return 'secondary'
  if (task.lastStatus === 'failed') return 'destructive'
  return 'secondary'
}

export function runStatusLabel(run: CronRun): string {
  const labels: Record<CronRun['status'], string> = {
    running: '运行中',
    complete: '完成',
    failed: '失败',
    interrupted: '中断',
    skipped: '跳过',
    missed: '错过',
  }
  return labels[run.status]
}

export function reasonLabel(run: CronRun): string {
  const labels: Record<CronRun['reason'], string> = {
    scheduled: '计划',
    manual: '手动',
    misfire: '补跑',
  }
  return labels[run.reason]
}

export function formatTime(value: number | undefined): string {
  return value ? new Date(value).toLocaleString() : '未安排'
}

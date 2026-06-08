import type {
  CompanionMemoryKind,
  CompanionMemoryScope,
  CompanionMemoryStatus,
} from '@shared/types/memory'
import type { BadgeVariants } from '@/components/ui/badge'

export function memoryKindLabel(kind: CompanionMemoryKind): string {
  const labels: Record<CompanionMemoryKind, string> = {
    profile: '画像',
    preference: '偏好',
    relationship: '关系',
    episode: '经历',
    plan: '计划',
    boundary: '边界',
    fact: '事实',
  }
  return labels[kind]
}

export function memoryScopeLabel(scope: CompanionMemoryScope): string {
  const labels: Record<CompanionMemoryScope, string> = {
    global: '全局',
    user: '用户',
    companion: '伙伴',
    session: '会话',
    character: '角色',
  }
  return labels[scope]
}

export function memoryStatusLabel(status: CompanionMemoryStatus): string {
  const labels: Record<CompanionMemoryStatus, string> = {
    active: '活跃',
    archived: '归档',
    deleted: '删除',
    disabled: '停用',
  }
  return labels[status]
}

export function memoryStatusVariant(status: CompanionMemoryStatus): BadgeVariants['variant'] {
  if (status === 'active') return 'secondary'
  if (status === 'deleted') return 'destructive'
  return 'outline'
}

export function formatMemoryTime(value?: number): string {
  return value ? new Date(value).toLocaleString() : '未知'
}

export function percentLabel(value: number): string {
  return `${Math.round(value * 100)}%`
}

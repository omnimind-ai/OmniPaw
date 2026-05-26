import type {
  ChatContextSummary,
  ChatMessage,
  ChatSession,
  ContextPolicy,
} from '@shared/types/chat'
import type { ProviderMessage } from '@shared/types/provider'
import type { SkillPromptContext } from '@shared/types/skill'
import { estimateTokens } from './budget'
import { softTrim } from './tool-calls'
import type { ContextBudget, ContextUnit, ContextUnitKind, ContextUnitStats } from './types'

export function buildSystemUnits(
  session: ChatSession,
  skillPrompt: SkillPromptContext | undefined
): ContextUnit[] {
  const systemContext = session.systemContext
  const units: ContextUnit[] = []
  pushTextUnit(units, {
    id: 'system:base',
    kind: 'base-system',
    source: 'session.system',
    text: systemContext?.baseSystemPrompt ?? session.systemPrompt,
    priority: 1000,
    required: true,
  })
  pushTextUnit(units, {
    id: 'system:mask',
    kind: 'mask',
    source: systemContext?.mask?.refId ?? 'session.mask',
    text: systemContext?.mask?.enabled === false ? undefined : systemContext?.mask?.text,
    priority: 980,
    required: true,
    refId: systemContext?.mask?.refId,
  })
  pushTextUnit(units, {
    id: 'system:persona',
    kind: 'persona',
    source: systemContext?.persona?.refId ?? 'session.persona',
    text: systemContext?.persona?.text,
    priority: 970,
    required: true,
    refId: systemContext?.persona?.refId,
  })
  if (skillPrompt?.injected) {
    pushTextUnit(units, {
      id: 'system:skill',
      kind: 'skill',
      source: 'skill.inventory',
      text: skillPrompt.content,
      priority: 850,
      required: true,
      refId: 'skill-inventory',
    })
  }
  return units
}

export function summaryUnit(summary: ChatContextSummary): ContextUnit {
  const text = `Conversation summary:\n${summary.summary}`
  const messages: ProviderMessage[] = [{ role: 'system', content: text }]
  return {
    id: `summary:${summary.id}`,
    kind: 'summary',
    source: 'chat_context_summaries',
    priority: 760,
    required: true,
    messageId: summary.coveredToMessageId,
    messageCreatedAt: summary.coveredToCreatedAt,
    estimatedTokens: estimateTokens(messages),
    messages,
  }
}

export function selectContextUnits(
  units: ContextUnit[],
  policy: ContextPolicy,
  budget: ContextBudget
): { selected: ContextUnit[]; dropped: ContextUnit[] } {
  if (policy.mode === 'recent-turns') {
    const systemUnits = units.filter((unit) => unit.required && unit.kind !== 'message')
    const messageUnits = units
      .filter((unit) => unit.kind === 'message' || unit.kind === 'tool-result')
      .slice(-(policy.maxMessages ?? 40))
    const selectedIds = new Set([...systemUnits, ...messageUnits].map((unit) => unit.id))
    return {
      selected: sortUnits([...systemUnits, ...messageUnits]),
      dropped: units.filter((unit) => !selectedIds.has(unit.id)),
    }
  }

  const selected = units.filter((unit) => unit.required)
  const selectedIds = new Set(selected.map((unit) => unit.id))
  let used = selected.reduce((sum, unit) => sum + unit.estimatedTokens, 0)
  const optional = units
    .filter((unit) => !selectedIds.has(unit.id))
    .sort(
      (left, right) =>
        right.priority - left.priority ||
        (right.messageCreatedAt ?? 0) - (left.messageCreatedAt ?? 0)
    )

  for (const unit of optional) {
    if (used + unit.estimatedTokens > budget.maxInputTokens) {
      continue
    }
    selected.push(unit)
    selectedIds.add(unit.id)
    used += unit.estimatedTokens
  }

  return {
    selected: sortUnits(selected),
    dropped: units.filter((unit) => !selectedIds.has(unit.id)),
  }
}

export function trimMessageUnit(messages: ProviderMessage[]): ProviderMessage[] {
  return messages.map((message) => {
    if (message.role === 'assistant') {
      return {
        ...message,
        reasoningContent: undefined,
      }
    }
    if (message.role === 'tool' && typeof message.content === 'string') {
      return {
        ...message,
        content: softTrim(message.content, 1200),
      }
    }
    return message
  })
}

export function contextUnitStats(
  selected: ContextUnit[],
  dropped: ContextUnit[]
): ContextUnitStats[] {
  const stats: Partial<Record<ContextUnitKind, Omit<ContextUnitStats, 'kind'>>> = {}
  const apply = (unit: ContextUnit, selectedFlag: boolean) => {
    let item = stats[unit.kind]
    if (!item) {
      item = { selectedCount: 0, droppedCount: 0, estimatedTokens: 0 }
      stats[unit.kind] = item
    }
    if (selectedFlag) {
      item.selectedCount += 1
    } else {
      item.droppedCount += 1
    }
    item.estimatedTokens += unit.estimatedTokens
    // Only retain unit identity metadata for source-bearing kinds; do NOT
    // include raw text.
    if (unit.refId && !item.refId) {
      item.refId = unit.refId
    }
    if (unit.fallbackReason && !item.fallbackReason) {
      item.fallbackReason = unit.fallbackReason
    }
  }
  for (const unit of selected) {
    apply(unit, true)
  }
  for (const unit of dropped) {
    apply(unit, false)
  }
  return Object.entries(stats).map(([kind, item]) => ({ kind: kind as ContextUnitKind, ...item }))
}

export function countUnits(units: ContextUnit[]): Partial<Record<ContextUnitKind, number>> {
  const counts: Partial<Record<ContextUnitKind, number>> = {}
  for (const unit of units) {
    counts[unit.kind] = (counts[unit.kind] ?? 0) + 1
  }
  return counts
}

export function unitKindForMessage(message: ChatMessage): ContextUnitKind {
  return message.parts.some((part) => part.type === 'tool_call') ? 'tool-result' : 'message'
}

export function messagePriority(
  message: ChatMessage,
  isCurrent: boolean,
  isRecent: boolean
): number {
  if (isCurrent) {
    return 1000
  }
  if (isRecent) {
    return 700
  }
  if (message.parts.some((part) => part.type === 'tool_call')) {
    return 450
  }
  return 400
}

function pushTextUnit(
  units: ContextUnit[],
  input: {
    id: string
    kind: ContextUnitKind
    source: string
    text?: string
    priority: number
    required: boolean
    refId?: string
  }
): void {
  const text = input.text?.trim()
  if (!text) {
    return
  }
  const messages: ProviderMessage[] = [{ role: 'system', content: text }]
  units.push({
    id: input.id,
    kind: input.kind,
    source: input.source,
    priority: input.priority,
    required: input.required,
    estimatedTokens: estimateTokens(messages),
    messages,
    refId: input.refId,
  })
}

function sortUnits(units: ContextUnit[]): ContextUnit[] {
  return [...units].sort((left, right) => {
    const leftOrder = kindOrder(left.kind)
    const rightOrder = kindOrder(right.kind)
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder
    }
    return (left.messageCreatedAt ?? 0) - (right.messageCreatedAt ?? 0)
  })
}

function kindOrder(kind: ContextUnitKind): number {
  switch (kind) {
    case 'base-system':
      return 0
    case 'mask':
      return 1
    case 'persona':
      return 2
    case 'skill':
      return 3
    case 'tool-inventory':
      return 4
    case 'summary':
      return 5
    default:
      return 10
  }
}

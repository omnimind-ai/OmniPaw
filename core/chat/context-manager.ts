import type {
  ChatContextSummary,
  ChatMessage,
  ChatMessagePart,
  ChatSession,
  ContextPolicy,
  ProviderRequestSnapshot,
  ToolCallDisplay,
} from '@shared/types/chat'
import type { ProviderConfig, ProviderMessage, ProviderModel } from '@shared/types/provider'
import type { DesktopSettingsConfig } from '@shared/types/settings'
import type { SkillPromptContext } from '@shared/types/skill'
import type { AttachmentService } from './attachment-service'
import { attachmentIdFromPart } from './attachment-service'

type ContextUnitKind =
  | 'base-system'
  | 'mask'
  | 'persona'
  | 'skill'
  | 'tool-inventory'
  | 'summary'
  | 'message'
  | 'attachment'
  | 'tool-result'

type UsageSource = 'actual' | 'estimated' | 'mixed'

export interface ContextSummaryStore {
  latestUsable(sessionId: string): ChatContextSummary | undefined
}

export type ChatContextDefaults = NonNullable<DesktopSettingsConfig['app']['chatContext']>

export interface ContextBuilderOptions {
  summaries?: ContextSummaryStore
  contextDefaults?: () => ChatContextDefaults | undefined
}

export interface BuildContextInput {
  session: ChatSession
  messages: ChatMessage[]
  currentUserMessageId: string
  provider: ProviderConfig
  model: ProviderModel
  skillPrompt?: SkillPromptContext
}

export interface BuildContextResult {
  messages: ProviderMessage[]
  snapshot: ProviderRequestSnapshot
}

interface ContextBudget {
  contextWindow?: number
  reservedOutputTokens: number
  maxInputTokens: number
  usageSource: UsageSource
  compactThresholdPercent: number
  autoCompact: boolean
}

interface ContextUnit {
  id: string
  kind: ContextUnitKind
  source: string
  priority: number
  required: boolean
  messageId?: string
  messageCreatedAt?: number
  attachmentCount?: number
  estimatedTokens: number
  messages: ProviderMessage[]
}

interface ContextUnitStats {
  kind: ContextUnitKind
  selectedCount: number
  droppedCount: number
  estimatedTokens: number
}

export class ContextBuilder {
  constructor(
    private readonly attachments: AttachmentService,
    private readonly options: ContextBuilderOptions = {}
  ) {}

  async build(input: BuildContextInput): Promise<BuildContextResult> {
    const defaults = this.options.contextDefaults?.()
    const policy = normalizePolicy(input.session.contextPolicy, defaults)
    const budget = contextBudget(policy, input.model, defaults)
    const supportsSystemRole = input.model.compat?.supportsSystemRole !== false
    const eligible = eligibleMessages(input.messages)
    const latestSummary =
      policy.mode === 'summary-plus-recent'
        ? this.options.summaries?.latestUsable(input.session.id)
        : undefined
    const messagesAfterSummary = filterMessagesAfterSummary(eligible, latestSummary)
    const systemUnits = buildSystemUnits(input.session, input.skillPrompt)
    const summaryUnits = latestSummary ? [summaryUnit(latestSummary)] : []
    const messageUnits = await this.buildMessageUnits(messagesAfterSummary, input, policy, budget)
    const selection = selectContextUnits(
      [...systemUnits, ...summaryUnits, ...messageUnits],
      policy,
      budget
    )
    const providerMessages = serializeUnits(selection.selected, supportsSystemRole)
    const attachmentCount = selection.selected.reduce(
      (count, unit) => count + (unit.attachmentCount ?? 0),
      0
    )
    const estimatedInputTokens = estimateTokens(providerMessages)

    return {
      messages: providerMessages,
      snapshot: {
        api: input.provider.api ?? 'openai-chat-completions',
        baseUrlHost: hostFromUrl(input.provider.baseUrl),
        model: input.model.remoteId ?? input.model.id,
        contextPolicyMode: policy.mode,
        tokenBudget: {
          maxInputTokens: budget.maxInputTokens,
          usableInputTokens: budget.maxInputTokens,
          reservedOutputTokens: budget.reservedOutputTokens,
        },
        contextUsage: buildContextUsage(estimatedInputTokens, budget),
        contextUnits: contextUnitStats(selection.selected, selection.dropped),
        selectedCounts: countUnits(selection.selected),
        droppedCounts: countUnits(selection.dropped),
        summaryId: latestSummary?.id,
        messageCount: providerMessages.length,
        attachmentCount,
        estimatedInputTokens,
        skills: input.skillPrompt
          ? {
              enabledSkillIds: input.skillPrompt.enabledSkillIds,
              injected: input.skillPrompt.injected,
              omittedReason: input.skillPrompt.omittedReason,
            }
          : undefined,
      },
    }
  }

  private async buildMessageUnits(
    messages: ChatMessage[],
    input: BuildContextInput,
    policy: ContextPolicy,
    budget: ContextBudget
  ): Promise<ContextUnit[]> {
    const keepRecentMessages = Math.max(2, (policy.keepRecentTurns ?? 4) * 2)
    const recentIds = new Set(messages.slice(-keepRecentMessages).map((message) => message.id))
    const units: ContextUnit[] = []

    for (const message of messages) {
      const isCurrent = message.id === input.currentUserMessageId
      const isRecent = recentIds.has(message.id)
      const degraded = policy.mode !== 'recent-turns' && !isCurrent && !isRecent
      const unitMessages = await this.messageToProviderMessages(message, input, policy, {
        degraded,
        includeReasoning: !degraded,
        maxToolResultChars: degraded ? 1200 : undefined,
      })

      if (!unitMessages.length) {
        continue
      }

      const attachmentCount = countAttachmentParts(message.parts)
      units.push({
        id: `message:${message.id}`,
        kind: unitKindForMessage(message),
        source: `message:${message.role}`,
        priority: messagePriority(message, isCurrent, isRecent),
        required: isCurrent,
        messageId: message.id,
        messageCreatedAt: message.createdAt,
        attachmentCount,
        estimatedTokens: estimateTokens(unitMessages),
        messages: unitMessages,
      })
    }

    if (units.reduce((sum, unit) => sum + unit.estimatedTokens, 0) <= budget.maxInputTokens) {
      return units
    }

    return units.map((unit) => {
      if (unit.required || unit.priority >= 70) {
        return unit
      }
      const messages = trimMessageUnit(unit.messages)
      return {
        ...unit,
        messages,
        estimatedTokens: estimateTokens(messages),
      }
    })
  }

  private async messageToProviderMessages(
    message: ChatMessage,
    input: BuildContextInput,
    policy: ContextPolicy,
    options: {
      degraded: boolean
      includeReasoning: boolean
      maxToolResultChars?: number
    }
  ): Promise<ProviderMessage[]> {
    const isCurrent = message.id === input.currentUserMessageId
    const includeAttachmentPayloads =
      isCurrent || (!options.degraded && policy.includeAttachments === 'recent')
    const neverIncludeAttachments = policy.includeAttachments === 'never'

    if (message.role === 'assistant') {
      const textContent = await this.partsToProviderContent(
        message.parts.filter((part) => part.type !== 'tool_call'),
        input.model,
        includeAttachmentPayloads,
        neverIncludeAttachments
      )
      const reasoningContent = options.includeReasoning ? partsReasoningText(message.parts) : ''
      const compiledToolMessages = compileToolCallMessages(
        message.parts,
        {
          content: textContent,
          reasoningContent,
        },
        { maxToolResultChars: options.maxToolResultChars }
      )
      if (compiledToolMessages.length) {
        return compiledToolMessages
      }
    }

    const content = await this.partsToProviderContent(
      message.parts,
      input.model,
      includeAttachmentPayloads,
      neverIncludeAttachments || options.degraded
    )
    if (!hasProviderContent(content)) {
      return []
    }

    return [
      {
        role:
          message.role === 'assistant'
            ? 'assistant'
            : message.role === 'system'
              ? 'system'
              : 'user',
        content,
        reasoningContent:
          message.role === 'assistant' && options.includeReasoning
            ? partsReasoningText(message.parts)
            : undefined,
      },
    ]
  }

  private async partsToProviderContent(
    parts: ChatMessagePart[],
    model: ProviderModel,
    includeAttachmentPayloads: boolean,
    neverIncludeAttachments: boolean
  ): Promise<ProviderMessage['content']> {
    const content: Array<
      { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }
    > = []

    for (const part of parts) {
      const record = part as Record<string, unknown>
      if (part.type === 'plain' && typeof record.text === 'string') {
        content.push({ type: 'text', text: record.text })
        continue
      }
      if (part.type === 'think') {
        continue
      }

      const attachmentId = attachmentIdFromPart(part)
      if (!attachmentId) {
        continue
      }
      const attachment = this.attachments.get(attachmentId)
      if (!attachment) {
        content.push({ type: 'text', text: `[Missing attachment: ${attachmentId}]` })
        continue
      }

      if (
        includeAttachmentPayloads &&
        !neverIncludeAttachments &&
        attachment.kind === 'image' &&
        (model.input ?? ['text']).includes('image')
      ) {
        content.push({
          type: 'image_url',
          image_url: {
            url: await this.attachments.materializeImageDataUrl(attachment),
          },
        })
        continue
      }

      if (
        includeAttachmentPayloads &&
        !neverIncludeAttachments &&
        attachment.extractedTextStatus === 'complete' &&
        attachment.extractedText
      ) {
        content.push({
          type: 'text',
          text: `<attachment name="${escapeAttribute(attachment.originalName)}" mime="${escapeAttribute(attachment.mimeType)}">\n${attachment.extractedText}\n</attachment>`,
        })
        continue
      }

      content.push({
        type: 'text',
        text: `[File Attachment: name=${attachment.originalName}, mime=${attachment.mimeType}, size=${attachment.sizeBytes}]`,
      })
    }

    if (content.length === 1 && content[0]?.type === 'text') {
      return content[0].text
    }

    return content
  }
}

export class ContextManager extends ContextBuilder {
  trimToRecentTurns(messages: ChatMessage[], maxMessages = 20): ChatMessage[] {
    return messages.slice(-maxMessages)
  }
}

function normalizePolicy(
  sessionPolicy: ContextPolicy | undefined,
  defaults: ChatContextDefaults | undefined
): ContextPolicy {
  return {
    mode: sessionPolicy?.mode ?? 'recent-turns',
    maxMessages: sessionPolicy?.maxMessages ?? defaults?.recentMessages ?? 40,
    maxInputTokens: sessionPolicy?.maxInputTokens,
    keepRecentTurns: sessionPolicy?.keepRecentTurns,
    includeAttachments:
      sessionPolicy?.includeAttachments ?? defaults?.includeAttachments ?? 'current-only',
  }
}

function contextBudget(
  policy: ContextPolicy,
  model: ProviderModel,
  defaults: ChatContextDefaults | undefined
): ContextBudget {
  const contextWindow = finitePositive(model.contextWindow)
  const reservedOutputTokens = finitePositive(model.maxOutputTokens) ?? 1024
  const budgetPercent = clampPercent(defaults?.maxInputBudgetPercent ?? 75)
  const fallbackWindow = 8192
  const windowForBudget = contextWindow ?? fallbackWindow
  const modelDerivedBudget = Math.max(512, Math.floor((windowForBudget * budgetPercent) / 100))
  const maxInputTokens = Math.max(
    256,
    Math.min(
      policy.maxInputTokens ?? modelDerivedBudget,
      Math.max(256, windowForBudget - reservedOutputTokens)
    )
  )

  return {
    contextWindow,
    reservedOutputTokens,
    maxInputTokens,
    usageSource: 'estimated',
    compactThresholdPercent: clampPercent(defaults?.compactThresholdPercent ?? 70),
    autoCompact: defaults?.autoCompact ?? false,
  }
}

function eligibleMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages
    .filter((message) => ['complete', 'streaming'].includes(message.status))
    .filter(
      (message) =>
        message.role === 'system' || message.role === 'user' || message.role === 'assistant'
    )
}

function buildSystemUnits(
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
  })
  pushTextUnit(units, {
    id: 'system:persona',
    kind: 'persona',
    source: systemContext?.persona?.refId ?? 'session.persona',
    text: systemContext?.persona?.enabled === false ? undefined : systemContext?.persona?.text,
    priority: 970,
    required: true,
  })
  if (skillPrompt?.injected) {
    pushTextUnit(units, {
      id: 'system:skill',
      kind: 'skill',
      source: 'skill.inventory',
      text: skillPrompt.content,
      priority: 850,
      required: true,
    })
  }
  return units
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
  })
}

function summaryUnit(summary: ChatContextSummary): ContextUnit {
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

function filterMessagesAfterSummary(
  messages: ChatMessage[],
  summary: ChatContextSummary | undefined
): ChatMessage[] {
  if (!summary || summary.status !== 'usable') {
    return messages
  }
  if (summary.coveredToCreatedAt !== undefined) {
    const cutoff = summary.coveredToCreatedAt
    return messages.filter((message) => message.createdAt > cutoff)
  }
  if (!summary.coveredToMessageId) {
    return messages
  }
  const index = messages.findIndex((message) => message.id === summary.coveredToMessageId)
  return index >= 0 ? messages.slice(index + 1) : messages
}

function selectContextUnits(
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

function serializeUnits(units: ContextUnit[], supportsSystemRole: boolean): ProviderMessage[] {
  const providerMessages = units.flatMap((unit) => unit.messages)
  if (supportsSystemRole) {
    return mergeAdjacentSystemMessages(providerMessages)
  }

  const systemText = providerMessages
    .filter((message) => message.role === 'system')
    .map((message) => contentToText(message.content))
    .filter(Boolean)
    .join('\n\n')
  const rest = providerMessages.filter((message) => message.role !== 'system')
  if (!systemText) {
    return rest
  }
  return [{ role: 'user', content: `System instructions:\n${systemText}` }, ...rest]
}

function mergeAdjacentSystemMessages(messages: ProviderMessage[]): ProviderMessage[] {
  const output: ProviderMessage[] = []
  let pendingSystem: string[] = []
  const flushSystem = () => {
    if (!pendingSystem.length) {
      return
    }
    output.push({ role: 'system', content: pendingSystem.join('\n\n') })
    pendingSystem = []
  }

  for (const message of messages) {
    if (message.role === 'system') {
      pendingSystem.push(contentToText(message.content))
      continue
    }
    flushSystem()
    output.push(message)
  }
  flushSystem()
  return output
}

function trimMessageUnit(messages: ProviderMessage[]): ProviderMessage[] {
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

function contextUnitStats(selected: ContextUnit[], dropped: ContextUnit[]): ContextUnitStats[] {
  const stats: Partial<Record<ContextUnitKind, Omit<ContextUnitStats, 'kind'>>> = {}
  for (const unit of selected) {
    let item = stats[unit.kind]
    if (!item) {
      item = { selectedCount: 0, droppedCount: 0, estimatedTokens: 0 }
      stats[unit.kind] = item
    }
    item.selectedCount += 1
    item.estimatedTokens += unit.estimatedTokens
  }
  for (const unit of dropped) {
    let item = stats[unit.kind]
    if (!item) {
      item = { selectedCount: 0, droppedCount: 0, estimatedTokens: 0 }
      stats[unit.kind] = item
    }
    item.droppedCount += 1
    item.estimatedTokens += unit.estimatedTokens
  }
  return Object.entries(stats).map(([kind, item]) => ({ kind: kind as ContextUnitKind, ...item }))
}

function countUnits(units: ContextUnit[]): Partial<Record<ContextUnitKind, number>> {
  const counts: Partial<Record<ContextUnitKind, number>> = {}
  for (const unit of units) {
    counts[unit.kind] = (counts[unit.kind] ?? 0) + 1
  }
  return counts
}

function buildContextUsage(estimatedInputTokens: number, budget: ContextBudget) {
  return {
    source: budget.usageSource,
    estimatedInputTokens,
    contextWindowTokens: budget.contextWindow,
    budgetInputTokens: budget.maxInputTokens,
    reservedOutputTokens: budget.reservedOutputTokens,
    budgetPercent: budget.contextWindow
      ? Math.round((budget.maxInputTokens / budget.contextWindow) * 100)
      : undefined,
    windowUsagePercent: budget.contextWindow
      ? Math.min(999, Math.round((estimatedInputTokens / budget.contextWindow) * 100))
      : undefined,
    usagePercent: Math.min(999, Math.round((estimatedInputTokens / budget.maxInputTokens) * 100)),
    updatedAt: Date.now(),
  }
}

function countAttachmentParts(parts: ChatMessagePart[]): number {
  return parts.reduce((count, part) => count + (attachmentIdFromPart(part) ? 1 : 0), 0)
}

function estimateTokens(messages: ProviderMessage[]): number {
  const chars = JSON.stringify(messages).length
  return Math.ceil(chars / 4)
}

function hostFromUrl(value: string): string | undefined {
  try {
    return new URL(value).host
  } catch {
    return undefined
  }
}

function escapeAttribute(value: string): string {
  return value.replace(
    /["&<>]/g,
    (char) =>
      ({
        '"': '&quot;',
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
      })[char] ?? char
  )
}

function compileToolCallMessages(
  parts: ChatMessagePart[],
  assistantContext: Pick<ProviderMessage, 'content' | 'reasoningContent'>,
  options: { maxToolResultChars?: number } = {}
): ProviderMessage[] {
  const compiled = completedToolCalls(parts).flatMap((toolCall) => {
    const args = serializeToolArguments(toolCall.arguments ?? toolCall.args)
    const result = serializeToolResult(
      toolCall.result ?? toolCall.error,
      options.maxToolResultChars
    )
    if (!toolCall.id || !toolCall.name || args === undefined || result === undefined) {
      return []
    }

    return [
      {
        toolCall: {
          id: toolCall.id,
          type: 'function' as const,
          function: {
            name: toolCall.name,
            arguments: args,
          },
        },
        result,
      },
    ]
  })

  if (!compiled.length) {
    return []
  }

  return [
    {
      role: 'assistant',
      content: hasProviderContent(assistantContext.content) ? assistantContext.content : '',
      reasoningContent: assistantContext.reasoningContent,
      toolCalls: compiled.map((item) => item.toolCall),
    },
    ...compiled.map((item) => ({
      role: 'tool' as const,
      toolCallId: item.toolCall.id,
      content: item.result,
    })),
  ]
}

function hasProviderContent(content: ProviderMessage['content']): boolean {
  return typeof content === 'string' ? content.length > 0 : content.length > 0
}

function completedToolCalls(parts: ChatMessagePart[]): ToolCallDisplay[] {
  const calls: ToolCallDisplay[] = []
  for (const part of parts) {
    if (part.type !== 'tool_call') {
      continue
    }
    const toolCalls = (part.tool_calls ?? part.toolCalls ?? []) as ToolCallDisplay[]
    for (const toolCall of toolCalls) {
      if (
        toolCall.status === 'complete' ||
        toolCall.status === 'denied' ||
        toolCall.status === 'error'
      ) {
        calls.push(toolCall)
      }
    }
  }
  return calls
}

function serializeToolArguments(value: unknown): string | undefined {
  if (value === undefined) {
    return '{}'
  }
  if (typeof value === 'string') {
    return value
  }
  try {
    return JSON.stringify(value)
  } catch {
    return undefined
  }
}

function serializeToolResult(value: unknown, maxChars?: number): string | undefined {
  if (value === undefined || value === null) {
    return undefined
  }
  if (typeof value === 'string') {
    return maxChars ? softTrim(value, maxChars) : value
  }
  try {
    const serialized = JSON.stringify(value)
    return maxChars ? softTrim(serialized, maxChars) : serialized
  } catch {
    return String(value)
  }
}

function softTrim(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value
  }
  const half = Math.max(100, Math.floor((maxChars - 80) / 2))
  return `${value.slice(0, half)}\n\n[...trimmed ${value.length - half * 2} chars...]\n\n${value.slice(-half)}`
}

function unitKindForMessage(message: ChatMessage): ContextUnitKind {
  return message.parts.some((part) => part.type === 'tool_call') ? 'tool-result' : 'message'
}

function messagePriority(message: ChatMessage, isCurrent: boolean, isRecent: boolean): number {
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

function contentToText(content: ProviderMessage['content']): string {
  if (typeof content === 'string') {
    return content
  }
  return content
    .map((part) => {
      if (part.type === 'text') {
        return part.text
      }
      if (part.type === 'image_url') {
        return '[Image attachment]'
      }
      return '[Attachment]'
    })
    .join('\n')
}

function finitePositive(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : undefined
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 75
  }
  return Math.max(1, Math.min(95, Math.round(value)))
}

function partsReasoningText(parts: ChatMessagePart[]): string | undefined {
  const text = parts
    .filter((part): part is Extract<ChatMessagePart, { type: 'think' }> => part.type === 'think')
    .map((part) => part.think)
    .join('')
    .trim()
  return text || undefined
}

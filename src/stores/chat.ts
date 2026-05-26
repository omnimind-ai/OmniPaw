import type { Session, ToolProfile } from '@shared/types/chat'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  appBridge,
  type BridgeChatMessage,
  type BridgeChatSession,
  type BridgeContextUsageMetadata,
  type BridgeStreamEvent,
} from '@/bridge/app'

export interface PendingInitialMessagePart {
  type: string
  [key: string]: unknown
}

export interface PendingInitialMessage {
  sessionId: string
  messageId: string
  parts: PendingInitialMessagePart[]
  selectedProvider: string
  selectedModel: string
  toolProfile?: ToolProfile
}

export interface SessionContextUsage {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  windowTokens?: number
  budgetTokens?: number
  windowPercentage?: number
  percentage?: number
  source?: string
  updatedAt?: number
}

const SIDEBAR_STATE_COOKIE = 'sidebar_state'

function getInitialSidebarOpen(): boolean {
  if (typeof document === 'undefined') return true
  return !document.cookie.includes(`${SIDEBAR_STATE_COOKIE}=false`)
}

export const useChatStore = defineStore('chat', () => {
  const sessions = ref<Session[]>([])
  const activeSessionId = ref<string>()
  const pendingInitialMessage = ref<PendingInitialMessage | null>(null)
  const draft = ref('')
  const streamingText = ref('')
  const isStreaming = ref(false)
  const sidebarOpen = ref(getInitialSidebarOpen())
  const contextUsageBySession = ref<Record<string, SessionContextUsage | undefined>>({})
  const contextUsageLoadingBySession = ref<Record<string, boolean | undefined>>({})

  const activeSession = computed(() =>
    sessions.value.find((session) => session.id === activeSessionId.value)
  )
  const activeContextUsage = computed(() =>
    activeSessionId.value ? contextUsageBySession.value[activeSessionId.value] : undefined
  )
  const activeContextUsageLoading = computed(() =>
    activeSessionId.value
      ? Boolean(contextUsageLoadingBySession.value[activeSessionId.value])
      : false
  )

  async function loadSessions(): Promise<void> {
    const loaded = await appBridge.chat.listSessions()
    sessions.value = loaded as Session[]
    activeSessionId.value ??= sessions.value[0]?.id
    reconcileContextUsageFromSessions(sessions.value)
  }

  async function createSession(): Promise<void> {
    const session = await appBridge.chat.createSession()
    sessions.value.unshift(session as Session)
    activeSessionId.value = session.id
  }

  async function sendDraft(): Promise<void> {
    const content = draft.value.trim()

    if (!content || !activeSessionId.value || isStreaming.value) {
      return
    }

    draft.value = ''
    streamingText.value = ''
    isStreaming.value = true

    await appBridge.chat.sendMessage({
      sessionId: activeSessionId.value,
      content,
    })
  }

  function appendToken(token: string): void {
    streamingText.value += token
  }

  function finishStream(): void {
    isStreaming.value = false
  }

  function setSidebarOpen(open: boolean): void {
    sidebarOpen.value = open
  }

  function setContextUsageLoading(sessionId: string, loading: boolean): void {
    if (!sessionId) return
    contextUsageLoadingBySession.value = {
      ...contextUsageLoadingBySession.value,
      [sessionId]: loading,
    }
  }

  function setSessionContextUsage(
    sessionId: string,
    usage: SessionContextUsage | BridgeContextUsageMetadata | undefined,
    options: { loading?: boolean } = {}
  ): void {
    if (!sessionId) return
    const normalized = normalizeContextUsage(usage)
    contextUsageBySession.value = {
      ...contextUsageBySession.value,
      [sessionId]: normalized ?? contextUsageBySession.value[sessionId],
    }
    if (options.loading !== undefined) {
      setContextUsageLoading(sessionId, options.loading)
    }
  }

  function clearSessionContextUsage(sessionId: string): void {
    if (!sessionId) return
    contextUsageBySession.value = {
      ...contextUsageBySession.value,
      [sessionId]: undefined,
    }
    setContextUsageLoading(sessionId, false)
  }

  function reconcileContextUsageFromSessions(
    nextSessions: Array<Session | BridgeChatSession>
  ): void {
    const nextUsage = { ...contextUsageBySession.value }
    for (const session of nextSessions) {
      const usage = extractContextUsage(session)
      if (usage) nextUsage[session.id] = usage
    }
    contextUsageBySession.value = nextUsage
  }

  function updateContextUsageFromStreamEvent(event: BridgeStreamEvent): void {
    const usage = extractContextUsage(event)
    if (usage) {
      setSessionContextUsage(event.sessionId, usage, {
        loading: event.type === 'started' ? true : !isTerminalUsageEvent(event.type),
      })
      return
    }
    if (event.type === 'started') {
      setContextUsageLoading(event.sessionId, true)
    } else if (isTerminalUsageEvent(event.type)) {
      setContextUsageLoading(event.sessionId, false)
    }
  }

  function updateContextUsageFromMessages(
    sessionId: string,
    messages: BridgeChatMessage[] | Array<Record<string, unknown>>
  ): void {
    const latest = [...messages].reverse().map(extractContextUsage).find(Boolean)
    if (latest) {
      setSessionContextUsage(sessionId, latest, { loading: false })
    } else {
      setContextUsageLoading(sessionId, false)
    }
  }

  function setPendingInitialMessage(message: PendingInitialMessage): void {
    pendingInitialMessage.value = message
  }

  function consumePendingInitialMessage(sessionId: string): PendingInitialMessage | null {
    if (pendingInitialMessage.value?.sessionId !== sessionId) {
      return null
    }

    const message = pendingInitialMessage.value
    pendingInitialMessage.value = null
    return message
  }

  return {
    sessions,
    activeSessionId,
    pendingInitialMessage,
    activeSession,
    draft,
    streamingText,
    isStreaming,
    sidebarOpen,
    contextUsageBySession,
    contextUsageLoadingBySession,
    activeContextUsage,
    activeContextUsageLoading,
    loadSessions,
    createSession,
    sendDraft,
    appendToken,
    finishStream,
    setSidebarOpen,
    setContextUsageLoading,
    setSessionContextUsage,
    clearSessionContextUsage,
    reconcileContextUsageFromSessions,
    updateContextUsageFromStreamEvent,
    updateContextUsageFromMessages,
    setPendingInitialMessage,
    consumePendingInitialMessage,
  }
})

function isTerminalUsageEvent(type: string): boolean {
  return type === 'final' || type === 'error' || type === 'aborted' || type === 'compact_retry'
}

function extractContextUsage(value: unknown): SessionContextUsage | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const directUsage = normalizeContextUsage(record.usage)
  const metadataUsage =
    normalizeContextUsage(nested(record.metadata, 'contextUsage')) ??
    normalizeContextUsage(nested(record.metadata, 'context_usage'))

  if (directUsage && metadataUsage) {
    return normalizeContextUsage({
      ...metadataUsage,
      ...directUsage,
      windowTokens: directUsage.windowTokens ?? metadataUsage.windowTokens,
      contextWindowTokens: directUsage.windowTokens ?? metadataUsage.windowTokens,
      budgetTokens: directUsage.budgetTokens ?? metadataUsage.budgetTokens,
      budgetInputTokens: directUsage.budgetTokens ?? metadataUsage.budgetTokens,
      windowPercentage: directUsage.windowPercentage ?? metadataUsage.windowPercentage,
      percentage: directUsage.percentage ?? metadataUsage.percentage,
      source: directUsage.source ?? metadataUsage.source,
      updatedAt: directUsage.updatedAt ?? metadataUsage.updatedAt,
    })
  }

  const candidates = [
    record.contextUsage,
    record.context_usage,
    nested(record.metadata, 'contextUsage'),
    nested(record.metadata, 'context_usage'),
    nested(record.metadata, 'latestContextUsage'),
    nested(record.usage, 'context'),
    nested(record.usage, 'contextUsage'),
    nested(record.requestSnapshot, 'contextUsage'),
    nested(record.requestSnapshot, 'context_usage'),
    record.requestSnapshot,
    record.usage,
  ]

  for (const candidate of candidates) {
    const normalized = normalizeContextUsage(candidate)
    if (normalized) return normalized
  }
  return undefined
}

function normalizeContextUsage(value: unknown): SessionContextUsage | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const inputTokens = firstNumber(record.inputTokens, record.input, record.estimatedInputTokens)
  const outputTokens = firstNumber(record.outputTokens, record.output)
  const totalTokens = firstNumber(record.totalTokens, record.total)
  const windowTokens = firstNumber(
    record.windowTokens,
    record.contextWindowTokens,
    record.contextWindow
  )
  const budgetTokens = firstNumber(
    record.budgetTokens,
    record.budgetInputTokens,
    record.maxInputTokens,
    nested(record.tokenBudget, 'usableInputTokens'),
    nested(record.tokenBudget, 'maxInputTokens')
  )
  const derivedWindowPercentage =
    inputTokens !== undefined && windowTokens ? (inputTokens / windowTokens) * 100 : undefined
  const rawWindowPercentage = normalizePercentage(
    firstNumber(record.windowPercentage, record.windowUsagePercent, record.windowPercent)
  )
  const windowPercentage =
    derivedWindowPercentage !== undefined ? derivedWindowPercentage : rawWindowPercentage
  const derivedPercentage =
    inputTokens !== undefined && budgetTokens ? (inputTokens / budgetTokens) * 100 : undefined
  const rawPercentage = normalizePercentage(
    firstNumber(record.percentage, record.percent, record.usagePercent)
  )
  const percentage = derivedPercentage !== undefined ? derivedPercentage : rawPercentage
  const source = firstString(record.source, record.usageSource, record.usage_source)
  const updatedAt = firstNumber(record.updatedAt, record.lastUpdatedAt, record.createdAt)

  if (
    inputTokens === undefined &&
    outputTokens === undefined &&
    totalTokens === undefined &&
    windowTokens === undefined &&
    budgetTokens === undefined &&
    windowPercentage === undefined &&
    percentage === undefined
  ) {
    return undefined
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    windowTokens,
    budgetTokens,
    windowPercentage,
    percentage,
    source,
    updatedAt,
  }
}

function nested(value: unknown, key: string): unknown {
  return value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined
}

function firstNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return undefined
}

function normalizePercentage(value: number | undefined): number | undefined {
  if (value === undefined) return undefined
  return value > 0 && value < 1 ? value * 100 : value
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value
  }
  return undefined
}

import { createHash } from 'node:crypto'
import { normalizeProviderError } from '@core/provider/errors'
import type { ProviderManager } from '@core/provider/manager'
import type { ChatMessage, ChatRun, ChatSession, MessageRole } from '@shared/types/chat'
import type {
  CompanionMemoryAttribution,
  CompanionMemoryExtractionDiagnostics,
  CompanionMemoryKind,
  CompanionMemoryScope,
  CompanionMemorySemanticCandidate,
} from '@shared/types/memory'

export interface SemanticMemoryExtractorInput {
  run: ChatRun
  session?: ChatSession
  messages: ChatMessage[]
  observationDate: Date
  timeoutMs?: number
}

export interface SemanticMemoryExtractorResult {
  candidates: CompanionMemorySemanticCandidate[]
  diagnostics: CompanionMemoryExtractionDiagnostics
}

const memoryKinds: CompanionMemoryKind[] = [
  'profile',
  'preference',
  'relationship',
  'episode',
  'plan',
  'boundary',
  'fact',
]
const memoryScopes: CompanionMemoryScope[] = ['global', 'user', 'companion', 'session', 'character']
const attributions: CompanionMemoryAttribution[] = ['user-stated', 'assistant-provided', 'mixed']

export class CompanionMemorySemanticExtractor {
  constructor(private readonly providers: ProviderManager) {}

  async extract(input: SemanticMemoryExtractorInput): Promise<SemanticMemoryExtractorResult> {
    const startedAt = Date.now()
    const resolved = await this.providers.resolveDefaultProvider(input.run.sessionId)
    const client = await this.providers.createProviderClient(resolved.provider.id)
    const timeoutMs = Math.max(3_000, Math.min(input.timeoutMs ?? 20_000, 60_000))
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const text = await collectProviderText(
        client.streamChat({
          modelId: resolved.modelId,
          maxOutputTokens: 1200,
          temperature: 0,
          abortSignal: controller.signal,
          messages: [
            {
              role: 'system',
              content: buildSystemPrompt(input.observationDate),
            },
            {
              role: 'user',
              content: buildUserPrompt(input),
            },
          ],
        })
      )
      const parsed = parseCandidates(text)
      const validated = validateSemanticCandidates(parsed, input.messages, input.observationDate)
      return {
        candidates: validated.accepted,
        diagnostics: {
          extractor: 'semantic',
          modelId: resolved.modelId,
          candidateCount: parsed.length,
          acceptedCount: validated.accepted.length,
          rejectedCount: validated.rejections.length,
          hashes: validated.accepted.map((candidate) => hashText(candidate.content)),
          rejections: validated.rejections,
          durationMs: Date.now() - startedAt,
        },
      }
    } catch (error) {
      const normalized = normalizeProviderError(error)
      throw new SemanticExtractionError(normalized.code, normalized.message)
    } finally {
      clearTimeout(timeout)
    }
  }
}

export class SemanticExtractionError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
    this.name = 'SemanticExtractionError'
  }
}

export function validateSemanticCandidates(
  rawCandidates: unknown[],
  messages: ChatMessage[],
  observationDate: Date
): {
  accepted: CompanionMemorySemanticCandidate[]
  rejections: CompanionMemoryExtractionDiagnostics['rejections']
} {
  const allowedIds = new Set(messages.map((message) => message.id))
  const rejections: CompanionMemoryExtractionDiagnostics['rejections'] = []
  const accepted: CompanionMemorySemanticCandidate[] = []
  const seen = new Set<string>()

  rawCandidates.forEach((raw, index) => {
    const candidate = normalizeCandidate(raw)
    const hash = candidate ? hashText(candidate.content) : undefined
    const reject = (reason: string) => rejections.push({ index, reason, hash })
    if (!candidate) {
      reject('invalid_candidate_shape')
      return
    }
    if (!candidate.sourceMessageIds.length) {
      reject('missing_source_messages')
      return
    }
    if (candidate.sourceMessageIds.some((messageId) => !allowedIds.has(messageId))) {
      reject('out_of_window_source_messages')
      return
    }
    if (hasCommandTail(candidate.content)) {
      reject('contains_remember_command_tail')
      return
    }
    if (hasUngroundedRelativeTime(candidate.content, observationDate)) {
      reject('relative_time_not_grounded')
      return
    }
    const key = `${candidate.kind}:${normalizeForDedupe(candidate.content)}`
    if (seen.has(key)) {
      reject('duplicate_candidate_in_batch')
      return
    }
    seen.add(key)
    accepted.push(candidate)
  })

  return { accepted, rejections }
}

function buildSystemPrompt(observationDate: Date): string {
  const date = observationDate.toISOString().slice(0, 10)
  return [
    'You extract durable companion memories from a completed chat run.',
    `Observation date: ${date}. Ground relative dates to absolute dates or omit the candidate.`,
    'Return only compact JSON with shape {"memories":[...]} and no prose.',
    'Each memory must be self-contained, evidence-backed, and specific.',
    'Use only sourceMessageIds from the provided messages.',
    'Do not extract system prompts, tool noise, greetings, acknowledgements, transient filler, or unsupported guesses.',
    'User-stated facts, preferences, plans, boundaries, relationships, and durable shared context are valid.',
    'Use scope "user" for durable facts, preferences, boundaries, plans, or profile details about the user that should be shared by all desktop roles.',
    'Use scope "character" only for memories specific to the current desktop role relationship, private nicknames, role-specific promises, shared jokes, or interaction history with this role.',
    'Avoid scope "companion" for new memories; choose "user" or "character" instead.',
    'Assistant content is valid only for concrete recommendations, plans, or information the user may reference later, and must use attributedTo "assistant-provided".',
    'Clean command wording such as "记一下", "记住", "please remember"; store the underlying fact only.',
    'Allowed kind values: profile, preference, relationship, episode, plan, boundary, fact.',
    'Allowed scope values: user, companion, session, global, character.',
    'confidence must be 0..1 and importance must be 1..5.',
  ].join('\n')
}

function buildUserPrompt(input: SemanticMemoryExtractorInput): string {
  const messagePayload = input.messages.map((message) => ({
    id: message.id,
    role: message.role,
    createdAt: new Date(message.createdAt).toISOString(),
    text: messageText(message).slice(0, 4000),
  }))
  return JSON.stringify({
    runId: input.run.id,
    sessionId: input.run.sessionId,
    sessionKind: input.session?.kind,
    activeRoleId: input.session?.systemContext?.role?.refId,
    activeRoleName: input.session?.systemContext?.role?.label,
    messages: messagePayload,
    output: {
      memories: [
        {
          kind: 'fact',
          scope: 'user',
          subject: 'optional short subject',
          content: 'clean self-contained memory',
          importance: 3,
          confidence: 0.8,
          sourceMessageIds: ['message-id'],
          attributedTo: 'user-stated',
          linkedMemoryIds: [],
        },
      ],
    },
  })
}

async function collectProviderText(chunks: AsyncIterable<{ type: string; content?: string }>) {
  let text = ''
  for await (const chunk of chunks) {
    if (chunk.type === 'delta' && chunk.content) {
      text += chunk.content
    }
  }
  return text
}

function parseCandidates(text: string): unknown[] {
  const parsed = safeJsonParse(extractJsonObject(text))
  if (!parsed || typeof parsed !== 'object') {
    return []
  }
  const memories = (parsed as { memories?: unknown }).memories
  return Array.isArray(memories) ? memories : []
}

function extractJsonObject(text: string): string {
  const trimmed = text.trim()
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed
  }
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  return start >= 0 && end > start ? trimmed.slice(start, end + 1) : '{}'
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function normalizeCandidate(raw: unknown): CompanionMemorySemanticCandidate | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined
  }
  const value = raw as Record<string, unknown>
  const kind = typeof value.kind === 'string' ? value.kind : 'fact'
  const scope = typeof value.scope === 'string' ? value.scope : undefined
  const content = cleanMemoryContent(String(value.content ?? ''))
  const importance = Number(value.importance ?? 3)
  const confidence = Number(value.confidence ?? 0)
  const sourceMessageIds = Array.isArray(value.sourceMessageIds)
    ? value.sourceMessageIds.filter((item): item is string => typeof item === 'string')
    : []
  const attributedTo =
    typeof value.attributedTo === 'string' && attributions.includes(value.attributedTo as never)
      ? (value.attributedTo as CompanionMemoryAttribution)
      : 'user-stated'
  if (
    !memoryKinds.includes(kind as CompanionMemoryKind) ||
    (scope && !memoryScopes.includes(scope as CompanionMemoryScope)) ||
    !content ||
    !Number.isFinite(importance) ||
    importance < 1 ||
    importance > 5 ||
    !Number.isFinite(confidence) ||
    confidence < 0 ||
    confidence > 1
  ) {
    return undefined
  }
  return {
    kind: kind as CompanionMemoryKind,
    scope: scope as CompanionMemoryScope | undefined,
    subject: typeof value.subject === 'string' ? value.subject.trim() || undefined : undefined,
    content,
    importance: Math.round(importance),
    confidence,
    sourceMessageIds,
    attributedTo,
    linkedMemoryIds: Array.isArray(value.linkedMemoryIds)
      ? value.linkedMemoryIds.filter((item): item is string => typeof item === 'string')
      : undefined,
    metadata: isRecord(value.metadata) ? value.metadata : undefined,
  }
}

export function cleanMemoryContent(content: string): string {
  return content
    .trim()
    .replace(/^(?:请你?|麻烦)?(?:记一下|记住|记得|remember that|please remember)[:：,\s]*/i, '')
    .replace(/(?:，|,)?\s*(?:请记住|帮我记一下|remember this)\s*$/i, '')
    .trim()
}

function hasCommandTail(content: string): boolean {
  return /(?:记一下|记住|请记住|please remember|remember this)\s*$/i.test(content)
}

function hasUngroundedRelativeTime(content: string, observationDate: Date): boolean {
  const hasRelative =
    /(?:昨天|前天|明天|后天|上周|下周|上个月|下个月|recently|yesterday|tomorrow|next month|last week)/i.test(
      content
    )
  if (!hasRelative) {
    return false
  }
  const year = observationDate.getFullYear()
  return !new RegExp(String(year)).test(content) && !/\d{4}[-/年]\d{1,2}/.test(content)
}

function messageText(message: ChatMessage): string {
  return message.parts
    .map((part) =>
      part && typeof part === 'object' && part.type === 'plain'
        ? String((part as { text?: unknown }).text ?? '')
        : ''
    )
    .filter(Boolean)
    .join('\n')
}

function normalizeForDedupe(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim()
}

function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 24)
}

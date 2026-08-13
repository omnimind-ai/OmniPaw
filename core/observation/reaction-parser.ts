import type { ObservationDecision, ObservationReactionCandidate } from '@shared/types/observation'

export function parseObservationReactionCandidate(raw: string): ObservationReactionCandidate {
  const parsed = parseReactionObject(raw)
  if (parsed) {
    const mode = parsed.mode ?? parsed.decision
    return {
      text: sanitizeObservationReactionText(parsed.text),
      decision: normalizeObservationDecision(mode),
      reason: typeof parsed.reason === 'string' ? parsed.reason : undefined,
      summary: typeof parsed.summary === 'string' ? parsed.summary : undefined,
    }
  }

  const text = extractReactionTextField(raw)
  if (text !== undefined) {
    return { text: sanitizeObservationReactionText(text), decision: 'notify' }
  }

  return { text: sanitizeObservationReactionText(raw), decision: 'notify' }
}

export function sanitizeObservationReactionText(value: unknown): string {
  if (typeof value !== 'string') return ''
  return (
    truncateObservationText(
      value
        .replace(/\p{Cc}/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
      240
    ) ?? ''
  )
}

export function normalizeObservationDecision(value: unknown): ObservationDecision {
  if (value === 'ask') return 'ask'
  if (value === 'notify' || value === 'ambient' || value === 'chat') return 'notify'
  return 'silent'
}

export function truncateObservationText(
  value: string | undefined,
  maxLength: number
): string | undefined {
  if (!value) return undefined
  return value.length > maxLength ? value.slice(0, maxLength).trimEnd() : value
}

function parseReactionObject(value: string): Record<string, unknown> | undefined {
  for (const candidate of extractJsonObjects(value)) {
    try {
      const parsed = JSON.parse(candidate) as unknown
      if (isReactionObject(parsed)) {
        return parsed
      }
    } catch {
      // Continue scanning because model analysis can contain unrelated brace pairs.
    }
  }
  return undefined
}

function extractJsonObjects(value: string): string[] {
  const objects: string[] = []
  let start = -1
  let depth = 0
  let inString = false
  let escaped = false

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (character === '\\') {
        escaped = true
      } else if (character === '"') {
        inString = false
      }
      continue
    }
    if (character === '"') {
      inString = true
      continue
    }
    if (character === '{') {
      if (depth === 0) start = index
      depth += 1
      continue
    }
    if (character === '}' && depth > 0) {
      depth -= 1
      if (depth === 0 && start >= 0) {
        objects.push(value.slice(start, index + 1))
        start = -1
      }
    }
  }

  return objects
}

function isReactionObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    ('text' in value || 'mode' in value || 'decision' in value)
  )
}

function extractReactionTextField(value: string): string | undefined {
  const match = /["']text["']\s*:\s*(["'])(?<text>(?:\\.|(?!\1)[\s\S])*)\1/iu.exec(value)
  if (!match?.groups) return undefined

  const quote = match[1]
  const text = match.groups.text
  if (quote === '"') {
    try {
      return JSON.parse(`"${text}"`) as string
    } catch {
      return text
    }
  }
  return text.replace(/\\'/g, "'").replace(/\\\\/g, '\\')
}

import type {
  TavernCharacterDraft,
  TavernLorebookDraft,
  TavernLorebookEntryDraft,
  TavernSourceMetadata,
} from '@shared/types/tavern'
import { TavernRegistryValidationError, tavernRegistryError } from './registry-schema'
import { hashSensitiveText } from './template'

export interface ParsedTavernCharacterImport {
  character: TavernCharacterDraft
  lorebooks: TavernLorebookDraft[]
  source: TavernSourceMetadata
}

export function parseSillyTavernCharacterJson(
  content: string,
  sourceName?: string
): ParsedTavernCharacterImport {
  let parsed: unknown
  try {
    parsed = JSON.parse(content) as unknown
  } catch {
    throw new TavernRegistryValidationError(
      tavernRegistryError('invalid_json', 'Character card JSON is invalid.', {
        recoverable: false,
      })
    )
  }

  const root = asRecord(parsed)
  const data = asRecord(root?.data) ?? root
  if (!data) {
    throwUnsupportedImport()
  }

  const name = pickString(data, ['name', 'char_name'])
  const description = pickString(data, ['description', 'desc'])
  const personality = pickString(data, ['personality', 'personality_summary'])
  const scenario = pickString(data, ['scenario'])
  const firstMessage = pickString(data, ['first_mes', 'firstMessage', 'greeting'])
  const messageExamples = normalizeExamples(
    pickString(data, ['mes_example', 'message_example', 'messageExamples'])
  )
  const systemPrompt = pickString(data, ['system_prompt', 'systemPrompt', 'system'])
  const postHistoryInstructions = pickString(data, [
    'post_history_instructions',
    'postHistoryInstructions',
    'post_history',
  ])
  const alternateGreetings = stringArray(data.alternate_greetings ?? data.alternateGreetings)
  const tags = stringArray(data.tags)

  if (!name && !description && !personality && !scenario && !firstMessage) {
    throwUnsupportedImport()
  }

  const character: TavernCharacterDraft = {
    name: name || sourceName?.replace(/\.json$/i, '') || 'Imported character',
    description,
    personality,
    scenario,
    systemPrompt,
    postHistoryInstructions,
    firstMessage,
    alternateGreetings,
    messageExamples,
    tags,
    enabled: true,
  }

  const lorebooks = extractLorebooks(data, character.name)
  return {
    character,
    lorebooks,
    source: {
      kind: 'sillytavern-json',
      version: pickString(root, ['spec', 'spec_version']) || pickString(data, ['spec', 'version']),
      importedAt: Date.now(),
      sourceName,
      contentHash: hashSensitiveText(content),
    },
  }
}

function extractLorebooks(
  data: Record<string, unknown>,
  characterName: string
): TavernLorebookDraft[] {
  const candidates = [
    data.character_book,
    data.characterBook,
    data.lorebook,
    data.world_book,
    data.worldBook,
  ]
  const lorebooks: TavernLorebookDraft[] = []
  for (const candidate of candidates) {
    const book = asRecord(candidate)
    if (!book) continue
    const entries = extractEntries(book)
    if (!entries.length) continue
    lorebooks.push({
      name: pickString(book, ['name']) || `${characterName} lorebook`,
      description: pickString(book, ['description']),
      enabled: true,
      entries,
    })
  }
  return lorebooks
}

function extractEntries(book: Record<string, unknown>): TavernLorebookEntryDraft[] {
  const rawEntries = Array.isArray(book.entries) ? book.entries : []
  return rawEntries
    .map((entry, index) => normalizeEntry(asRecord(entry), index))
    .filter((entry): entry is TavernLorebookEntryDraft => Boolean(entry))
}

function normalizeEntry(
  entry: Record<string, unknown> | undefined,
  index: number
): TavernLorebookEntryDraft | undefined {
  if (!entry) {
    return undefined
  }
  const content = pickString(entry, ['content', 'text'])
  const keys = normalizeKeys(entry.keys ?? entry.key)
  const secondaryKeys = normalizeKeys(entry.secondary_keys ?? entry.secondaryKeys)
  const constant = entry.constant === true
  if (!content || (!constant && !keys.length)) {
    return undefined
  }
  return {
    enabled: entry.enabled !== false && entry.disable !== true,
    keys,
    secondaryKeys,
    content,
    constant,
    selective: entry.selective === true,
    priority: numberValue(entry.priority, 0),
    order: numberValue(entry.insertion_order ?? entry.order, index),
    position: normalizePosition(entry.position),
    tokenBudget: positiveNumber(entry.token_budget ?? entry.tokenBudget),
  }
}

function normalizeExamples(value: string | undefined): string[] {
  if (!value) {
    return []
  }
  return value
    .split(/<START>/gi)
    .map((item) => item.trim())
    .filter(Boolean)
}

function normalizeKeys(value: unknown): string[] {
  return stringArray(value)
    .flatMap((item) => item.split(','))
    .map((item) => item.trim())
    .filter(Boolean)
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)
  }
  if (typeof value === 'string' && value.trim()) {
    return [value.trim()]
  }
  return []
}

function pickString(
  record: Record<string, unknown> | undefined,
  keys: string[]
): string | undefined {
  if (!record) {
    return undefined
  }
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return undefined
}

function normalizePosition(value: unknown): 'after-character' | 'before-history' {
  if (value === 'before-history' || value === 'before_char' || value === 0) {
    return 'before-history'
  }
  return 'after-character'
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : undefined
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function throwUnsupportedImport(): never {
  throw new TavernRegistryValidationError(
    tavernRegistryError('import_failed', 'JSON is not a supported SillyTavern character card.', {
      recoverable: false,
    })
  )
}

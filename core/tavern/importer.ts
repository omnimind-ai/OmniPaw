import { inflateSync } from 'node:zlib'
import type {
  ImportTavernCharacterRequest,
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

export function parseSillyTavernCharacterImport(
  request: ImportTavernCharacterRequest
): ParsedTavernCharacterImport {
  const sourceKind = resolveSourceKind(request)
  if (sourceKind === 'json') {
    return parseSillyTavernCharacterJson(request.content ?? '', request.sourceName, {
      mimeType: request.mimeType,
    })
  }
  const data = decodeImportBytes(request)
  const payload =
    sourceKind === 'png' ? extractPngCharacterPayload(data) : extractWebpCharacterPayload(data)
  const parsed = parseSillyTavernCharacterJson(payload, request.sourceName, {
    sourceKind,
    mimeType: request.mimeType,
    sourceContent: payload,
  })
  return {
    ...parsed,
    source: {
      ...parsed.source,
      kind: sourceKind === 'png' ? 'sillytavern-png' : 'sillytavern-webp',
      mimeType: request.mimeType,
      sourceName: request.sourceName,
      contentHash: hashSensitiveText(payload),
    },
  }
}

export function parseSillyTavernCharacterJson(
  content: string,
  sourceName?: string,
  options: {
    sourceKind?: 'json' | 'png' | 'webp'
    mimeType?: string
    sourceContent?: string
  } = {}
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
      mimeType: options.mimeType,
      contentHash: hashSensitiveText(options.sourceContent ?? content),
    },
  }
}

function resolveSourceKind(request: ImportTavernCharacterRequest): 'json' | 'png' | 'webp' {
  if (request.sourceKind) return request.sourceKind
  const mime = request.mimeType?.toLocaleLowerCase()
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  const name = request.sourceName?.toLocaleLowerCase() ?? ''
  if (name.endsWith('.png')) return 'png'
  if (name.endsWith('.webp')) return 'webp'
  return 'json'
}

function decodeImportBytes(request: ImportTavernCharacterRequest): Buffer {
  const encoded = request.dataBase64?.trim()
  if (!encoded) {
    throw new TavernRegistryValidationError(
      tavernRegistryError('invalid_metadata', 'Character image import data is missing.', {
        recoverable: false,
        issues: [
          {
            path: 'dataBase64',
            message: 'Image import requires base64 encoded file data.',
            code: 'required',
          },
        ],
      })
    )
  }
  try {
    return Buffer.from(encoded, 'base64')
  } catch {
    throwInvalidMetadata('Image import data is not valid base64.')
  }
}

function extractPngCharacterPayload(data: Buffer): string {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (data.length < signature.length || !data.subarray(0, signature.length).equals(signature)) {
    throwInvalidMetadata('PNG character card metadata is invalid.')
  }
  let offset = 8
  while (offset + 12 <= data.length) {
    const length = data.readUInt32BE(offset)
    const type = data.subarray(offset + 4, offset + 8).toString('ascii')
    const chunk = data.subarray(offset + 8, offset + 8 + length)
    if (type === 'tEXt') {
      const payload = pngTextPayload(chunk)
      if (payload) return payload
    } else if (type === 'zTXt') {
      const payload = pngCompressedTextPayload(chunk)
      if (payload) return payload
    } else if (type === 'iTXt') {
      const payload = pngInternationalTextPayload(chunk)
      if (payload) return payload
    }
    offset += 12 + length
  }
  throwUnsupportedMetadata('PNG image does not contain SillyTavern character metadata.')
}

function pngTextPayload(chunk: Buffer): string | undefined {
  const separator = chunk.indexOf(0)
  if (separator <= 0) return undefined
  const keyword = chunk.subarray(0, separator).toString('latin1')
  if (keyword !== 'chara') return undefined
  return decodeSillyTavernMetadataValue(chunk.subarray(separator + 1).toString('utf8'))
}

function pngCompressedTextPayload(chunk: Buffer): string | undefined {
  const keywordEnd = chunk.indexOf(0)
  if (keywordEnd <= 0 || chunk.subarray(0, keywordEnd).toString('latin1') !== 'chara') {
    return undefined
  }
  const compressionMethod = chunk[keywordEnd + 1]
  if (compressionMethod !== 0) return undefined
  try {
    return decodeSillyTavernMetadataValue(
      inflateSync(chunk.subarray(keywordEnd + 2)).toString('utf8')
    )
  } catch {
    throwInvalidMetadata('PNG character metadata is compressed but invalid.')
  }
}

function pngInternationalTextPayload(chunk: Buffer): string | undefined {
  const keywordEnd = chunk.indexOf(0)
  if (keywordEnd <= 0 || chunk.subarray(0, keywordEnd).toString('latin1') !== 'chara') {
    return undefined
  }
  const compressionFlag = chunk[keywordEnd + 1]
  const compressionMethod = chunk[keywordEnd + 2]
  let offset = keywordEnd + 3
  for (let index = 0; index < 2; index += 1) {
    const end = chunk.indexOf(0, offset)
    if (end < 0) return undefined
    offset = end + 1
  }
  const payload = chunk.subarray(offset)
  if (compressionFlag === 1 && compressionMethod === 0) {
    try {
      return decodeSillyTavernMetadataValue(inflateSync(payload).toString('utf8'))
    } catch {
      throwInvalidMetadata('PNG character metadata is compressed but invalid.')
    }
  }
  return decodeSillyTavernMetadataValue(payload.toString('utf8'))
}

function extractWebpCharacterPayload(data: Buffer): string {
  if (data.length < 12 || data.subarray(0, 4).toString('ascii') !== 'RIFF') {
    throwInvalidMetadata('WebP character card metadata is invalid.')
  }
  if (data.subarray(8, 12).toString('ascii') !== 'WEBP') {
    throwInvalidMetadata('WebP character card metadata is invalid.')
  }
  let offset = 12
  while (offset + 8 <= data.length) {
    const type = data.subarray(offset, offset + 4).toString('ascii')
    const length = data.readUInt32LE(offset + 4)
    const chunk = data.subarray(offset + 8, offset + 8 + length)
    if (type === 'EXIF' || type === 'XMP ') {
      const payload = metadataPayloadFromText(chunk.toString('utf8'))
      if (payload) return payload
    }
    offset += 8 + length + (length % 2)
  }
  throwUnsupportedMetadata('WebP image does not contain SillyTavern character metadata.')
}

function metadataPayloadFromText(text: string): string | undefined {
  const charaIndex = text.indexOf('chara')
  if (charaIndex < 0) return undefined
  const rawAfterKeyword = text.slice(charaIndex + 'chara'.length)
  let start = 0
  while (start < rawAfterKeyword.length) {
    const current = rawAfterKeyword[start]
    if (current === ':' || current === '=' || /\s/.test(current) || current.charCodeAt(0) === 0) {
      start += 1
      continue
    }
    break
  }
  const afterKeyword = rawAfterKeyword.slice(start)
  const match = afterKeyword.match(/[A-Za-z0-9+/=]{16,}/)
  if (!match) return undefined
  return decodeSillyTavernMetadataValue(match[0])
}

function decodeSillyTavernMetadataValue(value: string): string {
  const trimmed = value.trim()
  if (trimmed.startsWith('{')) return trimmed
  try {
    const decoded = Buffer.from(trimmed, 'base64').toString('utf8').trim()
    if (decoded.startsWith('{')) return decoded
  } catch {
    // Fall through to structured error below.
  }
  throwInvalidMetadata('SillyTavern character metadata payload is invalid.')
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

function normalizePosition(value: unknown): 'after-character' | 'before-history' | 'after-history' {
  if (value === 'before-history' || value === 'before_char' || value === 0) {
    return 'before-history'
  }
  if (value === 'after-history' || value === 'after_history') {
    return 'after-history'
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

function throwUnsupportedMetadata(message: string): never {
  throw new TavernRegistryValidationError(
    tavernRegistryError('unsupported_metadata', message, {
      recoverable: false,
      issues: [{ path: 'metadata.chara', message, code: 'unsupported_metadata' }],
    })
  )
}

function throwInvalidMetadata(message: string): never {
  throw new TavernRegistryValidationError(
    tavernRegistryError('invalid_metadata', message, {
      recoverable: false,
      issues: [{ path: 'metadata.chara', message, code: 'invalid_metadata' }],
    })
  )
}

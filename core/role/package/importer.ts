import { createHash } from 'node:crypto'
import { inflateSync } from 'node:zlib'
import {
  createDefaultPetInteractionConfigs,
  normalizePetGiftConfigs,
  normalizePetInteractionConfigs,
} from '@core/role/presets'
import { normalizeArchivePath, readZipEntries, validateArchivePaths } from '@core/utils/zip'
import type { CatAppearanceEmbeddedPack } from '@shared/types/cat-appearance'
import type {
  CompanionRoleKnowledgeEntryDraft,
  CompanionRoleSourceMetadata,
  ImportCompanionRoleCardRequest,
  ImportCompanionRoleCardResponse,
  ImportedCompanionRoleDraft,
} from '@shared/types/companion-role'

type ImportErrorCode =
  | 'invalid_json'
  | 'import_failed'
  | 'invalid_metadata'
  | 'unsupported_metadata'

interface ParsedCharacterCard {
  name?: string
  description?: string
  personality?: string
  scenario?: string
  systemPrompt?: string
  postHistoryInstructions?: string
  firstMessage?: string
  alternateGreetings: string[]
  messageExamples: string[]
  tags: string[]
  lorebooks: ParsedLorebook[]
  source: CompanionRoleSourceMetadata
  exportedRole?: ImportedCompanionRoleDraft
  appearancePack?: CatAppearanceEmbeddedPack
}

interface ParsedLorebook {
  name: string
  description?: string
  entries: CompanionRoleKnowledgeEntryDraft[]
}

export class CompanionRoleCardImportError extends Error {
  readonly code: ImportErrorCode
  readonly recoverable = false

  constructor(code: ImportErrorCode, message: string) {
    super(message)
    this.name = 'CompanionRoleCardImportError'
    this.code = code
  }
}

export function importCompanionRoleCard(
  request: ImportCompanionRoleCardRequest
): ImportCompanionRoleCardResponse {
  const parsed = parseCompanionRoleCard(request)
  const role = mapParsedCardToRole(parsed)
  return {
    role,
    source: parsed.source,
    knowledgeEntryCount: role.knowledgeEntries?.length ?? 0,
    appearancePack: parsed.appearancePack,
  }
}

function parseCompanionRoleCard(request: ImportCompanionRoleCardRequest): ParsedCharacterCard {
  const sourceKind = resolveSourceKind(request)
  if (sourceKind === 'omnipaw-role') {
    return parseOmniPawRolePackage(decodeImportBytes(request), request.sourceName, request.mimeType)
  }

  if (sourceKind === 'json') {
    return parseCharacterJson(request.content ?? '', request.sourceName, {
      mimeType: request.mimeType,
    })
  }

  const data = decodeImportBytes(request)
  const payload =
    sourceKind === 'png' ? extractPngCharacterPayload(data) : extractWebpCharacterPayload(data)
  const parsed = parseCharacterJson(payload, request.sourceName, {
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

function parseCharacterJson(
  content: string,
  sourceName?: string,
  options: {
    sourceKind?: 'json' | 'png' | 'webp' | 'omnipaw-role'
    mimeType?: string
    sourceContent?: string
  } = {}
): ParsedCharacterCard {
  let parsed: unknown
  try {
    parsed = JSON.parse(content) as unknown
  } catch {
    throw new CompanionRoleCardImportError('invalid_json', 'Character card JSON is invalid.')
  }

  const root = asRecord(parsed)
  const exportedRole = parseOmniPawExportedRole(root, content, sourceName, options.mimeType)
  if (exportedRole) {
    return {
      name: exportedRole.role.name,
      alternateGreetings: [],
      messageExamples: [],
      tags: [],
      lorebooks: [],
      source: exportedRole.source,
      exportedRole: exportedRole.role,
      appearancePack: exportedRole.appearancePack,
    }
  }

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

  const resolvedName = name || sourceName?.replace(/\.(json|png|webp)$/i, '') || 'Imported role'
  return {
    name: resolvedName,
    description,
    personality,
    scenario,
    systemPrompt,
    postHistoryInstructions,
    firstMessage,
    alternateGreetings,
    messageExamples,
    tags,
    lorebooks: extractLorebooks(data, resolvedName),
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

function mapParsedCardToRole(parsed: ParsedCharacterCard): ImportedCompanionRoleDraft {
  if (parsed.exportedRole) {
    return {
      ...parsed.exportedRole,
      source: parsed.source,
    }
  }

  const background = [
    parsed.description ? `描述：${parsed.description}` : '',
    parsed.scenario ? `场景：${parsed.scenario}` : '',
    parsed.tags.length ? `标签：${parsed.tags.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
  const knowledgeEntries = parsed.lorebooks.flatMap((book, bookIndex) =>
    book.entries.map((entry, entryIndex) => ({
      ...entry,
      title:
        entry.title?.trim() ||
        `${book.name}${book.entries.length > 1 ? ` #${entryIndex + 1}` : ''}`,
      order: entry.order ?? bookIndex * 100 + entryIndex,
    }))
  )
  const advanced = {
    enabled: Boolean(
      parsed.systemPrompt ||
        parsed.postHistoryInstructions ||
        parsed.messageExamples.length ||
        parsed.description
    ),
    systemPrompt: parsed.systemPrompt ?? '',
    knowledge: parsed.description ?? '',
    exampleDialogue: parsed.messageExamples.join('\n\n'),
    finalInstructions: parsed.postHistoryInstructions ?? '',
  }

  return {
    name: parsed.name ?? 'Imported role',
    personality: parsed.personality ?? '',
    speechStyle: '',
    relationship: '',
    background,
    greeting: parsed.firstMessage ?? '',
    alternateGreetings: parsed.alternateGreetings,
    proactiveStyle: '',
    petInteractions: createDefaultPetInteractionConfigs(),
    petGifts: normalizePetGiftConfigs(undefined),
    advanced,
    knowledgeEntries,
    source: parsed.source,
  }
}

function parseOmniPawExportedRole(
  root: Record<string, unknown> | undefined,
  content: string,
  sourceName?: string,
  mimeType?: string
):
  | {
      role: ImportedCompanionRoleDraft
      source: CompanionRoleSourceMetadata
      appearancePack?: CatAppearanceEmbeddedPack
    }
  | undefined {
  if (!root || root.spec !== 'omnipaw_companion_role') return undefined
  const role = normalizeOmniPawExportedRole(asRecord(root.role))
  if (!role) {
    throwUnsupportedImport()
  }
  return {
    role,
    source: {
      kind: 'manual',
      version: String(root.specVersion ?? ''),
      importedAt: Date.now(),
      sourceName,
      mimeType,
      contentHash: hashSensitiveText(content),
    },
    appearancePack: normalizeEmbeddedAppearancePack(asRecord(root.appearancePack)),
  }
}

function parseOmniPawRolePackage(
  bytes: Buffer,
  sourceName?: string,
  mimeType?: string
): ParsedCharacterCard {
  const entries = readZipEntries(bytes).map((entry) => ({
    ...entry,
    name: normalizeArchivePath(entry.name),
  }))
  validateArchivePaths(entries.map((entry) => entry.name))
  const byName = new Map(entries.map((entry) => [entry.name, entry.data]))
  const manifest = asRecord(readJsonEntry(byName, 'manifest.json'))
  if (manifest?.spec !== 'omnipaw_role_package') {
    throwUnsupportedImport()
  }

  const rolePath = pickString(manifest, ['rolePath']) ?? 'role.json'
  const role = normalizeOmniPawExportedRole(asRecord(readJsonEntry(byName, rolePath)))
  if (!role) {
    throwUnsupportedImport()
  }
  const resolvedRole = resolvePackageGiftImages(role, byName)

  return {
    name: resolvedRole.name,
    alternateGreetings: [],
    messageExamples: [],
    tags: [],
    lorebooks: [],
    source: {
      kind: 'manual',
      version: String(manifest.specVersion ?? ''),
      importedAt: Date.now(),
      sourceName,
      mimeType,
      contentHash: hashSensitiveBytes(bytes),
    },
    exportedRole: resolvedRole,
    appearancePack: packageAppearancePack(entries, manifest, resolvedRole),
  }
}

function readJsonEntry(entries: Map<string, Buffer>, path: string): unknown {
  const data = entries.get(normalizeArchivePath(path))
  if (!data) {
    throwUnsupportedImport()
  }
  try {
    return JSON.parse(data.toString('utf8')) as unknown
  } catch {
    throw new CompanionRoleCardImportError('invalid_json', `${path} JSON is invalid.`)
  }
}

function packageAppearancePack(
  entries: Array<{ name: string; data: Buffer }>,
  manifest: Record<string, unknown>,
  role: ImportedCompanionRoleDraft
): CatAppearanceEmbeddedPack | undefined {
  const appearancePath = normalizeArchivePath(pickString(manifest, ['appearancePath']) ?? '')
  if (!appearancePath) return undefined
  const prefix = appearancePath.endsWith('/') ? appearancePath : `${appearancePath}/`
  const metadataEntry = entries.find((entry) => entry.name === `${prefix}omnipaw-appearance.json`)
  const metadata = metadataEntry ? asRecord(parseOptionalJson(metadataEntry.data)) : undefined
  const files = entries.flatMap((entry) => {
    if (!entry.name.startsWith(prefix) || entry.name === `${prefix}omnipaw-appearance.json`) {
      return []
    }
    return [
      {
        path: entry.name.slice(prefix.length),
        dataBase64: entry.data.toString('base64'),
      },
    ]
  })
  if (!files.length) return undefined
  return {
    originalPackId:
      pickString(metadata, ['originalPackId']) ?? role.appearancePackId ?? 'imported-appearance',
    rootName: pickString(metadata, ['rootName']),
    files,
  }
}

function parseOptionalJson(data: Buffer): unknown {
  try {
    return JSON.parse(data.toString('utf8')) as unknown
  } catch {
    return undefined
  }
}

function normalizeOmniPawExportedRole(
  role: Record<string, unknown> | undefined
): ImportedCompanionRoleDraft | undefined {
  const name = pickString(role, ['name'])
  if (!role || !name) return undefined
  const advanced = asRecord(role.advanced)
  return {
    name,
    appearancePackId: pickString(role, ['appearancePackId']),
    userNickname: pickString(role, ['userNickname']),
    personality: pickString(role, ['personality']),
    speechStyle: pickString(role, ['speechStyle']),
    relationship: pickString(role, ['relationship']),
    background: pickString(role, ['background']),
    greeting: pickString(role, ['greeting']),
    alternateGreetings: stringArray(role.alternateGreetings),
    proactiveStyle: pickString(role, ['proactiveStyle']),
    petInteractions: normalizePetInteractionConfigs(role.petInteractions),
    petGifts: normalizePetGiftConfigs(role.petGifts ?? role.gifts),
    advanced: advanced
      ? {
          enabled:
            advanced.enabled === true ||
            Boolean(
              pickString(advanced, ['systemPrompt'])?.trim() ||
                pickString(advanced, ['knowledge'])?.trim() ||
                pickString(advanced, ['exampleDialogue'])?.trim() ||
                pickString(advanced, ['finalInstructions'])?.trim()
            ),
          systemPrompt: pickString(advanced, ['systemPrompt']) ?? '',
          knowledge: pickString(advanced, ['knowledge']) ?? '',
          exampleDialogue: pickString(advanced, ['exampleDialogue']) ?? '',
          finalInstructions: pickString(advanced, ['finalInstructions']) ?? '',
        }
      : undefined,
    knowledgeEntries: normalizeOmniPawExportedKnowledgeEntries(role.knowledgeEntries),
  }
}

function resolvePackageGiftImages(
  role: ImportedCompanionRoleDraft,
  entries: Map<string, Buffer>
): ImportedCompanionRoleDraft {
  return {
    ...role,
    petGifts: normalizePetGiftConfigs(role.petGifts).map((gift) => {
      const packagePath = normalizeArchivePath(gift.image?.packagePath ?? '')
      const data = packagePath ? entries.get(packagePath) : undefined
      if (!data) {
        return gift
      }
      const mimeType = gift.image?.mimeType?.startsWith('image/')
        ? gift.image.mimeType
        : mimeTypeFromPath(packagePath)
      return {
        ...gift,
        image: {
          ...gift.image,
          mimeType,
          dataUrl: `data:${mimeType};base64,${data.toString('base64')}`,
          packagePath,
        },
      }
    }),
  }
}

function normalizeEmbeddedAppearancePack(
  value: Record<string, unknown> | undefined
): CatAppearanceEmbeddedPack | undefined {
  if (!value) return undefined
  const originalPackId = pickString(value, ['originalPackId'])
  const rawFiles = Array.isArray(value.files) ? value.files : []
  if (!originalPackId || !rawFiles.length) return undefined
  const files = rawFiles.flatMap((item) => {
    const file = asRecord(item)
    const path = pickString(file, ['path'])
    const dataBase64 = pickString(file, ['dataBase64'])
    if (!path || !dataBase64) return []
    return [{ path, dataBase64 }]
  })
  return files.length
    ? {
        originalPackId,
        rootName: pickString(value, ['rootName']),
        files,
      }
    : undefined
}

function mimeTypeFromPath(path: string): string {
  const lower = path.toLowerCase()
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.gif')) return 'image/gif'
  return 'image/png'
}

function normalizeOmniPawExportedKnowledgeEntries(
  value: unknown
): CompanionRoleKnowledgeEntryDraft[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item, index) => {
    const entry = asRecord(item)
    const content = pickString(entry, ['content'])
    if (!entry || !content) return []
    return [
      {
        enabled: entry.enabled !== false,
        title: pickString(entry, ['title']),
        content,
        keys: stringArray(entry.keys),
        constant: entry.constant === true,
        priority: numberValue(entry.priority, 0),
        order: numberValue(entry.order, index),
        tokenBudget: positiveNumber(entry.tokenBudget),
      },
    ]
  })
}

function resolveSourceKind(
  request: ImportCompanionRoleCardRequest
): 'json' | 'png' | 'webp' | 'omnipaw-role' {
  if (request.sourceKind) return request.sourceKind
  const mime = request.mimeType?.toLocaleLowerCase()
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  const name = request.sourceName?.toLocaleLowerCase() ?? ''
  if (name.endsWith('.omnipaw-role')) return 'omnipaw-role'
  if (name.endsWith('.png')) return 'png'
  if (name.endsWith('.webp')) return 'webp'
  return 'json'
}

function decodeImportBytes(request: ImportCompanionRoleCardRequest): Buffer {
  const encoded = request.dataBase64?.trim()
  if (!encoded) {
    throw new CompanionRoleCardImportError('invalid_metadata', 'Character import data is missing.')
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

function extractLorebooks(data: Record<string, unknown>, characterName: string): ParsedLorebook[] {
  const candidates = [
    data.character_book,
    data.characterBook,
    data.lorebook,
    data.world_book,
    data.worldBook,
  ]
  const lorebooks: ParsedLorebook[] = []
  for (const candidate of candidates) {
    const book = asRecord(candidate)
    if (!book) continue
    const entries = extractEntries(book)
    if (!entries.length) continue
    lorebooks.push({
      name: pickString(book, ['name']) || `${characterName} knowledge`,
      description: pickString(book, ['description']),
      entries,
    })
  }
  return lorebooks
}

function extractEntries(book: Record<string, unknown>): CompanionRoleKnowledgeEntryDraft[] {
  const rawEntries = Array.isArray(book.entries) ? book.entries : []
  return rawEntries
    .map((entry, index) => normalizeEntry(asRecord(entry), index))
    .filter((entry): entry is CompanionRoleKnowledgeEntryDraft => Boolean(entry))
}

function normalizeEntry(
  entry: Record<string, unknown> | undefined,
  index: number
): CompanionRoleKnowledgeEntryDraft | undefined {
  if (!entry) {
    return undefined
  }
  const content = pickString(entry, ['content', 'text'])
  const keys = normalizeKeys(entry.keys ?? entry.key)
  const constant = entry.constant === true
  if (!content || (!constant && !keys.length)) {
    return undefined
  }
  return {
    enabled: entry.enabled !== false && entry.disable !== true,
    title: pickString(entry, ['comment', 'name', 'title']) || `Knowledge ${index + 1}`,
    keys,
    content,
    constant,
    priority: numberValue(entry.priority, 0),
    order: numberValue(entry.insertion_order ?? entry.order, index),
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

function hashSensitiveText(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function hashSensitiveBytes(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}

function throwUnsupportedImport(): never {
  throw new CompanionRoleCardImportError(
    'import_failed',
    'JSON is not a supported SillyTavern character card.'
  )
}

function throwUnsupportedMetadata(message: string): never {
  throw new CompanionRoleCardImportError('unsupported_metadata', message)
}

function throwInvalidMetadata(message: string): never {
  throw new CompanionRoleCardImportError('invalid_metadata', message)
}

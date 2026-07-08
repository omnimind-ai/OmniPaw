import { normalizePetGiftConfigs, normalizePetInteractionConfigs } from '@core/role/presets'
import { writeZipEntries, type ZipArchiveEntry } from '@core/utils/zip'
import type {
  CompanionRoleKnowledgeEntryDraft,
  ExportCompanionRoleCardRequest,
  ImportedCompanionRoleDraft,
} from '@shared/types/companion-role'

export interface ExportedCompanionRoleCard {
  data: Buffer
  defaultFileName: string
}

interface OmniPawRolePackageManifest {
  spec: 'omnipaw_role_package'
  specVersion: 1
  exportedAt: number
  rolePath: 'role.json'
  appearancePath?: 'appearance/'
  giftsPath?: 'gifts/'
}

export function exportCompanionRoleCard(
  request: ExportCompanionRoleCardRequest
): ExportedCompanionRoleCard {
  const role = normalizeExportedRoleDraft(request.role)
  const giftPackage = packageGiftImages(role)
  const manifest: OmniPawRolePackageManifest = {
    spec: 'omnipaw_role_package',
    specVersion: 1,
    exportedAt: Date.now(),
    rolePath: 'role.json',
    appearancePath: request.appearancePack ? 'appearance/' : undefined,
    giftsPath: giftPackage.entries.length ? 'gifts/' : undefined,
  }
  const entries: ZipArchiveEntry[] = [
    jsonEntry('manifest.json', manifest),
    jsonEntry('role.json', giftPackage.role),
    ...appearancePackEntries(request.appearancePack),
    ...giftPackage.entries,
  ]

  return {
    data: writeZipEntries(entries),
    defaultFileName: request.sourceName?.trim()
      ? safeRolePackageFileName(request.sourceName)
      : `${safeFileBaseName(role.name)}.omnipaw-role`,
  }
}

function jsonEntry(name: string, value: unknown): ZipArchiveEntry {
  return {
    name,
    data: Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8'),
  }
}

function appearancePackEntries(
  pack: ExportCompanionRoleCardRequest['appearancePack']
): ZipArchiveEntry[] {
  if (!pack) return []
  return [
    jsonEntry('appearance/omnipaw-appearance.json', {
      originalPackId: pack.originalPackId,
      rootName: pack.rootName,
    }),
    ...pack.files.map((file) => ({
      name: `appearance/${file.path}`,
      data: Buffer.from(file.dataBase64, 'base64'),
    })),
  ]
}

function normalizeExportedRoleDraft(role: ImportedCompanionRoleDraft): ImportedCompanionRoleDraft {
  return {
    name: normalizeText(role.name) || 'Imported role',
    appearancePackId: normalizeOptionalText(role.appearancePackId),
    userNickname: normalizeOptionalText(role.userNickname),
    personality: normalizeOptionalText(role.personality),
    speechStyle: normalizeOptionalText(role.speechStyle),
    relationship: normalizeOptionalText(role.relationship),
    background: normalizeOptionalText(role.background),
    greeting: normalizeOptionalText(role.greeting),
    alternateGreetings: normalizeStringList(role.alternateGreetings),
    proactiveStyle: normalizeOptionalText(role.proactiveStyle),
    petInteractions: normalizePetInteractionConfigs(role.petInteractions),
    petGifts: normalizePetGiftConfigs(role.petGifts),
    advanced: role.advanced
      ? {
          enabled: Boolean(role.advanced.enabled),
          systemPrompt: normalizeText(role.advanced.systemPrompt),
          knowledge: normalizeText(role.advanced.knowledge),
          exampleDialogue: normalizeText(role.advanced.exampleDialogue),
          finalInstructions: normalizeText(role.advanced.finalInstructions),
        }
      : undefined,
    knowledgeEntries: normalizeExportedKnowledgeEntries(role.knowledgeEntries),
    source: role.source,
  }
}

function packageGiftImages(role: ImportedCompanionRoleDraft): {
  role: ImportedCompanionRoleDraft
  entries: ZipArchiveEntry[]
} {
  const usedPaths = new Set<string>()
  const entries: ZipArchiveEntry[] = []
  const petGifts = normalizePetGiftConfigs(role.petGifts).map((gift) => {
    const image = gift.image
    const parsed = parseDataImageUrl(image?.dataUrl)
    if (!parsed) {
      return gift
    }

    const baseName = safeFileBaseName(image?.fileName || gift.name || gift.id)
      .replace(/\.[a-z0-9]+$/i, '')
      .slice(0, 60)
    const extension = imageExtension(parsed.mimeType)
    let path = `gifts/${baseName || gift.id}.${extension}`
    let suffix = 2
    while (usedPaths.has(path)) {
      path = `gifts/${baseName || gift.id}-${suffix}.${extension}`
      suffix += 1
    }
    usedPaths.add(path)
    entries.push({
      name: path,
      data: parsed.data,
    })

    return {
      ...gift,
      image: {
        mimeType: parsed.mimeType,
        ...(image?.fileName ? { fileName: image.fileName } : {}),
        packagePath: path,
      },
    }
  })

  return {
    role: {
      ...role,
      petGifts,
    },
    entries,
  }
}

function parseDataImageUrl(
  value: string | undefined
): { mimeType: string; data: Buffer } | undefined {
  const match = value?.match(/^data:(image\/(?:png|jpe?g|webp|gif));base64,([a-z0-9+/=]+)$/i)
  if (!match) {
    return undefined
  }
  return {
    mimeType: match[1].toLowerCase(),
    data: Buffer.from(match[2], 'base64'),
  }
}

function imageExtension(mimeType: string): string {
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') return 'jpg'
  if (mimeType === 'image/webp') return 'webp'
  if (mimeType === 'image/gif') return 'gif'
  return 'png'
}

function normalizeExportedKnowledgeEntries(
  entries: CompanionRoleKnowledgeEntryDraft[] | undefined
): CompanionRoleKnowledgeEntryDraft[] {
  return (entries ?? []).flatMap((entry, index) => {
    const content = normalizeText(entry.content)
    if (!content) return []
    return [
      {
        enabled: entry.enabled !== false,
        title: normalizeOptionalText(entry.title),
        content,
        keys: normalizeStringList(entry.keys),
        constant: Boolean(entry.constant),
        priority: numberValue(entry.priority, 0),
        order: numberValue(entry.order, index),
        tokenBudget: positiveNumber(entry.tokenBudget),
      },
    ]
  })
}

function normalizeStringList(value: string[] | undefined): string[] {
  return (value ?? []).map((item) => normalizeText(item)).filter(Boolean)
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  const normalized = normalizeText(value)
  return normalized || undefined
}

function normalizeText(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : undefined
}

function safeFileBaseName(value: string): string {
  const normalized = value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
  return normalized || 'omnipaw-role'
}

function safeRolePackageFileName(value: string): string {
  return `${safeFileBaseName(value.replace(/(\.omnipaw-role|\.json)$/i, ''))}.omnipaw-role`
}

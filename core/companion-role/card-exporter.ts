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
}

export function exportCompanionRoleCard(
  request: ExportCompanionRoleCardRequest
): ExportedCompanionRoleCard {
  const role = normalizeExportedRoleDraft(request.role)
  const manifest: OmniPawRolePackageManifest = {
    spec: 'omnipaw_role_package',
    specVersion: 1,
    exportedAt: Date.now(),
    rolePath: 'role.json',
    appearancePath: request.appearancePack ? 'appearance/' : undefined,
  }
  const entries: ZipArchiveEntry[] = [
    jsonEntry('manifest.json', manifest),
    jsonEntry('role.json', role),
    ...appearancePackEntries(request.appearancePack),
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

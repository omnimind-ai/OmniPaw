<script setup lang="ts">
import {
  defaultCatPetGiftConfigs,
  defaultCatPetInteractionConfigs,
  normalizeCatPetGiftConfigs,
  normalizeCatPetInteractionConfigs,
} from '@shared/types/cat-pet'
import type {
  CompanionRoleCardImportSourceKind,
  CompanionRoleKnowledgeEntry,
  CompanionRoleKnowledgeEntryDraft,
  CompanionRoleSourceMetadata,
  ImportedCompanionRoleDraft,
} from '@shared/types/companion-role'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  appBridge,
  type BridgeDesktopSettingsConfig,
  ensureElectronBridge,
  isFallbackBridge,
} from '@/bridge/app'
import CompanionRoleEditorModal from '@/components/settings/companion-role-settings/CompanionRoleEditorModal.vue'
import CompanionRoleSelection from '@/components/settings/companion-role-settings/CompanionRoleSelection.vue'
import RoleCardImportDialog from '@/components/settings/companion-role-settings/RoleCardImportDialog.vue'
import { useCompanionRoleIdleImages } from '@/composables/useCompanionRoleIdleImages'
import { errorToText, useToast } from '@/utils/toast'

type CompanionRole = BridgeDesktopSettingsConfig['app']['companionRoles'][number]

const props = defineProps<{
  draft: BridgeDesktopSettingsConfig
}>()

const { t } = useI18n()
const toast = useToast()

const roleImportInput = ref<HTMLInputElement>()
const roleCardInput = ref<HTMLInputElement>()
const roleCardImportDialogOpen = ref(false)
const editorModalOpen = ref(false)
const editingRoleId = ref('')
const roleCardJsonContent = ref('')
const importingRole = ref(false)
const importingRoleCard = ref(false)
const exportingRoleCard = ref(false)
const confirmDeleteRoleId = ref<string>()

const roles = computed(() => props.draft.app.companionRoles)
const activeRoleId = computed(() => props.draft.app.activeCompanionRoleId)
const editingRole = computed(() => roles.value.find((role) => role.id === editingRoleId.value))
const canDeleteRole = computed(() => roles.value.length > 1)
const importRoleDisabled = computed(() => importingRole.value || isFallbackBridge)
const importRoleCardDisabled = computed(() => importingRoleCard.value || isFallbackBridge)
const canImportRoleCardJson = computed(
  () => !importRoleCardDisabled.value && roleCardJsonContent.value.trim().length > 0
)
const roleAppearancePackIds = computed(() =>
  [...new Set(roles.value.map((role) => role.appearancePackId || 'builtin'))].sort()
)
const { idleImageByPackId } = useCompanionRoleIdleImages(roleAppearancePackIds)

watch(editorModalOpen, (isOpen) => {
  if (!isOpen) {
    editingRoleId.value = ''
    confirmDeleteRoleId.value = undefined
  }
})

function selectRole(target: CompanionRole): void {
  confirmDeleteRoleId.value = undefined
  props.draft.app.activeCompanionRoleId = target.id
}

function editRole(target: CompanionRole): void {
  confirmDeleteRoleId.value = undefined
  editingRoleId.value = target.id
  editorModalOpen.value = true
}

function createRole(): void {
  confirmDeleteRoleId.value = undefined
  const nextRole = createCompanionRole()
  roles.value.push(nextRole)
  editRole(nextRole)
}

function duplicateEditingRole(): void {
  if (!editingRole.value) return
  confirmDeleteRoleId.value = undefined
  const nextRole: CompanionRole = {
    ...editingRole.value,
    id: createRoleId(),
    name: t('settings.catAppearance.role.copyName', {
      name: editingRole.value.name || defaultRoleName(),
    }),
    advanced: { ...editingRole.value.advanced },
    petInteractions: editingRole.value.petInteractions.map((item) => ({ ...item })),
    petGifts: editingRole.value.petGifts.map((item) => ({
      ...item,
      ...(item.image ? { image: { ...item.image } } : {}),
      storyLines: [...item.storyLines],
    })),
    knowledgeEntries: editingRole.value.knowledgeEntries.map((entry, index) => ({
      ...entry,
      id: createRoleKnowledgeId(index),
      keys: [...entry.keys],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })),
    knowledgeSettings: { ...editingRole.value.knowledgeSettings },
    source: editingRole.value.source ? { ...editingRole.value.source } : undefined,
  }
  roles.value.push(nextRole)
  editRole(nextRole)
}

function deleteRole(target: CompanionRole): void {
  if (!canDeleteRole.value) return
  if (confirmDeleteRoleId.value !== target.id) {
    confirmDeleteRoleId.value = target.id
    return
  }
  const index = roles.value.findIndex((item) => item.id === target.id)
  if (index < 0) return
  confirmDeleteRoleId.value = undefined
  roles.value.splice(index, 1)
  if (props.draft.app.activeCompanionRoleId === target.id) {
    props.draft.app.activeCompanionRoleId =
      roles.value[Math.max(0, index - 1)]?.id ?? roles.value[0]?.id ?? ''
  }
  if (editingRoleId.value === target.id) {
    editorModalOpen.value = false
  }
}

function createCompanionRole(): CompanionRole {
  return {
    id: createRoleId(),
    name: defaultRoleName(),
    appearancePackId: 'builtin',
    userNickname: '',
    personality: '',
    speechStyle: '',
    relationship: '',
    background: '',
    proactiveStyle: '',
    petInteractions: defaultCatPetInteractionConfigs(),
    petGifts: defaultCatPetGiftConfigs(),
    advanced: {
      enabled: false,
      systemPrompt: '',
      knowledge: '',
      exampleDialogue: '',
      finalInstructions: '',
    },
    knowledgeSettings: {
      scanDepth: 8,
      maxTokens: 900,
    },
    knowledgeEntries: [],
    source: undefined,
    defaultProviderId: undefined,
    defaultModelId: undefined,
  }
}

function chooseRoleFile(): void {
  confirmDeleteRoleId.value = undefined
  try {
    ensureElectronBridge(t('settings.catAppearance.role.actions.importRole'))
  } catch (error) {
    toast.error(errorToText(error, t('settings.catAppearance.role.toasts.importRoleFailed')))
    return
  }
  roleImportInput.value?.click()
}

function openRoleCardImport(): void {
  confirmDeleteRoleId.value = undefined
  try {
    ensureElectronBridge(t('settings.catAppearance.role.actions.importCard'))
  } catch (error) {
    toast.error(errorToText(error, t('settings.catAppearance.role.toasts.importCardFailed')))
    return
  }
  roleCardImportDialogOpen.value = true
}

async function exportEditingRoleCard(): Promise<void> {
  if (!editingRole.value || exportingRoleCard.value) return
  confirmDeleteRoleId.value = undefined

  try {
    ensureElectronBridge(t('settings.catAppearance.role.actions.exportCard'))
  } catch (error) {
    toast.error(errorToText(error, t('settings.catAppearance.role.toasts.exportCardFailed')))
    return
  }

  exportingRoleCard.value = true
  try {
    const result = await appBridge.companionRole.exportCard({
      role: createExportRoleDraft(editingRole.value),
    })
    if (!result.exported) return
    toast.success(t('settings.catAppearance.role.toasts.exportCardSuccess'), {
      description: result.destinationPath,
    })
  } catch (error) {
    toast.error(errorToText(error, t('settings.catAppearance.role.toasts.exportCardFailed')))
  } finally {
    exportingRoleCard.value = false
  }
}

function chooseRoleCardFile(): void {
  confirmDeleteRoleId.value = undefined
  roleCardInput.value?.click()
}

async function importRole(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || importingRole.value) return

  importingRole.value = true
  try {
    const result = await appBridge.companionRole.importCard(await createRoleImportRequest(file))
    if (!isOmniPawRoleImport(result)) {
      throw new Error(t('settings.catAppearance.role.errors.notOmniPawRoleFile'))
    }
    applyImportedRole(result, {
      successMessage: t('settings.catAppearance.role.toasts.importRoleSuccess'),
      summaryKey: 'settings.catAppearance.role.toasts.importRoleSummary',
    })
  } catch (error) {
    toast.error(errorToText(error, t('settings.catAppearance.role.toasts.importRoleFailed')))
  } finally {
    importingRole.value = false
  }
}

async function createRoleImportRequest(file: File): Promise<{
  content?: string
  dataBase64?: string
  sourceKind: CompanionRoleCardImportSourceKind
  mimeType?: string
  sourceName: string
}> {
  if (file.name.toLocaleLowerCase().endsWith('.omnipaw-role')) {
    return {
      dataBase64: await fileToBase64(file),
      sourceKind: 'omnipaw-role',
      mimeType: file.type || 'application/zip',
      sourceName: file.name,
    }
  }

  return {
    content: await file.text(),
    sourceKind: 'json',
    mimeType: file.type || 'application/json',
    sourceName: file.name,
  }
}

async function importRoleCard(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || importingRoleCard.value) return

  importingRoleCard.value = true
  try {
    const request = await createRoleCardImportRequest(file)
    if (request.sourceKind === 'json' && isOmniPawRoleJsonContent(request.content)) {
      throw new Error(t('settings.catAppearance.role.errors.notRoleCardFile'))
    }
    const result = await appBridge.companionRole.importCard(request)
    if (isOmniPawRoleImport(result)) {
      throw new Error(t('settings.catAppearance.role.errors.notRoleCardFile'))
    }
    applyImportedRole(result, {
      successMessage: t('settings.catAppearance.role.toasts.importCardSuccess'),
      summaryKey: 'settings.catAppearance.role.toasts.importCardSummary',
    })
  } catch (error) {
    toast.error(errorToText(error, t('settings.catAppearance.role.toasts.importCardFailed')))
  } finally {
    importingRoleCard.value = false
  }
}

async function importPastedRoleCard(): Promise<void> {
  const content = roleCardJsonContent.value.trim()
  if (!content || importingRoleCard.value) return
  if (isOmniPawRoleJsonContent(content)) {
    toast.error(t('settings.catAppearance.role.errors.notRoleCardFile'))
    return
  }

  importingRoleCard.value = true
  try {
    const result = await appBridge.companionRole.importCard({
      content,
      sourceKind: 'json',
      mimeType: 'application/json',
      sourceName: t('settings.catAppearance.role.importDialog.pastedSourceName'),
    })
    if (isOmniPawRoleImport(result)) {
      throw new Error(t('settings.catAppearance.role.errors.notRoleCardFile'))
    }
    applyImportedRole(result, {
      successMessage: t('settings.catAppearance.role.toasts.importCardSuccess'),
      summaryKey: 'settings.catAppearance.role.toasts.importCardSummary',
    })
    roleCardJsonContent.value = ''
  } catch (error) {
    toast.error(errorToText(error, t('settings.catAppearance.role.toasts.importCardFailed')))
  } finally {
    importingRoleCard.value = false
  }
}

async function createRoleCardImportRequest(file: File): Promise<{
  content?: string
  dataBase64?: string
  sourceKind: CompanionRoleCardImportSourceKind
  mimeType?: string
  sourceName: string
}> {
  const sourceKind = roleCardSourceKind(file)
  if (sourceKind === 'json') {
    return {
      content: await file.text(),
      sourceKind,
      mimeType: file.type || 'application/json',
      sourceName: file.name,
    }
  }

  return {
    dataBase64: await fileToBase64(file),
    sourceKind,
    mimeType: file.type || (sourceKind === 'png' ? 'image/png' : 'image/webp'),
    sourceName: file.name,
  }
}

function roleCardSourceKind(file: File): CompanionRoleCardImportSourceKind {
  const type = file.type.toLocaleLowerCase()
  const name = file.name.toLocaleLowerCase()
  if (type === 'image/png' || name.endsWith('.png')) return 'png'
  if (type === 'image/webp' || name.endsWith('.webp')) return 'webp'
  return 'json'
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file.'))
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      const commaIndex = result.indexOf(',')
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result)
    }
    reader.readAsDataURL(file)
  })
}

type CompanionRoleImportResult = Awaited<ReturnType<typeof appBridge.companionRole.importCard>>

function applyImportedRole(
  result: CompanionRoleImportResult,
  options: {
    successMessage: string
    summaryKey: string
  }
): void {
  confirmDeleteRoleId.value = undefined
  const nextRole = createRoleFromImportedDraft(result.role, result.source)
  roles.value.push(nextRole)
  roleCardImportDialogOpen.value = false
  toast.success(options.successMessage, {
    description: t(options.summaryKey, {
      name: nextRole.name,
      count: result.knowledgeEntryCount,
    }),
  })
}

function isOmniPawRoleImport(result: CompanionRoleImportResult): boolean {
  return result.source.kind === 'manual'
}

function isOmniPawRoleJsonContent(content: string | undefined): boolean {
  if (!content) return false
  try {
    const parsed = JSON.parse(content) as unknown
    return Boolean(
      parsed &&
        typeof parsed === 'object' &&
        (parsed as { spec?: unknown }).spec === 'omnipaw_companion_role'
    )
  } catch {
    return false
  }
}

function createRoleFromImportedDraft(
  draft: ImportedCompanionRoleDraft,
  source: CompanionRoleSourceMetadata
): CompanionRole {
  return {
    id: createRoleId(),
    name: draft.name?.trim() || defaultRoleName(),
    appearancePackId: draft.appearancePackId || 'builtin',
    userNickname: draft.userNickname ?? '',
    personality: draft.personality ?? '',
    speechStyle: draft.speechStyle ?? '',
    relationship: draft.relationship ?? '',
    background: draft.background ?? '',
    proactiveStyle: draft.proactiveStyle ?? '',
    petInteractions: normalizeCatPetInteractionConfigs(draft.petInteractions),
    petGifts: normalizeCatPetGiftConfigs(draft.petGifts),
    advanced: {
      enabled: hasAdvancedRoleContent(draft.advanced),
      systemPrompt: draft.advanced?.systemPrompt ?? '',
      exampleDialogue: draft.advanced?.exampleDialogue ?? '',
      finalInstructions: draft.advanced?.finalInstructions ?? '',
    },
    knowledgeSettings: {
      scanDepth: 8,
      maxTokens: 900,
    },
    knowledgeEntries: normalizeImportedKnowledgeEntries(draft.knowledgeEntries),
    source: draft.source ?? source,
    defaultProviderId: undefined,
    defaultModelId: undefined,
  }
}

function createExportRoleDraft(role: CompanionRole): ImportedCompanionRoleDraft {
  return {
    name: role.name,
    appearancePackId: role.appearancePackId,
    userNickname: role.userNickname,
    personality: role.personality,
    speechStyle: role.speechStyle,
    relationship: role.relationship,
    background: role.background,
    proactiveStyle: role.proactiveStyle,
    petInteractions: normalizeCatPetInteractionConfigs(role.petInteractions),
    petGifts: normalizeCatPetGiftConfigs(role.petGifts),
    advanced: {
      enabled: hasAdvancedRoleContent(role.advanced),
      systemPrompt: role.advanced.systemPrompt,
      exampleDialogue: role.advanced.exampleDialogue,
      finalInstructions: role.advanced.finalInstructions,
    },
    knowledgeEntries: role.knowledgeEntries.map((entry, index) => ({
      enabled: entry.enabled,
      title: entry.title,
      content: entry.content,
      keys: [...entry.keys],
      constant: entry.constant,
      priority: entry.priority,
      order: entry.order ?? index,
      tokenBudget: entry.tokenBudget,
    })),
    source: cloneRoleSourceMetadata(role.source),
  }
}

function cloneRoleSourceMetadata(
  source: CompanionRoleSourceMetadata | undefined
): CompanionRoleSourceMetadata | undefined {
  if (!source) return undefined
  return {
    kind: source.kind,
    version: source.version,
    importedAt: source.importedAt,
    sourceName: source.sourceName,
    mimeType: source.mimeType,
    contentHash: source.contentHash,
  }
}

function normalizeImportedKnowledgeEntries(
  entries: CompanionRoleKnowledgeEntryDraft[] | undefined
): CompanionRoleKnowledgeEntry[] {
  const now = Date.now()
  return (entries ?? [])
    .map((entry, index) => {
      const content = entry.content?.trim() ?? ''
      if (!content) return undefined
      return {
        id: entry.id?.trim() || createRoleKnowledgeId(index),
        enabled: entry.enabled ?? true,
        title: entry.title?.trim() || t('settings.catAppearance.role.knowledge.untitled'),
        content,
        keys: normalizeStringList(entry.keys),
        constant: entry.constant ?? true,
        priority: Number.isFinite(entry.priority) ? Number(entry.priority) : 0,
        order: Number.isFinite(entry.order) ? Number(entry.order) : index,
        tokenBudget: Number.isFinite(entry.tokenBudget) ? Number(entry.tokenBudget) : undefined,
        createdAt: now,
        updatedAt: now,
      }
    })
    .filter((entry): entry is CompanionRoleKnowledgeEntry => Boolean(entry))
}

function normalizeStringList(value: string[] | undefined): string[] {
  return (value ?? []).map((item) => item.trim()).filter(Boolean)
}

function hasAdvancedRoleContent(
  advanced: ImportedCompanionRoleDraft['advanced'] | undefined
): boolean {
  return Boolean(
    advanced?.systemPrompt?.trim() ||
      advanced?.exampleDialogue?.trim() ||
      advanced?.finalInstructions?.trim()
  )
}

function createRoleId(): string {
  return `role-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function createRoleKnowledgeId(index: number): string {
  return `role-knowledge-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 8)}`
}

function defaultRoleName(): string {
  return t('settings.catAppearance.role.newRoleName')
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
    <input
      ref="roleImportInput"
      class="sr-only"
      type="file"
      accept=".omnipaw-role,.json,application/json"
      @change="importRole"
    >
    <input
      ref="roleCardInput"
      class="sr-only"
      type="file"
      accept=".json,.png,.webp,application/json,image/png,image/webp"
      @change="importRoleCard"
    >

    <CompanionRoleSelection
      class="min-h-0 flex-1"
      :roles="roles"
      :active-role-id="activeRoleId"
      :import-role-disabled="importRoleDisabled"
      :import-role-card-disabled="importRoleCardDisabled"
      :idle-image-by-pack-id="idleImageByPackId"
      @create-role="createRole"
      @edit-role="editRole"
      @import-role="chooseRoleFile"
      @import-role-card="openRoleCardImport"
      @select-role="selectRole"
    />

    <CompanionRoleEditorModal
      v-model:open="editorModalOpen"
      :role="editingRole"
      :is-active-role="editingRole?.id === activeRoleId"
      :can-delete-role="canDeleteRole"
      :confirm-delete-role-id="confirmDeleteRoleId"
      @duplicate-role="duplicateEditingRole"
      @export-role="exportEditingRoleCard"
      @delete-role="deleteRole"
    />

    <RoleCardImportDialog
      v-model:open="roleCardImportDialogOpen"
      v-model:json-content="roleCardJsonContent"
      :import-disabled="importRoleCardDisabled"
      :can-import-json="canImportRoleCardJson"
      @choose-file="chooseRoleCardFile"
      @import-json="importPastedRoleCard"
    />
  </div>
</template>

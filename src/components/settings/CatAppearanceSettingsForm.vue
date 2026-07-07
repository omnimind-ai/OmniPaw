<script setup lang="ts">
import type {
  CompanionRoleCardImportSourceKind,
  CompanionRoleKnowledgeEntry,
  CompanionRoleKnowledgeEntryDraft,
  CompanionRoleSourceMetadata,
  ImportedCompanionRoleDraft,
} from '@shared/types/companion-role'
import {
  ArrowLeftIcon,
  CheckIcon,
  FileJsonIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SearchIcon,
  SparklesIcon,
} from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import {
  appBridge,
  type BridgeDesktopSettingsConfig,
  ensureElectronBridge,
  isFallbackBridge,
} from '@/bridge/app'
import CompanionRoleEditor from '@/components/settings/companion-role-settings/CompanionRoleEditor.vue'
import RoleCardImportDialog from '@/components/settings/companion-role-settings/RoleCardImportDialog.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
} from '@/components/ui/sidebar'
import { errorToText, useToast } from '@/utils/toast'

type CompanionRole = BridgeDesktopSettingsConfig['app']['companionRoles'][number]

const props = defineProps<{
  draft: BridgeDesktopSettingsConfig
}>()

const { t } = useI18n()
const router = useRouter()
const toast = useToast()

const roleImportInput = ref<HTMLInputElement>()
const roleCardInput = ref<HTMLInputElement>()
const roleCardImportDialogOpen = ref(false)
const roleCardJsonContent = ref('')
const roleSearchQuery = ref('')
const importingRole = ref(false)
const importingRoleCard = ref(false)
const exportingRoleCard = ref(false)

const roles = computed(() => props.draft.app.companionRoles)
const normalizedRoleSearchQuery = computed(() => roleSearchQuery.value.trim().toLocaleLowerCase())
const filteredRoles = computed(() => {
  const query = normalizedRoleSearchQuery.value
  if (!query) return roles.value
  return roles.value.filter((role) =>
    (role.name || t('settings.catAppearance.role.unnamed')).toLocaleLowerCase().includes(query)
  )
})
const activeRoleId = computed(() => props.draft.app.activeCompanionRoleId)
const activeRole = computed(
  () => roles.value.find((role) => role.id === activeRoleId.value) ?? roles.value[0]
)
const canDeleteRole = computed(() => roles.value.length > 1)
const importRoleDisabled = computed(() => importingRole.value || isFallbackBridge)
const importRoleCardDisabled = computed(() => importingRoleCard.value || isFallbackBridge)
const canImportRoleCardJson = computed(
  () => !importRoleCardDisabled.value && roleCardJsonContent.value.trim().length > 0
)

function selectRole(target: CompanionRole): void {
  props.draft.app.activeCompanionRoleId = target.id
}

function createRole(): void {
  const nextRole = createCompanionRole()
  roles.value.push(nextRole)
  props.draft.app.activeCompanionRoleId = nextRole.id
}

function duplicateActiveRole(): void {
  if (!activeRole.value) return
  const nextRole: CompanionRole = {
    ...activeRole.value,
    id: createRoleId(),
    name: t('settings.catAppearance.role.copyName', {
      name: activeRole.value.name || defaultRoleName(),
    }),
    advanced: { ...activeRole.value.advanced },
    alternateGreetings: [...activeRole.value.alternateGreetings],
    knowledgeEntries: activeRole.value.knowledgeEntries.map((entry, index) => ({
      ...entry,
      id: createRoleKnowledgeId(index),
      keys: [...entry.keys],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })),
    knowledgeSettings: { ...activeRole.value.knowledgeSettings },
    source: activeRole.value.source ? { ...activeRole.value.source } : undefined,
  }
  roles.value.push(nextRole)
  props.draft.app.activeCompanionRoleId = nextRole.id
}

function deleteRole(target: CompanionRole): void {
  if (!canDeleteRole.value) return
  const index = roles.value.findIndex((item) => item.id === target.id)
  if (index < 0) return
  roles.value.splice(index, 1)
  if (props.draft.app.activeCompanionRoleId === target.id) {
    props.draft.app.activeCompanionRoleId =
      roles.value[Math.max(0, index - 1)]?.id ?? roles.value[0]?.id ?? ''
  }
}

function createCompanionRole(): CompanionRole {
  return {
    id: createRoleId(),
    enabled: true,
    name: defaultRoleName(),
    appearancePackId: 'builtin',
    userNickname: '',
    personality: '',
    speechStyle: '',
    relationship: '',
    background: '',
    greeting: '',
    greetingMode: 'default',
    alternateGreetings: [],
    proactiveStyle: '',
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
  try {
    ensureElectronBridge(t('settings.catAppearance.role.actions.importRole'))
  } catch (error) {
    toast.error(errorToText(error, t('settings.catAppearance.role.toasts.importRoleFailed')))
    return
  }
  roleImportInput.value?.click()
}

function openRoleCardImport(): void {
  try {
    ensureElectronBridge(t('settings.catAppearance.role.actions.importCard'))
  } catch (error) {
    toast.error(errorToText(error, t('settings.catAppearance.role.toasts.importCardFailed')))
    return
  }
  roleCardImportDialogOpen.value = true
}

async function exportActiveRoleCard(): Promise<void> {
  if (!activeRole.value || exportingRoleCard.value) return

  try {
    ensureElectronBridge(t('settings.catAppearance.role.actions.exportCard'))
  } catch (error) {
    toast.error(errorToText(error, t('settings.catAppearance.role.toasts.exportCardFailed')))
    return
  }

  exportingRoleCard.value = true
  try {
    const result = await appBridge.companionRole.exportCard({
      role: createExportRoleDraft(activeRole.value),
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
  roleCardInput.value?.click()
}

async function importRole(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || importingRole.value) return

  importingRole.value = true
  try {
    const result = await appBridge.companionRole.importCard({
      content: await file.text(),
      sourceKind: 'json',
      mimeType: file.type || 'application/json',
      sourceName: file.name,
    })
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
  const nextRole = createRoleFromImportedDraft(result.role, result.source)
  roles.value.push(nextRole)
  props.draft.app.activeCompanionRoleId = nextRole.id
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
    enabled: true,
    name: draft.name?.trim() || defaultRoleName(),
    appearancePackId: draft.appearancePackId || 'builtin',
    userNickname: draft.userNickname ?? '',
    personality: draft.personality ?? '',
    speechStyle: draft.speechStyle ?? '',
    relationship: draft.relationship ?? '',
    background: draft.background ?? '',
    greeting: draft.greeting ?? '',
    greetingMode: 'default',
    alternateGreetings: normalizeStringList(draft.alternateGreetings),
    proactiveStyle: draft.proactiveStyle ?? '',
    advanced: {
      enabled: Boolean(draft.advanced?.enabled),
      systemPrompt: draft.advanced?.systemPrompt ?? '',
      knowledge: draft.advanced?.knowledge ?? '',
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
    greeting: role.greeting,
    alternateGreetings: [...role.alternateGreetings],
    proactiveStyle: role.proactiveStyle,
    advanced: {
      enabled: role.advanced.enabled,
      systemPrompt: role.advanced.systemPrompt,
      knowledge: role.advanced.knowledge,
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
    source: role.source,
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
  <SidebarProvider
    class="h-full min-h-0 w-full bg-muted/40"
    :default-open="true"
  >
    <Sidebar
      data-sidebar="sidebar"
      collapsible="none"
      class="border-r bg-sidebar/95"
    >
      <SidebarHeader>
        <div class="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            :aria-label="t('settings.sidebar.backToChat')"
            @click="router.push('/')"
          >
            <ArrowLeftIcon />
          </Button>
          <span class="truncate text-sm font-medium">{{ t('settings.catAppearance.title') }}</span>
          <input
            ref="roleImportInput"
            class="sr-only"
            type="file"
            accept=".json,.omnipaw-role.json,application/json"
            @change="importRole"
          >
          <input
            ref="roleCardInput"
            class="sr-only"
            type="file"
            accept=".json,.png,.webp,application/json,image/png,image/webp"
            @change="importRoleCard"
          >
        </div>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        <SidebarGroup>
          <div class="flex items-center justify-between gap-2 px-2">
            <div class="relative min-w-0 flex-1">
              <SearchIcon class="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <SidebarInput
                v-model="roleSearchQuery"
                class="pl-8"
                :aria-label="t('settings.catAppearance.role.searchLabel')"
                :placeholder="t('settings.catAppearance.role.searchPlaceholder')"
              />
            </div>
            <Badge variant="outline">
              {{ filteredRoles.length }}
            </Badge>
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  :aria-label="t('settings.catAppearance.role.actions.more')"
                >
                  <MoreHorizontalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuItem @select="createRole">
                    <PlusIcon data-icon="inline-start" />
                    {{ t('settings.catAppearance.role.actions.add') }}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    :disabled="importRoleDisabled"
                    @select="chooseRoleFile"
                  >
                    <FileJsonIcon data-icon="inline-start" />
                    {{ t('settings.catAppearance.role.actions.importRole') }}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    :disabled="importRoleCardDisabled"
                    @select="openRoleCardImport"
                  >
                    <FileJsonIcon data-icon="inline-start" />
                    {{ t('settings.catAppearance.role.actions.importCard') }}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem
                v-for="item in filteredRoles"
                :key="item.id"
                class="after:pointer-events-none after:absolute after:inset-x-4 after:bottom-0 after:h-px after:bg-gradient-to-r after:from-transparent after:via-sidebar-border after:to-transparent last:after:hidden"
              >
                <SidebarMenuButton
                  size="lg"
                  :is-active="item.id === activeRoleId"
                  :tooltip="item.name || t('settings.catAppearance.role.unnamed')"
                  :aria-current="item.id === activeRoleId ? 'true' : undefined"
                  @click="selectRole(item)"
                >
                  <SparklesIcon />
                  <span>
                    {{ item.name || t('settings.catAppearance.role.unnamed') }}
                  </span>
                  <CheckIcon
                    v-if="item.id === activeRoleId"
                    class="ml-auto text-primary"
                  />
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
            <p
              v-if="!filteredRoles.length"
              class="px-3 py-6 text-center text-sm text-muted-foreground"
            >
              {{ t('settings.catAppearance.role.noSearchMatch') }}
            </p>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>

    <SidebarInset class="h-full overflow-hidden">
      <main class="relative flex h-full min-h-0 flex-1 flex-col bg-transparent">
        <div class="mx-auto flex h-full min-h-0 w-full max-w-6xl flex-1 flex-col overflow-hidden px-4 py-4 md:px-6 md:py-6">
          <CompanionRoleEditor
            v-if="activeRole"
            :role="activeRole"
            :can-delete-role="canDeleteRole"
            @duplicate-role="duplicateActiveRole"
            @export-role="exportActiveRoleCard"
            @delete-role="deleteRole"
          />
        </div>
      </main>
    </SidebarInset>

    <RoleCardImportDialog
      v-model:open="roleCardImportDialogOpen"
      v-model:json-content="roleCardJsonContent"
      :import-disabled="importRoleCardDisabled"
      :can-import-json="canImportRoleCardJson"
      @choose-file="chooseRoleCardFile"
      @import-json="importPastedRoleCard"
    />
  </SidebarProvider>
</template>

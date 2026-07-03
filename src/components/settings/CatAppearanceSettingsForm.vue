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
  ChevronDownIcon,
  FileJsonIcon,
  PlusIcon,
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { Textarea } from '@/components/ui/textarea'
import { errorToText, useToast } from '@/utils/toast'

type CompanionRole = BridgeDesktopSettingsConfig['app']['companionRoles'][number]

const props = defineProps<{
  draft: BridgeDesktopSettingsConfig
}>()

const { t } = useI18n()
const router = useRouter()
const toast = useToast()

const rolesOpen = ref(true)
const roleCardInput = ref<HTMLInputElement>()
const roleCardImportDialogOpen = ref(false)
const roleCardJsonContent = ref('')
const importingRoleCard = ref(false)

const roles = computed(() => props.draft.app.companionRoles)
const activeRoleId = computed(() => props.draft.app.activeCompanionRoleId)
const activeRole = computed(
  () => roles.value.find((role) => role.id === activeRoleId.value) ?? roles.value[0]
)
const canDeleteRole = computed(() => roles.value.length > 1)
const importRoleCardDisabled = computed(() => importingRoleCard.value || isFallbackBridge)
const canImportRoleCardJson = computed(
  () => !importRoleCardDisabled.value && roleCardJsonContent.value.trim().length > 0
)

function selectRole(target: CompanionRole): void {
  props.draft.app.activeCompanionRoleId = target.id
  rolesOpen.value = true
}

function createRole(): void {
  const nextRole = createCompanionRole()
  roles.value.push(nextRole)
  props.draft.app.activeCompanionRoleId = nextRole.id
  rolesOpen.value = true
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
    interactionMode: 'companion',
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

function openRoleCardImport(): void {
  try {
    ensureElectronBridge(t('settings.catAppearance.role.actions.importCard'))
  } catch (error) {
    toast.error(errorToText(error, t('settings.catAppearance.role.toasts.importCardFailed')))
    return
  }
  roleCardImportDialogOpen.value = true
}

function chooseRoleCardFile(): void {
  roleCardInput.value?.click()
}

async function importRoleCard(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || importingRoleCard.value) return

  importingRoleCard.value = true
  try {
    const request = await createRoleCardImportRequest(file)
    const result = await appBridge.companionRole.importCard(request)
    applyImportedRoleCard(result)
  } catch (error) {
    toast.error(errorToText(error, t('settings.catAppearance.role.toasts.importCardFailed')))
  } finally {
    importingRoleCard.value = false
  }
}

async function importPastedRoleCard(): Promise<void> {
  const content = roleCardJsonContent.value.trim()
  if (!content || importingRoleCard.value) return

  importingRoleCard.value = true
  try {
    const result = await appBridge.companionRole.importCard({
      content,
      sourceKind: 'json',
      mimeType: 'application/json',
      sourceName: t('settings.catAppearance.role.importDialog.pastedSourceName'),
    })
    applyImportedRoleCard(result)
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

function applyImportedRoleCard(
  result: Awaited<ReturnType<typeof appBridge.companionRole.importCard>>
): void {
  const nextRole = createRoleFromImportedDraft(result.role, result.source)
  roles.value.push(nextRole)
  props.draft.app.activeCompanionRoleId = nextRole.id
  rolesOpen.value = true
  roleCardImportDialogOpen.value = false
  toast.success(t('settings.catAppearance.role.toasts.importCardSuccess'), {
    description: t('settings.catAppearance.role.toasts.importCardSummary', {
      name: nextRole.name,
      count: result.knowledgeEntryCount,
    }),
  })
}

function createRoleFromImportedDraft(
  draft: ImportedCompanionRoleDraft,
  source: CompanionRoleSourceMetadata
): CompanionRole {
  return {
    id: createRoleId(),
    enabled: true,
    name: draft.name?.trim() || defaultRoleName(),
    appearancePackId: 'builtin',
    userNickname: draft.userNickname ?? '',
    personality: draft.personality ?? '',
    speechStyle: draft.speechStyle ?? '',
    relationship: draft.relationship ?? '',
    background: draft.background ?? '',
    greeting: draft.greeting ?? '',
    greetingMode: 'default',
    alternateGreetings: normalizeStringList(draft.alternateGreetings),
    proactiveStyle: draft.proactiveStyle ?? '',
    interactionMode: source.kind === 'manual' ? 'companion' : 'roleplay',
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
  <SidebarProvider class="h-full min-h-0 w-full">
    <Sidebar
      collapsible="offcanvas"
      class="border-r"
    >
      <SidebarHeader>
        <div class="flex items-center gap-2">
          <SidebarTrigger class="md:hidden" />
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
        <Collapsible v-model:open="rolesOpen">
          <SidebarGroup>
            <div class="flex items-center justify-between gap-2 px-2">
              <button
                type="button"
                class="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium text-sidebar-foreground outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2"
                @click="rolesOpen = !rolesOpen"
              >
                <ChevronDownIcon
                  class="transition-transform"
                  :class="rolesOpen ? '' : '-rotate-90'"
                />
                <span class="truncate">{{ t('settings.catAppearance.role.listTitle') }}</span>
                <Badge
                  variant="outline"
                  class="ml-auto"
                >
                  {{ roles.length }}
                </Badge>
              </button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                :disabled="importRoleCardDisabled"
                :aria-label="t('settings.catAppearance.role.actions.importCard')"
                @click="openRoleCardImport"
              >
                <FileJsonIcon />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                :aria-label="t('settings.catAppearance.role.actions.add')"
                @click="createRole"
              >
                <PlusIcon />
              </Button>
            </div>

            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem
                    v-for="item in roles"
                    :key="item.id"
                  >
                    <SidebarMenuButton
                      size="lg"
                      :is-active="item.id === activeRoleId"
                      :tooltip="item.name || t('settings.catAppearance.role.unnamed')"
                      @click="selectRole(item)"
                    >
                      <SparklesIcon />
                      <span>
                        {{ item.name || t('settings.catAppearance.role.unnamed') }}
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </SidebarGroup>
        </Collapsible>
      </SidebarContent>
    </Sidebar>

    <SidebarInset class="h-full overflow-hidden">
      <main class="relative flex h-full min-h-0 flex-1 flex-col bg-muted/40">
        <SidebarTrigger class="absolute left-3 top-3 md:hidden" />

        <div class="mx-auto flex h-full min-h-0 w-full max-w-6xl flex-1 flex-col overflow-hidden px-4 py-4 md:px-6 md:py-6">
          <CompanionRoleEditor
            v-if="activeRole"
            :role="activeRole"
            :can-delete-role="canDeleteRole"
            @duplicate-role="duplicateActiveRole"
            @delete-role="deleteRole"
          />
        </div>
      </main>
    </SidebarInset>

    <Dialog v-model:open="roleCardImportDialogOpen">
      <DialogContent class="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{{ t('settings.catAppearance.role.importDialog.title') }}</DialogTitle>
          <DialogDescription>
            {{ t('settings.catAppearance.role.importDialog.description') }}
          </DialogDescription>
        </DialogHeader>

        <div class="flex flex-col gap-3">
          <Textarea
            v-model="roleCardJsonContent"
            class="min-h-52 font-mono text-xs"
            :placeholder="t('settings.catAppearance.role.importDialog.jsonPlaceholder')"
          />
        </div>

        <DialogFooter class="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            :disabled="importRoleCardDisabled"
            @click="chooseRoleCardFile"
          >
            <FileJsonIcon data-icon="inline-start" />
            {{ t('settings.catAppearance.role.importDialog.chooseFile') }}
          </Button>
          <Button
            type="button"
            :disabled="!canImportRoleCardJson"
            @click="importPastedRoleCard"
          >
            {{ t('settings.catAppearance.role.importDialog.importJson') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </SidebarProvider>
</template>

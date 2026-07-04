<script setup lang="ts">
import {
  CatIcon,
  ClockIcon,
  EyeIcon,
  MessageSquareIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  SparklesIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-vue-next'
import { type CSSProperties, computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ChatCompanionRoleOption } from '@/components/chat/chat-workspace-context'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import type { Session } from '@/composables/useSessions'
import { cn } from '@/lib/utils'

type SessionKindFilter = 'chat' | 'cat' | 'cron' | 'vision'
type SessionMode = Extract<SessionKindFilter, 'chat'>
type SessionRoleSignatureKind = 'known' | 'captured' | 'unknown' | 'unassigned'

interface SessionRoleSignature {
  label: string
  identity: string
  kind: SessionRoleSignatureKind
}

interface SidebarSessionItem {
  session: Session
  role: SessionRoleSignature | null
}

const props = withDefaults(
  defineProps<{
    sessions: Session[]
    activeSessionId?: string
    sessionMode?: SessionMode
    sessionKindFilter?: SessionKindFilter
    companionRoleOptions?: ChatCompanionRoleOption[]
    creating?: boolean
    runningSessionIds?: string[]
  }>(),
  {
    sessionMode: 'chat',
    sessionKindFilter: 'chat',
    companionRoleOptions: () => [],
    runningSessionIds: () => [],
  }
)

const emit = defineEmits<{
  newChat: []
  selectSession: [sessionId: string]
  updateSessionMode: [mode: SessionMode]
  updateSessionKindFilter: [kind: SessionKindFilter]
  openSettings: []
  openRoles: []
  toggleCat: []
  renameSession: [sessionId: string, title: string]
  deleteSession: [sessionId: string]
}>()

const { t } = useI18n()

const searchQuery = ref('')
const renameDialogOpen = ref(false)
const renameSessionId = ref<string | null>(null)
const renameTitleDraft = ref('')
const deleteDialogOpen = ref(false)
const deleteSessionId = ref<string | null>(null)

const sessionModeOptions = computed(() => [
  {
    value: 'chat' as SessionMode,
    label: t('chat.sidebar.mode.chat.label'),
    title: t('chat.sidebar.mode.chat.title'),
    newLabel: t('chat.sidebar.newChat'),
    icon: MessageSquareIcon,
  },
])

const sessionKindOptions = computed(() => [
  {
    value: 'chat' as SessionKindFilter,
    label: t('chat.sidebar.kind.chat.label'),
    title: t('chat.sidebar.kind.chat.title'),
    icon: MessageSquareIcon,
  },
  {
    value: 'cat' as SessionKindFilter,
    label: t('chat.sidebar.kind.cat.label'),
    title: t('chat.sidebar.kind.cat.title'),
    icon: CatIcon,
  },
  {
    value: 'cron' as SessionKindFilter,
    label: t('chat.sidebar.kind.cron.label'),
    title: t('chat.sidebar.kind.cron.title'),
    icon: ClockIcon,
  },
  {
    value: 'vision' as SessionKindFilter,
    label: t('chat.sidebar.kind.vision.label'),
    title: t('chat.sidebar.kind.vision.title'),
    icon: EyeIcon,
  },
])

const normalizedSearchQuery = computed(() => searchQuery.value.trim().toLowerCase())
const hasSearchQuery = computed(() => normalizedSearchQuery.value.length > 0)
const runningSessionIdSet = computed(() => new Set(props.runningSessionIds))
const activeSessionMode = computed<SessionMode>(() => props.sessionMode)
const activeSessionModeOption = computed(
  () =>
    sessionModeOptions.value.find((option) => option.value === activeSessionMode.value) ||
    sessionModeOptions.value[0]
)
const activeSessionKindOption = computed(
  () =>
    sessionKindOptions.value.find((option) => option.value === props.sessionKindFilter) ||
    sessionKindOptions.value[0]
)
const sessionListLabel = computed(() => activeSessionKindOption.value.title)
const newChatLabel = computed(() => activeSessionModeOption.value.newLabel)
const filteredSessionItems = computed<SidebarSessionItem[]>(() => {
  const items = props.sessions.map((session) => ({
    session,
    role: sessionRoleSignature(session),
  }))
  const query = normalizedSearchQuery.value
  if (!query) return items

  return items.filter(({ session, role }) => {
    const title = sessionTitle(session).toLowerCase()
    const roleLabel = role?.label.toLowerCase() ?? ''
    const roleIdentity = role?.identity.toLowerCase() ?? ''
    return (
      title.includes(query) ||
      roleLabel.includes(query) ||
      roleIdentity.includes(query) ||
      session.id.toLowerCase().includes(query)
    )
  })
})

const renameTarget = computed(() =>
  renameSessionId.value
    ? props.sessions.find((session) => session.id === renameSessionId.value) || null
    : null
)

const deleteTarget = computed(() =>
  deleteSessionId.value
    ? props.sessions.find((session) => session.id === deleteSessionId.value) || null
    : null
)

const deleteTargetTitle = computed(() =>
  deleteTarget.value
    ? sessionTitle(deleteTarget.value)
    : t('chat.sidebar.deleteDialog.fallbackTarget')
)

const deleteTargetIsActive = computed(() =>
  Boolean(deleteSessionId.value && deleteSessionId.value === props.activeSessionId)
)

const deleteTargetIsRunning = computed(() =>
  Boolean(deleteSessionId.value && isSessionRunning(deleteSessionId.value))
)

const emptyTitle = computed(() => {
  if (props.sessions.length === 0) {
    return t('chat.sidebar.empty.noSessions', { kind: sessionListLabel.value })
  }
  return t('chat.sidebar.empty.noResults')
})

const emptyDescription = computed(() => {
  if (props.sessions.length === 0) {
    if (props.sessionKindFilter === activeSessionMode.value) {
      return t('chat.sidebar.empty.createHint', { newLabel: newChatLabel.value })
    }
    return t('chat.sidebar.empty.kindHint', { kindTitle: activeSessionKindOption.value.title })
  }
  return t('chat.sidebar.empty.searchHint')
})

watch(renameDialogOpen, (open) => {
  if (open) return
  renameSessionId.value = null
  renameTitleDraft.value = ''
})

watch(deleteDialogOpen, (open) => {
  if (open) return
  deleteSessionId.value = null
})

function sessionRawTitle(session: Session) {
  return session.title?.trim() || session.display_name?.trim() || ''
}

function sessionTitle(session: Session) {
  return sessionRawTitle(session) || t('chat.sidebar.session.defaultTitle')
}

function sessionTooltip(session: Session, role: SessionRoleSignature | null) {
  if (!role) return sessionTitle(session)
  return t('chat.sidebar.sessionRole.tooltip', {
    title: sessionTitle(session),
    role: role.label,
  })
}

function sessionRoleSignature(session: Session): SessionRoleSignature | null {
  if (!shouldShowSessionRole(session)) return null

  const roleInstruction = session.systemContext?.role
  const roleRefId = roleInstruction?.refId?.trim()
  const configuredRole = roleRefId
    ? props.companionRoleOptions.find((role) => role.id === roleRefId)
    : undefined
  const configuredName = configuredRole?.name.trim()
  if (configuredName && roleRefId) {
    return {
      label: configuredName,
      identity: roleRefId,
      kind: 'known',
    }
  }

  const capturedLabel = roleInstruction?.label?.trim()
  if (capturedLabel) {
    return {
      label: capturedLabel,
      identity: roleRefId || capturedLabel,
      kind: 'captured',
    }
  }

  if (roleRefId) {
    return {
      label: t('chat.sidebar.sessionRole.unknown'),
      identity: roleRefId,
      kind: 'unknown',
    }
  }

  return {
    label: t('chat.sidebar.sessionRole.unassigned'),
    identity: `${session.id}:unassigned`,
    kind: 'unassigned',
  }
}

function shouldShowSessionRole(session: Session) {
  const kind = session.kind ?? 'chat'
  return kind === 'chat' || kind === 'cat'
}

function sessionRoleBadgeStyle(role: SessionRoleSignature): CSSProperties {
  const hue = stableHue(role.identity)
  const soft = role.kind === 'unknown' || role.kind === 'unassigned'
  const lightness = soft ? 0.68 : 0.74
  const chroma = soft ? 0.04 : 0.13

  return {
    '--session-role-accent': `oklch(${lightness} ${chroma} ${hue})`,
    backgroundColor: 'color-mix(in oklab, var(--session-role-accent) 12%, var(--sidebar-accent))',
    borderColor: 'color-mix(in oklab, var(--session-role-accent) 34%, var(--sidebar-border))',
    color: 'color-mix(in oklab, var(--session-role-accent) 50%, var(--sidebar-foreground))',
  } as CSSProperties
}

function stableHue(input: string) {
  let hash = 0
  for (const char of input) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  }
  return hash % 360
}

function isSessionRunning(sessionId: string) {
  return runningSessionIdSet.value.has(sessionId)
}

function openRenameDialog(session: Session) {
  renameSessionId.value = session.id
  renameTitleDraft.value = sessionRawTitle(session)
  renameDialogOpen.value = true
}

function confirmRename() {
  const sessionId = renameSessionId.value
  if (!sessionId) return

  const nextTitle = renameTitleDraft.value.trim()
  const currentTitle = renameTarget.value ? sessionRawTitle(renameTarget.value) : ''
  if (nextTitle !== currentTitle) {
    emit('renameSession', sessionId, nextTitle)
  }
  renameDialogOpen.value = false
}

function openDeleteDialog(session: Session) {
  deleteSessionId.value = session.id
  deleteDialogOpen.value = true
}

function confirmDelete() {
  const sessionId = deleteSessionId.value
  if (!sessionId) return

  emit('deleteSession', sessionId)
  deleteDialogOpen.value = false
}

function clearSearch() {
  searchQuery.value = ''
}

function updateSessionKindFilter(value: unknown) {
  if (!value || typeof value !== 'string') return
  if (value !== 'chat' && value !== 'cat' && value !== 'cron' && value !== 'vision') {
    return
  }
  emit('updateSessionKindFilter', value)
}
</script>

<template>
  <Sidebar
    collapsible="icon"
    class="group-data-[collapsible=icon]:border-r-0! group-data-[collapsible=icon]:*:data-[slot=sidebar-inner]:bg-transparent"
  >
    <SidebarHeader class="gap-1.5">
      <div class="flex items-center gap-2">
        <SidebarTrigger />
      </div>

      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            size="sm"
            :disabled="creating"
            :tooltip="t('chat.sidebar.newChat')"
            :aria-label="t('chat.sidebar.newChat')"
            @click="emit('newChat')"
          >
            <PlusIcon />
            <span>{{ t('chat.sidebar.newChat') }}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>

    </SidebarHeader>

    <SidebarSeparator class="group-data-[collapsible=icon]:hidden" />

    <SidebarContent>
      <SidebarGroup class="group-data-[collapsible=icon]:hidden">
        <SidebarGroupContent>
          <div class="group-data-[collapsible=icon]:hidden mb-2 flex items-center gap-2">
            <InputGroup>
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                v-model="searchQuery"
                :aria-label="t('chat.sidebar.search.ariaLabel')"
                :placeholder="t('chat.sidebar.search.placeholder')"
              />
              <InputGroupAddon
                v-if="hasSearchQuery"
                align="inline-end"
              >
                <InputGroupButton
                  size="icon-xs"
                  :aria-label="t('chat.sidebar.search.clearAriaLabel')"
                  @click="clearSearch"
                >
                  <XIcon data-icon="inline-start" />
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>

            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button
                  variant="outline"
                  size="icon-sm"
                  :aria-label="t('chat.sidebar.search.filterAriaLabel', { kind: activeSessionKindOption.title })"
                >
                  <component
                    :is="activeSessionKindOption.icon"
                    data-icon="inline-start"
                  />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                class="w-36"
              >
                <DropdownMenuLabel>{{ t('chat.sidebar.search.kindLabel') }}</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  :model-value="sessionKindFilter"
                  @update:model-value="updateSessionKindFilter"
                >
                  <DropdownMenuRadioItem
                    v-for="option in sessionKindOptions"
                    :key="option.value"
                    :value="option.value"
                  >
                    <component
                      :is="option.icon"
                      data-icon="inline-start"
                    />
                    {{ option.label }}
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <SidebarMenu>
            <SidebarMenuItem
              v-for="item in filteredSessionItems"
              :key="item.session.id"
            >
              <SidebarMenuButton
                :is-active="item.session.id === activeSessionId"
                :tooltip="sessionTooltip(item.session, item.role)"
                :class="cn('min-w-0 gap-1.5', isSessionRunning(item.session.id) && 'pr-12')"
                @click="emit('selectSession', item.session.id)"
              >
                <span
                  v-if="isSessionRunning(item.session.id)"
                  class="size-1.5 shrink-0 rounded-full bg-primary"
                  aria-hidden="true"
                />
                <span class="min-w-0 flex-1 truncate">{{ sessionTitle(item.session) }}</span>
                <Badge
                  v-if="item.role"
                  variant="outline"
                  class="ml-auto h-5 max-w-[5.75rem] rounded-md px-1.5 py-0 text-[11px] font-medium leading-none shadow-none transition-colors group-data-active/menu-button:bg-sidebar/80"
                  :style="sessionRoleBadgeStyle(item.role)"
                  :aria-label="t('chat.sidebar.sessionRole.ariaLabel', { role: item.role.label })"
                >
                  <SparklesIcon data-icon="inline-start" />
                  <span class="min-w-0 truncate">{{ item.role.label }}</span>
                </Badge>
              </SidebarMenuButton>

              <span
                v-if="isSessionRunning(item.session.id)"
                class="sr-only"
              >
                {{ t('chat.sidebar.session.running') }}
              </span>

              <DropdownMenu>
                <DropdownMenuTrigger as-child>
                  <SidebarMenuAction
                    show-on-hover
                    :aria-label="t('chat.sidebar.session.actionAriaLabel', { title: sessionTitle(item.session) })"
                    @click.stop
                  >
                    <MoreHorizontalIcon />
                  </SidebarMenuAction>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  class="w-40"
                >
                  <DropdownMenuGroup>
                    <DropdownMenuItem @select="openRenameDialog(item.session)">
                      <PencilIcon />
                      {{ t('chat.sidebar.session.rename') }}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      @select="openDeleteDialog(item.session)"
                    >
                      <Trash2Icon />
                      {{ t('chat.sidebar.session.delete') }}
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>

    <SidebarSeparator class="group-data-[collapsible=icon]:hidden" />

    <SidebarFooter class="items-end group-data-[collapsible=icon]:items-center">
      <SidebarMenu>
        <SidebarMenuItem
          class="flex justify-end gap-2 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:gap-2"
        >
          <SidebarMenuButton
            class="w-auto"
            size="default"
            :tooltip="t('chat.sidebar.footer.cat')"
            :aria-label="t('chat.sidebar.footer.cat')"
            @click="emit('toggleCat')"
          >
            <CatIcon />
          </SidebarMenuButton>

          <SidebarMenuButton
            class="w-auto"
            size="default"
            :tooltip="t('chat.sidebar.footer.roles')"
            :aria-label="t('chat.sidebar.footer.roles')"
            @click="emit('openRoles')"
          >
            <SparklesIcon />
          </SidebarMenuButton>

          <SidebarMenuButton
            class="w-auto"
            size="default"
            :tooltip="t('chat.sidebar.footer.settings')"
            :aria-label="t('chat.sidebar.footer.settings')"
            @click="emit('openSettings')"
          >
            <SettingsIcon />
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  </Sidebar>

  <Dialog v-model:open="renameDialogOpen">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ t('chat.sidebar.renameDialog.title') }}</DialogTitle>
        <DialogDescription>
          {{ t('chat.sidebar.renameDialog.description') }}
        </DialogDescription>
      </DialogHeader>

      <form
        class="flex flex-col gap-4"
        @submit.prevent="confirmRename"
      >
        <FieldGroup>
          <Field>
            <FieldLabel for="chat-session-title">
              {{ t('chat.sidebar.renameDialog.label') }}
            </FieldLabel>
            <Input
              id="chat-session-title"
              v-model="renameTitleDraft"
              autofocus
              :placeholder="t('chat.sidebar.renameDialog.placeholder')"
            />
          </Field>
        </FieldGroup>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            @click="renameDialogOpen = false"
          >
            {{ t('chat.sidebar.renameDialog.cancel') }}
          </Button>
          <Button type="submit">
            {{ t('chat.sidebar.renameDialog.save') }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>

  <Dialog v-model:open="deleteDialogOpen">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ t('chat.sidebar.deleteDialog.title') }}</DialogTitle>
        <DialogDescription>
          {{ t('chat.sidebar.deleteDialog.description', { target: deleteTargetTitle }) }}
          <span v-if="deleteTargetIsActive">
            {{ t('chat.sidebar.deleteDialog.activeWarning') }}
          </span>
          <span v-if="deleteTargetIsRunning">
            {{ t('chat.sidebar.deleteDialog.runningWarning') }}
          </span>
        </DialogDescription>
      </DialogHeader>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          @click="deleteDialogOpen = false"
        >
          {{ t('chat.sidebar.deleteDialog.cancel') }}
        </Button>
        <Button
          type="button"
          variant="destructive"
          @click="confirmDelete"
        >
          {{ t('chat.sidebar.deleteDialog.confirm') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

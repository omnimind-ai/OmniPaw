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
  Trash2Icon,
  XIcon,
} from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ChatCompanionRoleOption } from '@/components/chat/chat-workspace-context'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
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
import { useCompanionRoleIdleImages } from '@/composables/useCompanionRoleIdleImages'
import type { Session } from '@/composables/useSessions'
import { cn } from '@/lib/utils'

type SessionKindFilter = 'chat' | 'cat' | 'cron' | 'vision'
type SessionMode = Extract<SessionKindFilter, 'chat'>

const props = withDefaults(
  defineProps<{
    sessions: Session[]
    activeSessionId?: string
    sessionMode?: SessionMode
    sessionKindFilter?: SessionKindFilter
    companionRoleOptions?: ChatCompanionRoleOption[]
    activeCompanionRoleId?: string
    companionRoleSaving?: boolean
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
  selectCompanionRole: [roleId: string]
  openSettings: []
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
const companionRoleAppearancePackIds = computed(() =>
  props.companionRoleOptions.map((role) => role.appearancePackId)
)
const { idleImageByPackId } = useCompanionRoleIdleImages(companionRoleAppearancePackIds)
const activeCompanionRole = computed(
  () =>
    props.companionRoleOptions.find((role) => role.id === props.activeCompanionRoleId) ??
    props.companionRoleOptions[0]
)
const activeCompanionRoleName = computed(
  () => activeCompanionRole.value?.name || t('chat.sidebar.footer.role.fallbackName')
)
const activeCompanionRoleDescription = computed(
  () => activeCompanionRole.value?.description || t('chat.sidebar.footer.role.descriptionFallback')
)
const filteredSessions = computed(() => {
  const query = normalizedSearchQuery.value
  if (!query) return props.sessions

  return props.sessions.filter((session) => {
    const title = sessionTitle(session).toLowerCase()
    return title.includes(query) || session.id.toLowerCase().includes(query)
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

function sessionTooltip(session: Session) {
  return sessionTitle(session)
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

function roleAvatarUrl(role: ChatCompanionRoleOption | undefined): string {
  if (!role) return idleImageByPackId.value.builtin
  return idleImageByPackId.value[role.appearancePackId] || idleImageByPackId.value.builtin
}

function roleInitial(role: ChatCompanionRoleOption | undefined): string {
  return roleDisplayName(role).slice(0, 1)
}

function roleDisplayName(role: ChatCompanionRoleOption | undefined): string {
  return role?.name.trim() || t('chat.sidebar.footer.role.fallbackName')
}

function updateCompanionRole(value: unknown): void {
  if (typeof value !== 'string' || !value || props.companionRoleSaving) return
  if (value === props.activeCompanionRoleId) return
  emit('selectCompanionRole', value)
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
                  class="border-border/70 bg-transparent text-foreground shadow-none backdrop-blur-sm hover:bg-background/35 hover:text-foreground aria-expanded:bg-background/45 aria-expanded:text-foreground data-[state=open]:bg-background/45 data-[state=open]:text-foreground"
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
              v-for="session in filteredSessions"
              :key="session.id"
            >
              <SidebarMenuButton
                :is-active="session.id === activeSessionId"
                :tooltip="sessionTooltip(session)"
                :class="cn('min-w-0 gap-1.5', isSessionRunning(session.id) && 'pr-12')"
                @click="emit('selectSession', session.id)"
              >
                <span
                  v-if="isSessionRunning(session.id)"
                  class="size-1.5 shrink-0 rounded-full bg-primary"
                  aria-hidden="true"
                />
                <span class="min-w-0 flex-1 truncate">{{ sessionTitle(session) }}</span>
              </SidebarMenuButton>

              <span
                v-if="isSessionRunning(session.id)"
                class="sr-only"
              >
                {{ t('chat.sidebar.session.running') }}
              </span>

              <DropdownMenu>
                <DropdownMenuTrigger as-child>
                  <SidebarMenuAction
                    show-on-hover
                    :aria-label="t('chat.sidebar.session.actionAriaLabel', { title: sessionTitle(session) })"
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
                    <DropdownMenuItem @select="openRenameDialog(session)">
                      <PencilIcon />
                      {{ t('chat.sidebar.session.rename') }}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      @select="openDeleteDialog(session)"
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

    <SidebarFooter class="group-data-[collapsible=icon]:items-center">
      <SidebarMenu>
        <SidebarMenuItem
          class="flex items-center gap-1 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-2"
        >
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <SidebarMenuButton
                size="lg"
                class="min-w-0 flex-1 px-1.5 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-0!"
                :disabled="!activeCompanionRole"
                :tooltip="activeCompanionRoleName"
                :aria-label="t('chat.sidebar.footer.role.triggerAriaLabel', { role: activeCompanionRoleName })"
              >
                <Avatar>
                  <AvatarImage
                    :src="roleAvatarUrl(activeCompanionRole)"
                    :alt="t('chat.sidebar.footer.role.avatarAlt', { name: activeCompanionRoleName })"
                    class="object-contain p-0.5"
                  />
                  <AvatarFallback>{{ roleInitial(activeCompanionRole) }}</AvatarFallback>
                </Avatar>
                <div class="grid min-w-0 flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
                  <span class="truncate text-sm font-medium">{{ activeCompanionRoleName }}</span>
                  <span class="truncate text-xs text-muted-foreground">
                    {{ activeCompanionRoleDescription }}
                  </span>
                </div>
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="top"
              align="start"
              :side-offset="8"
              class="w-64"
            >
              <DropdownMenuLabel>{{ t('chat.sidebar.footer.role.menuLabel') }}</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                :model-value="activeCompanionRoleId"
                @update:model-value="updateCompanionRole"
              >
                <DropdownMenuRadioItem
                  v-for="role in companionRoleOptions"
                  :key="role.id"
                  :value="role.id"
                  :disabled="companionRoleSaving"
                  class="py-1.5"
                >
                  <Avatar class="size-9">
                    <AvatarImage
                      :src="roleAvatarUrl(role)"
                      :alt="t('chat.sidebar.footer.role.avatarAlt', { name: roleDisplayName(role) })"
                      class="object-contain p-0.5"
                    />
                    <AvatarFallback>{{ roleInitial(role) }}</AvatarFallback>
                  </Avatar>
                  <div class="grid min-w-0 flex-1 leading-tight">
                    <span class="truncate font-medium">{{ roleDisplayName(role) }}</span>
                  </div>
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <div class="flex shrink-0 items-center gap-1 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-2">
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
              :tooltip="t('chat.sidebar.footer.settings')"
              :aria-label="t('chat.sidebar.footer.settings')"
              @click="emit('openSettings')"
            >
              <SettingsIcon />
            </SidebarMenuButton>
          </div>
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

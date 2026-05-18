<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  CatIcon,
  MessageSquareIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-vue-next'

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
  SidebarGroupLabel,
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

const props = withDefaults(
  defineProps<{
    sessions: Session[]
    activeSessionId?: string
    creating?: boolean
    runningSessionIds?: string[]
  }>(),
  {
    runningSessionIds: () => [],
  }
)

const emit = defineEmits<{
  newChat: []
  selectSession: [sessionId: string]
  openSettings: []
  toggleCat: []
  renameSession: [sessionId: string, title: string]
  deleteSession: [sessionId: string]
}>()

const searchQuery = ref('')
const renameDialogOpen = ref(false)
const renameSessionId = ref<string | null>(null)
const renameTitleDraft = ref('')
const deleteDialogOpen = ref(false)
const deleteSessionId = ref<string | null>(null)

const normalizedSearchQuery = computed(() => searchQuery.value.trim().toLowerCase())
const hasSearchQuery = computed(() => normalizedSearchQuery.value.length > 0)
const runningSessionIdSet = computed(() => new Set(props.runningSessionIds))

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
  deleteTarget.value ? sessionTitle(deleteTarget.value) : '该会话'
)

const deleteTargetIsActive = computed(() =>
  Boolean(deleteSessionId.value && deleteSessionId.value === props.activeSessionId)
)

const deleteTargetIsRunning = computed(() =>
  Boolean(deleteSessionId.value && isSessionRunning(deleteSessionId.value))
)

const emptyTitle = computed(() => (props.sessions.length === 0 ? '暂无会话' : '未找到会话'))

const emptyDescription = computed(() =>
  props.sessions.length === 0
    ? '开始新的对话后，会话会出现在这里。'
    : '调整搜索关键词，或直接新建对话。'
)

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
  return sessionRawTitle(session) || '新会话'
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
</script>

<template>
  <Sidebar
    collapsible="icon"
    class="group-data-[collapsible=icon]:border-r-0! group-data-[collapsible=icon]:[&>[data-slot=sidebar-inner]]:bg-transparent"
  >
    <SidebarHeader>
      <div class="flex items-center gap-2">
        <SidebarTrigger />
      </div>

      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            :disabled="creating"
            tooltip="新建对话"
            @click="emit('newChat')"
          >
            <PlusIcon />
            <span>新建对话</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>

    <SidebarSeparator class="group-data-[collapsible=icon]:hidden" />

    <SidebarContent>
      <SidebarGroup class="group-data-[collapsible=icon]:hidden">
        <SidebarGroupLabel>Sessions</SidebarGroupLabel>
        <SidebarGroupContent>
          <div class="group-data-[collapsible=icon]:hidden mb-2">
            <InputGroup>
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                v-model="searchQuery"
                aria-label="搜索会话"
                placeholder="搜索会话..."
              />
              <InputGroupAddon
                v-if="hasSearchQuery"
                align="inline-end"
              >
                <InputGroupButton
                  size="icon-xs"
                  aria-label="清除会话搜索"
                  @click="clearSearch"
                >
                  <XIcon data-icon="inline-start" />
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </div>

          <SidebarMenu>
            <SidebarMenuItem
              v-for="session in filteredSessions"
              :key="session.id"
            >
              <SidebarMenuButton
                :is-active="session.id === activeSessionId"
                :tooltip="sessionTitle(session)"
                :class="cn(isSessionRunning(session.id) && 'pr-12')"
                @click="emit('selectSession', session.id)"
              >
                <MessageSquareIcon />
                <span
                  v-if="isSessionRunning(session.id)"
                  class="size-1.5 shrink-0 rounded-full bg-primary"
                  aria-hidden="true"
                />
                <span>{{ sessionTitle(session) }}</span>
              </SidebarMenuButton>

              <span
                v-if="isSessionRunning(session.id)"
                class="sr-only"
              >
                运行中
              </span>

              <DropdownMenu>
                <DropdownMenuTrigger as-child>
                  <SidebarMenuAction
                    show-on-hover
                    :aria-label="`${sessionTitle(session)} 操作`"
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
                      重命名
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      @select="openDeleteDialog(session)"
                    >
                      <Trash2Icon />
                      删除
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>

          <div
            v-if="!filteredSessions.length"
            class="group-data-[collapsible=icon]:hidden mt-2 flex flex-col gap-3 rounded-lg border border-dashed p-3 text-sm text-muted-foreground"
          >
            <div class="flex flex-col gap-1">
              <p class="font-medium text-sidebar-foreground">
                {{ emptyTitle }}
              </p>
              <p class="text-xs">
                {{ emptyDescription }}
              </p>
            </div>
            <div class="flex flex-wrap gap-2">
              <Button
                v-if="hasSearchQuery"
                type="button"
                variant="ghost"
                size="sm"
                @click="clearSearch"
              >
                <XIcon data-icon="inline-start" />
                清除搜索
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                :disabled="creating"
                @click="emit('newChat')"
              >
                <PlusIcon data-icon="inline-start" />
                新建对话
              </Button>
            </div>
          </div>
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
            tooltip="小猫悬浮球"
            aria-label="小猫悬浮球"
            @click="emit('toggleCat')"
          >
            <CatIcon />
          </SidebarMenuButton>

          <SidebarMenuButton
            class="w-auto"
            size="default"
            tooltip="设置"
            aria-label="设置"
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
        <DialogTitle>重命名会话</DialogTitle>
        <DialogDescription>
          修改侧栏中显示的会话名称。
        </DialogDescription>
      </DialogHeader>

      <form
        class="flex flex-col gap-4"
        @submit.prevent="confirmRename"
      >
        <FieldGroup>
          <Field>
            <FieldLabel for="chat-session-title">
              会话名称
            </FieldLabel>
            <Input
              id="chat-session-title"
              v-model="renameTitleDraft"
              autofocus
              placeholder="新会话"
            />
          </Field>
        </FieldGroup>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            @click="renameDialogOpen = false"
          >
            取消
          </Button>
          <Button type="submit">
            保存
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>

  <Dialog v-model:open="deleteDialogOpen">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>删除会话</DialogTitle>
        <DialogDescription>
          删除 {{ deleteTargetTitle }} 后，该会话和消息将从列表中移除。
          <span v-if="deleteTargetIsActive">
            如果它是当前会话，页面需要回到空对话状态。
          </span>
          <span v-if="deleteTargetIsRunning">
            该会话仍在运行，请确认后再删除。
          </span>
        </DialogDescription>
      </DialogHeader>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          @click="deleteDialogOpen = false"
        >
          取消
        </Button>
        <Button
          type="button"
          variant="destructive"
          @click="confirmDelete"
        >
          删除
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

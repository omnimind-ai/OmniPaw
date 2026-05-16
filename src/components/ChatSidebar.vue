<script setup lang="ts">
import { MessageSquareIcon, PlusIcon, SettingsIcon } from 'lucide-vue-next'

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import type { Session } from '@/composables/useSessions'

defineProps<{
  sessions: Session[]
  activeSessionId?: string
  creating?: boolean
}>()

const emit = defineEmits<{
  newChat: []
  selectSession: [sessionId: string]
  openSettings: []
}>()

function sessionTitle(session: Session) {
  return session.title?.trim() || session.display_name?.trim() || '新会话'
}
</script>

<template>
  <Sidebar collapsible="icon">
    <SidebarHeader>
      <div class="flex items-center gap-2">
        <SidebarTrigger />
        <span class="truncate text-sm font-medium group-data-[collapsible=icon]:hidden">
          OpenOmniClaw
        </span>
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

    <SidebarSeparator />

    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupLabel>Sessions</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem
              v-for="session in sessions"
              :key="session.id"
            >
              <SidebarMenuButton
                :is-active="session.id === activeSessionId"
                :tooltip="sessionTitle(session)"
                @click="emit('selectSession', session.id)"
              >
                <MessageSquareIcon />
                <span>{{ sessionTitle(session) }}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>

    <SidebarSeparator />

    <SidebarFooter class="items-end">
      <SidebarMenu>
        <SidebarMenuItem class="flex justify-end">
          <SidebarMenuButton
            class="w-auto"
            size="icon"
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
</template>

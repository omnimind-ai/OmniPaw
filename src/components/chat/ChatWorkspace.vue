<script setup lang="ts">
import { provide } from 'vue'

import ChatSidebar from '@/components/chat/ChatSidebar.vue'
import { chatWorkspaceContextKey } from '@/components/chat/chat-workspace-context'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { useChatWorkspaceController } from '@/composables/chat/useChatWorkspaceController'

const {
  workspaceContext,
  sessions,
  currSessionId,
  creatingSession,
  runningSessionIds,
  sidebarOpen,
  setSidebarOpen,
  handleNewChat,
  handleSelectSession,
  openSettings,
  toggleCatVisibility,
  handleRenameSession,
  handleDeleteSession,
} = useChatWorkspaceController()

provide(chatWorkspaceContextKey, workspaceContext)
</script>

<template>
  <SidebarProvider
    :open="sidebarOpen"
    @update:open="setSidebarOpen"
  >
    <ChatSidebar
      :sessions="sessions"
      :active-session-id="currSessionId"
      :creating="creatingSession"
      :running-session-ids="runningSessionIds"
      @new-chat="handleNewChat"
      @select-session="handleSelectSession"
      @open-settings="openSettings"
      @toggle-cat="toggleCatVisibility"
      @rename-session="handleRenameSession"
      @delete-session="handleDeleteSession"
    />

    <SidebarInset class="h-svh overflow-hidden">
      <header class="flex h-12 shrink-0 items-center border-b px-3 md:hidden">
        <SidebarTrigger />
      </header>

      <main class="flex min-h-0 flex-1 flex-col bg-background">
        <RouterView />
      </main>
    </SidebarInset>
  </SidebarProvider>
</template>

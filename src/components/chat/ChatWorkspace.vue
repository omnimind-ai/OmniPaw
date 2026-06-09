<script setup lang="ts">
import { provide } from 'vue'

import ChatSidebar from '@/components/chat/ChatSidebar.vue'
import { chatWorkspaceContextKey } from '@/components/chat/chat-workspace-context'
import FirstLaunchProviderGuide from '@/components/onboarding/FirstLaunchProviderGuide.vue'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { useChatWorkspaceController } from '@/composables/chat/useChatWorkspaceController'

const {
  workspaceContext,
  sessions,
  currSessionId,
  sessionMode,
  sessionKindFilter,
  creatingSession,
  runningSessionIds,
  sidebarOpen,
  setSidebarOpen,
  handleNewChat,
  handleSelectSession,
  handleSessionModeChange,
  handleSessionKindFilterChange,
  openSettings,
  toggleCatVisibility,
  handleRenameSession,
  handleDeleteSession,
} = useChatWorkspaceController()
const { selectedModel, providersLoading } = workspaceContext

provide(chatWorkspaceContextKey, workspaceContext)
</script>

<template>
  <SidebarProvider
    :open="sidebarOpen"
    class="h-full min-h-0"
    @update:open="setSidebarOpen"
  >
    <ChatSidebar
      :sessions="sessions"
      :active-session-id="currSessionId"
      :session-mode="sessionMode"
      :session-kind-filter="sessionKindFilter"
      :creating="creatingSession"
      :running-session-ids="runningSessionIds"
      @new-chat="handleNewChat"
      @select-session="handleSelectSession"
      @update-session-mode="handleSessionModeChange"
      @update-session-kind-filter="handleSessionKindFilterChange"
      @open-settings="openSettings"
      @toggle-cat="toggleCatVisibility"
      @rename-session="handleRenameSession"
      @delete-session="handleDeleteSession"
    />

    <SidebarInset class="h-full overflow-hidden">
      <header class="flex h-12 shrink-0 items-center border-b px-3 md:hidden">
        <SidebarTrigger />
      </header>

      <main class="flex min-h-0 flex-1 flex-col bg-background">
        <FirstLaunchProviderGuide v-if="!selectedModel && !providersLoading" />
        <RouterView v-else />
      </main>
    </SidebarInset>
  </SidebarProvider>
</template>

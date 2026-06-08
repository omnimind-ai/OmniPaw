<script setup lang="ts">
import ChatComposerDock from '@/components/chat/ChatComposerDock.vue'
import { useChatWorkspaceContext } from '@/components/chat/chat-workspace-context'
import FirstLaunchProviderGuide from '@/components/onboarding/FirstLaunchProviderGuide.vue'

const { selectedModel, providersLoading } = useChatWorkspaceContext()
</script>

<template>
  <FirstLaunchProviderGuide v-if="!selectedModel && !providersLoading" />
  <ChatComposerDock
    v-else
    welcome
  />
</template>

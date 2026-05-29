<script setup lang="ts">
import { ArrowDownIcon } from 'lucide-vue-next'

import ChatComposerDock from '@/components/chat/ChatComposerDock.vue'
import ChatMessageList from '@/components/chat/ChatMessageList.vue'
import { useChatWorkspaceContext } from '@/components/chat/chat-workspace-context'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'

const {
  setMessagesScrollArea,
  showMessageList,
  activeMessages,
  showMessageSkeleton,
  highlightedMessageId,
  showReasoningContent,
  isUserMessage,
  messageContent,
  messageBlocks,
  isMessageStreaming,
  handleCopyMessage,
  handleCopyCode,
  handleEditMessage,
  handleContinueMessage,
  handleRegenerateMessage,
  handleQuoteMessage,
  handleJumpMessage,
  showScrollToBottom,
  scrollToLatestMessage,
} = useChatWorkspaceContext()
</script>

<template>
  <div class="relative min-h-0 flex-1">
    <ScrollArea
      :ref="setMessagesScrollArea"
      class="h-full"
    >
      <ChatMessageList
        v-if="showMessageList"
        :messages="activeMessages"
        :loading="showMessageSkeleton"
        :highlighted-message-id="highlightedMessageId"
        :show-reasoning-content="showReasoningContent"
        :is-user-message="isUserMessage"
        :message-content="messageContent"
        :message-blocks="messageBlocks"
        :is-message-streaming="isMessageStreaming"
        @copy-message="handleCopyMessage"
        @copy-code="handleCopyCode"
        @edit-message="handleEditMessage"
        @continue-message="handleContinueMessage"
        @regenerate-message="handleRegenerateMessage"
        @quote-message="handleQuoteMessage"
        @jump-message="handleJumpMessage"
      />
    </ScrollArea>

    <Button
      v-if="showScrollToBottom"
      type="button"
      variant="outline"
      size="sm"
      class="absolute bottom-4 left-1/2 -translate-x-1/2 border-border/70 bg-background/35 shadow-md backdrop-blur-xl hover:bg-background/50"
      aria-label="回到底部"
      @click="scrollToLatestMessage('smooth', true)"
    >
      <ArrowDownIcon data-icon="inline-start" />
      回到底部
    </Button>
  </div>

  <ChatComposerDock />
</template>

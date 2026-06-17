<script setup lang="ts">
import { ArrowDownIcon } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'

import { appBridge } from '@/bridge/app'
import ChatComposerDock from '@/components/chat/ChatComposerDock.vue'
import ChatMessageList from '@/components/chat/ChatMessageList.vue'
import { useChatWorkspaceContext } from '@/components/chat/chat-workspace-context'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { errorToText, useToast } from '@/utils/toast'

const { t } = useI18n()

const {
  setMessagesScrollArea,
  showMessageList,
  activeMessages,
  showMessageSkeleton,
  highlightedMessageId,
  showReasoningContent,
  currSessionId,
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

const toast = useToast()

async function handleOpenWorkspaceFile(payload: {
  path: string
  lineStart?: number
  lineEnd?: number
}) {
  if (!appBridge.workspace || !currSessionId.value || !payload.path) return
  try {
    await appBridge.workspace.revealFile({
      sessionId: currSessionId.value,
      path: payload.path,
    })
  } catch (err) {
    toast.error(errorToText(err, t('chat.errors.openFileFailed')))
  }
}
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
        :session-id="currSessionId"
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
        @open-workspace-file="handleOpenWorkspaceFile"
      />
    </ScrollArea>

    <Button
      v-if="showScrollToBottom"
      type="button"
      variant="outline"
      size="sm"
      class="absolute bottom-4 left-1/2 -translate-x-1/2 border-border/70 bg-background/35 shadow-md backdrop-blur-xl hover:bg-background/50"
      :aria-label="t('chat.scrollToBottom.ariaLabel')"
      @click="scrollToLatestMessage('smooth', true)"
    >
      <ArrowDownIcon data-icon="inline-start" />
      {{ t('chat.scrollToBottom.label') }}
    </Button>
  </div>

  <ChatComposerDock />
</template>

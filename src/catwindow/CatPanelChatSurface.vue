<script setup lang="ts">
import {
  ArrowDownIcon,
  CheckIcon,
  ChevronDownIcon,
  Loader2Icon,
  MessageSquareIcon,
  PawPrintIcon,
  PlusIcon,
  SettingsIcon,
} from 'lucide-vue-next'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import ChatComposer from '@/components/chat/ChatComposer.vue'
import ChatMessageList from '@/components/chat/ChatMessageList.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useCatPanelChatController } from './useCatPanelChatController'

defineProps<{
  sideLabel: string
}>()

const emit = defineEmits<{
  showStatus: []
}>()

const { t } = useI18n()

const {
  sessions,
  currSessionId,
  currentSessionTitle,
  loadingSessions,
  initializing,
  creatingSession,
  activeMessages,
  showMessageList,
  showMessageSkeleton,
  highlightedMessageId,
  showReasoningContent,
  showScrollToBottom,
  draft,
  stagedFiles,
  stagedUploadItems,
  uploadPending,
  enabledModelOptions,
  providersLoading,
  selectedModel,
  selectedModelKey,
  selectedModelLabel,
  selectedModelMeta,
  agentToolProfile,
  toolProfileOptions,
  toolProfileSaving,
  currentSessionRunning,
  sending,
  attachmentWarning,
  canSend,
  replyPreview,
  fileInput,
  setMessagesScrollArea,
  scrollToLatestMessage,
  handleCreateSession,
  handleSelectSession,
  openFilePicker,
  handleFileInputChange,
  handleFilesDropped,
  removeStagedFile,
  removeUploadAt,
  handleModelChange,
  handleToolProfileChange,
  handlePaste,
  handleSubmit,
  handleStop,
  handleCopyMessage,
  handleCopyCode,
  handleEditMessage,
  handleContinueMessage,
  handleRegenerateMessage,
  handleQuoteMessage,
  clearReply,
  handleJumpMessage,
  isUserMessage,
  isMessageStreaming,
  messageContent,
  messageBlocks,
  notifyConfigureModel,
  sessionTitle,
  sessionUpdatedLabel,
} = useCatPanelChatController()

const timeGreeting = computed(() => {
  const h = new Date().getHours()
  if (h >= 6 && h < 12) return t('catWindow.chat.greetingMorning')
  if (h >= 12 && h < 18) return t('catWindow.chat.greetingAfternoon')
  return t('catWindow.chat.greetingEvening')
})

function sessionItemClass(sessionId: string) {
  return cn('items-start gap-2', sessionId === currSessionId.value && 'bg-accent/50')
}
</script>

<template>
  <section
    class="cat-panel-chat flex h-full min-h-0 w-full flex-col overflow-hidden rounded-lg border border-border/80 bg-background/95 text-foreground shadow-xl backdrop-blur"
    :aria-label="t('catWindow.chat.chatLabel')"
  >
    <header class="flex shrink-0 items-center gap-2 border-b border-border/70 px-3 py-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        class="h-8 shrink-0 px-2"
        @click="emit('showStatus')"
      >
        <PawPrintIcon data-icon="inline-start" />
        {{ t('catPet.title') }}
      </Button>

      <div
        class="flex-1"
        aria-hidden="true"
      />

      <Badge
        variant="outline"
        class="hidden shrink-0 sm:inline-flex"
      >
        {{ sideLabel }}
      </Badge>

      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button
            type="button"
            variant="outline"
            size="sm"
            class="h-8 max-w-36 min-w-0 justify-start px-2"
            :disabled="initializing || uploadPending"
          >
            <MessageSquareIcon data-icon="inline-start" />
            <span class="truncate">{{ currentSessionTitle }}</span>
            <ChevronDownIcon data-icon="inline-end" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="end"
          class="w-72"
        >
          <DropdownMenuLabel>{{ t('catWindow.chat.sessionsLabel') }}</DropdownMenuLabel>
          <DropdownMenuSeparator />

          <DropdownMenuGroup>
            <DropdownMenuItem
              v-if="loadingSessions"
              disabled
            >
              <Loader2Icon
                data-icon="inline-start"
                class="animate-spin"
              />
              {{ t('catWindow.chat.loading') }}
            </DropdownMenuItem>

            <DropdownMenuItem
              v-for="session in sessions"
              :key="session.id"
              :disabled="uploadPending"
              :class="sessionItemClass(session.id)"
              @select="handleSelectSession(session.id)"
            >
              <CheckIcon
                v-if="session.id === currSessionId"
                data-icon="inline-start"
                class="mt-0.5"
              />
              <span
                v-else
                class="mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />

              <span class="flex min-w-0 flex-1 flex-col gap-0.5">
                <span class="truncate font-medium">{{ sessionTitle(session) }}</span>
                <span class="truncate text-xs text-muted-foreground">
                  {{ sessionUpdatedLabel(session) }}
                </span>
              </span>
            </DropdownMenuItem>
          </DropdownMenuGroup>

          <DropdownMenuSeparator />
          <DropdownMenuItem
            :disabled="creatingSession || uploadPending"
            @select="handleCreateSession"
          >
            <Loader2Icon
              v-if="creatingSession"
              data-icon="inline-start"
              class="animate-spin"
            />
            <PlusIcon
              v-else
              data-icon="inline-start"
            />
            {{ t('catWindow.chat.newSession') }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>

    <div
      v-if="!selectedModel && !providersLoading"
      class="flex shrink-0 items-center justify-between gap-2 border-b border-border/70 bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
    >
      <span class="truncate">{{ t('catWindow.chat.noModelConfigured') }}</span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        class="h-7 shrink-0 px-2"
        @click="notifyConfigureModel"
      >
        <SettingsIcon data-icon="inline-start" />
        {{ t('catWindow.chat.settingsButton') }}
      </Button>
    </div>

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

        <div
          v-else-if="initializing"
          class="flex h-full flex-col gap-3 p-4"
        >
          <Skeleton class="h-16 w-3/4" />
          <Skeleton class="h-24 w-5/6 self-end" />
          <Skeleton class="h-20 w-2/3" />
        </div>

        <div
          v-else
          class="flex h-full min-h-48 flex-col items-start justify-center gap-1 px-6"
        >
          <p class="text-3xl font-bold">{{ timeGreeting }}👋</p>
          <p class="text-2xl font-bold">{{ t('catWindow.chat.whatCanHelp') }}</p>
        </div>
      </ScrollArea>

      <Button
        v-if="showScrollToBottom"
        type="button"
        variant="outline"
        size="sm"
        class="absolute bottom-3 left-1/2 h-8 -translate-x-1/2 border-border/70 bg-background/70 px-2 shadow-md backdrop-blur"
        :aria-label="t('catWindow.chat.scrollToBottom')"
        @click="scrollToLatestMessage('smooth', true)"
      >
        <ArrowDownIcon data-icon="inline-start" />
        {{ t('catWindow.chat.bottom') }}
      </Button>
    </div>

    <footer class="shrink-0 border-t border-border/70 bg-background/90 p-2.5">
      <ChatComposer
        v-model="draft"
        :staged-files="stagedFiles"
        :staged-upload-items="stagedUploadItems"
        :model-options="enabledModelOptions"
        :selected-model-key="selectedModelKey"
        :selected-model-label="selectedModelLabel"
        :selected-model-meta="selectedModelMeta"
        :tool-profile="agentToolProfile"
        :tool-profile-options="toolProfileOptions"
        :tool-profile-saving="toolProfileSaving"
        :reply-preview="replyPreview"
        :running="currentSessionRunning"
        :upload-pending="uploadPending"
        :attachment-warning="attachmentWarning"
        compact-attachments
        show-attachment-presets
        auto-focus
        :disabled="sending || currentSessionRunning || uploadPending || initializing"
        :can-send="canSend"
        :can-stop="currentSessionRunning"
        @add-attachment="openFilePicker"
        @remove-attachment="removeStagedFile"
        @remove-upload-item="removeUploadAt"
        @files-dropped="handleFilesDropped"
        @clear-reply="clearReply"
        @select-model="handleModelChange"
        @select-tool-profile="handleToolProfileChange"
        @paste="handlePaste"
        @submit="handleSubmit"
        @stop="handleStop"
      />
      <input
        ref="fileInput"
        class="sr-only"
        type="file"
        multiple
        @change="handleFileInputChange"
      >
    </footer>
  </section>
</template>

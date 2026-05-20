<script setup lang="ts">
import ChatComposer from '@/components/ChatComposer.vue'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useChatWorkspace } from './chat-workspace-context'

const props = withDefaults(
  defineProps<{
    welcome?: boolean
  }>(),
  {
    welcome: false,
  }
)

const {
  showWelcome,
  selectedModel,
  providersLoading,
  openSettings,
  draft,
  stagedFiles,
  stagedUploadItems,
  enabledModelOptions,
  selectedModelKey,
  selectedModelLabel,
  selectedModelMeta,
  replyPreview,
  currentSessionRunning,
  uploadPending,
  attachmentWarning,
  sending,
  canSend,
  openFilePicker,
  removeStagedFile,
  removeUploadAt,
  handleFilesDropped,
  clearReply,
  handleModelChange,
  handlePaste,
  handleSubmit,
  handleStop,
  fileInput,
  handleFileInputChange,
} = useChatWorkspace()
</script>

<template>
  <div
    :class="cn(
      'flex w-full flex-col items-center px-6 pb-6 md:px-10 lg:px-16',
      props.welcome ? 'flex-1 justify-center gap-8' : 'shrink-0',
    )"
  >
    <h1
      v-if="props.welcome && showWelcome"
      class="text-center text-3xl font-semibold tracking-normal md:text-4xl"
    >
      👋 欢迎使用 OmniClaw
    </h1>

    <div class="w-full max-w-4xl">
      <div
        v-if="!selectedModel && !providersLoading"
        class="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground"
      >
        <span>未配置可用模型</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          @click="openSettings"
        >
          打开设置
        </Button>
      </div>

      <ChatComposer
        v-model="draft"
        :staged-files="stagedFiles"
        :staged-upload-items="stagedUploadItems"
        :model-options="enabledModelOptions"
        :selected-model-key="selectedModelKey"
        :selected-model-label="selectedModelLabel"
        :selected-model-meta="selectedModelMeta"
        :reply-preview="replyPreview"
        :running="currentSessionRunning"
        :upload-pending="uploadPending"
        :attachment-warning="attachmentWarning"
        :disabled="sending || currentSessionRunning || uploadPending"
        :can-send="canSend"
        :can-stop="currentSessionRunning"
        @add-attachment="openFilePicker"
        @remove-attachment="removeStagedFile"
        @remove-upload-item="removeUploadAt"
        @files-dropped="handleFilesDropped"
        @clear-reply="clearReply"
        @select-model="handleModelChange"
        @paste="handlePaste"
        @submit="handleSubmit"
        @stop="handleStop"
      />
    </div>

    <input
      ref="fileInput"
      class="sr-only"
      type="file"
      multiple
      @change="handleFileInputChange"
    >
  </div>
</template>

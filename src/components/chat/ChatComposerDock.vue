<script setup lang="ts">
import type { LocalSkillSummary, SkillChangedEvent } from '@shared/types/skill'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  appBridge,
  type BridgeMcpChangedEvent,
  type BridgeMcpDiscoveredToolSummary,
} from '@/bridge/app'
import ChatComposer from '@/components/chat/ChatComposer.vue'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useChatWorkspaceContext } from './chat-workspace-context'

const { t } = useI18n()

const props = withDefaults(
  defineProps<{
    welcome?: boolean
  }>(),
  {
    welcome: false,
  }
)

const {
  currSessionId,
  showWelcome,
  welcomeTitle,
  selectedModel,
  providersLoading,
  openSettings,
  draft,
  stagedFiles,
  stagedUploadItems,
  enabledModelOptions,
  selectedModelKey,
  selectedModelLabel,
  agentToolProfile,
  toolProfileOptions,
  toolProfileSaving,
  replyPreview,
  currentSessionRunning,
  activeContextUsage,
  activeContextUsageLoading,
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
  handleToolProfileChange,
  handlePaste,
  handleSubmit,
  handleStop,
  fileInput,
  handleFileInputChange,
} = useChatWorkspaceContext()

const availableSkills = ref<LocalSkillSummary[]>([])
const skillsLoading = ref(true)
const skillsUnavailable = ref(false)
const availableMcpTools = ref<BridgeMcpDiscoveredToolSummary[]>([])
const mcpLoading = ref(true)
const mcpUnavailable = ref(false)
let unsubscribeSkills: (() => void) | undefined
let unsubscribeMcp: (() => void) | undefined

onMounted(() => {
  unsubscribeSkills = appBridge.skill.onChanged?.((event: SkillChangedEvent) => {
    availableSkills.value = event.skills
    skillsUnavailable.value = false
  })
  unsubscribeMcp = appBridge.mcp.onChanged?.((event: BridgeMcpChangedEvent) => {
    availableMcpTools.value = event.servers.flatMap((server) => server.tools)
    mcpUnavailable.value = Boolean(event.status.error)
  })
  void loadSkills()
  void loadMcpTools()
})

onBeforeUnmount(() => {
  unsubscribeSkills?.()
  unsubscribeSkills = undefined
  unsubscribeMcp?.()
  unsubscribeMcp = undefined
})

async function loadSkills() {
  skillsLoading.value = true
  skillsUnavailable.value = false
  try {
    const response = await appBridge.skill.list()
    availableSkills.value = response.skills
    skillsUnavailable.value = Boolean(response.status.error)
  } catch {
    availableSkills.value = []
    skillsUnavailable.value = true
  } finally {
    skillsLoading.value = false
  }
}

async function loadMcpTools() {
  mcpLoading.value = true
  mcpUnavailable.value = false
  try {
    const response = await appBridge.mcp.listTools()
    availableMcpTools.value = response.tools
  } catch {
    availableMcpTools.value = []
    mcpUnavailable.value = true
  } finally {
    mcpLoading.value = false
  }
}
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
      class="text-center text-3xl font-semibold tracking-normal text-foreground/85 md:text-4xl"
    >
      {{ welcomeTitle }}
    </h1>

    <div class="w-full max-w-4xl">
      <div
        v-if="!selectedModel && !providersLoading"
        class="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground"
      >
        <span>{{ t('chat.noModel.message') }}</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          @click="openSettings"
        >
          {{ t('chat.noModel.openSettings') }}
        </Button>
      </div>

      <ChatComposer
        v-model="draft"
        :skills="availableSkills"
        :skills-loading="skillsLoading"
        :skills-unavailable="skillsUnavailable"
        :mcp-tools="availableMcpTools"
        :mcp-loading="mcpLoading"
        :mcp-unavailable="mcpUnavailable"
        :staged-files="stagedFiles"
        :staged-upload-items="stagedUploadItems"
        :model-options="enabledModelOptions"
        :selected-model-key="selectedModelKey"
        :selected-model-label="selectedModelLabel"
        :tool-profile="agentToolProfile"
        :tool-profile-options="toolProfileOptions"
        :show-tool-profile="true"
        :tool-profile-saving="toolProfileSaving"
        :context-usage="activeContextUsage"
        :context-usage-loading="activeContextUsageLoading"
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
        @select-tool-profile="handleToolProfileChange"
        @paste="handlePaste"
        @submit="handleSubmit"
        @stop="handleStop"
      />
    </div>

    <input
      ref="fileInput"
      class="sr-only"
      type="file"
      accept="image/*,text/*,application/json,audio/*,video/*,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
      multiple
      @change="handleFileInputChange"
    >
  </div>
</template>

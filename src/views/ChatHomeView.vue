<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { FileIcon, ImageIcon, SparklesIcon } from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import ChatComposer from '@/components/ChatComposer.vue'
import ChatSidebar from '@/components/ChatSidebar.vue'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useMediaHandling, type StagedFileInfo } from '@/composables/useMediaHandling'
import {
  displayParts,
  type ChatRecord,
  type MessagePart,
  useMessages,
} from '@/composables/useMessages'
import { useSessions } from '@/composables/useSessions'
import { useChatStore } from '@/stores/chat'
import { useProviderStore, type ProviderModelOption } from '@/stores/provider'

const router = useRouter()
const route = useRoute()
const chatStore = useChatStore()
const providerStore = useProviderStore()
const { enabledModelOptions, loading: providersLoading } = storeToRefs(providerStore)

const {
  sessions,
  selectedSessions,
  currSessionId,
  getCurrentSession,
  getSessions,
  newSession,
} = useSessions(false)

const {
  stagedFiles,
  processAndUploadImage,
  processAndUploadFile,
  handlePaste,
  removeImage,
  removeFile,
  clearStaged,
  cleanupMediaCache,
} = useMediaHandling()

const {
  activeMessages,
  loadingMessages,
  sending,
  createLocalExchange,
  sendMessageStream,
  isSessionRunning,
  isUserMessage,
  messageContent,
  loadSessionMessages,
} = useMessages({
  currentSessionId: currSessionId,
  onSessionsChanged: getSessions,
})

const draft = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const creatingSession = ref(false)
const selectedModelKey = ref('')
const syncedModelSessionId = ref<string | null>(null)

const hasMessages = computed(() => activeMessages.value.length > 0)
const showWelcome = computed(() => !hasMessages.value && !loadingMessages.value)
const currentSessionRunning = computed(() =>
  currSessionId.value ? isSessionRunning(currSessionId.value) : false,
)
const selectedModel = computed(() =>
  enabledModelOptions.value.find((option) => option.key === selectedModelKey.value)
  ?? enabledModelOptions.value[0],
)
const selectedModelLabel = computed(() => {
  if (providersLoading.value) return '加载模型中'
  if (!selectedModel.value) return '未配置模型'
  return selectedModel.value.modelName
})
const selectedModelMeta = computed(() => {
  if (!selectedModel.value) return ''
  return selectedModel.value.providerName
})
const canSend = computed(() =>
  !sending.value
  && !currentSessionRunning.value
  && Boolean(draft.value.trim() || stagedFiles.value.length),
)

watch(
  () => route.params.conversationId,
  async () => {
    const sessionId = routeSessionId()
    currSessionId.value = sessionId
    selectedSessions.value = sessionId ? [sessionId] : []
    chatStore.activeSessionId = sessionId || undefined

    if (sessionId) {
      await loadSessionMessages(sessionId)
    }
  },
  { immediate: true },
)

watch(
  [enabledModelOptions, () => currSessionId.value, () => sessions.value],
  () => syncSelectedModel(),
  { deep: true, immediate: true },
)

watch(draft, (value) => {
  chatStore.draft = value
})

watch(
  () => currSessionId.value,
  (sessionId) => {
    chatStore.activeSessionId = sessionId || undefined
  },
  { immediate: true },
)

onMounted(async () => {
  await Promise.allSettled([
    getSessions(),
    providerStore.loadProviders(),
    chatStore.loadSessions(),
  ])
  syncSelectedModel()
})

onBeforeUnmount(() => {
  clearStaged()
  cleanupMediaCache()
})

function routeSessionId() {
  const param = route.params.conversationId
  if (Array.isArray(param)) return param[0] || ''
  return param || ''
}

function syncSelectedModel() {
  const options = enabledModelOptions.value
  if (!options.length) {
    selectedModelKey.value = ''
    syncedModelSessionId.value = null
    return
  }

  const currentKeyIsValid = options.some((option) => option.key === selectedModelKey.value)
  const session = getCurrentSession.value
  const shouldPreferSession = currSessionId.value && syncedModelSessionId.value !== currSessionId.value

  if (session && shouldPreferSession) {
    const providerId = session.providerId || session.defaultProviderId
    const modelId = session.modelId || session.defaultModelId
    const sessionOption = options.find(
      (option) => option.providerId === providerId && option.modelId === modelId,
    )

    selectedModelKey.value = sessionOption?.key || (currentKeyIsValid ? selectedModelKey.value : options[0].key)
    syncedModelSessionId.value = currSessionId.value
    return
  }

  if (!currentKeyIsValid) {
    selectedModelKey.value = options[0].key
  }
}

async function handleNewChat() {
  creatingSession.value = true
  try {
    const sessionId = await newSession()
    currSessionId.value = sessionId
    selectedSessions.value = [sessionId]
    chatStore.activeSessionId = sessionId
    await loadSessionMessages(sessionId)
  } finally {
    creatingSession.value = false
  }
}

async function handleSelectSession(sessionId: string) {
  if (sessionId === currSessionId.value) return
  currSessionId.value = sessionId
  selectedSessions.value = [sessionId]
  chatStore.activeSessionId = sessionId
  await router.push(`/chat/${sessionId}`)
}

async function openSettings() {
  await router.push('/settings')
}

function openFilePicker() {
  fileInput.value?.click()
}

async function handleFileInputChange(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])

  for (const file of files) {
    if (file.type.startsWith('image/')) {
      await processAndUploadImage(file)
    } else {
      await processAndUploadFile(file)
    }
  }

  input.value = ''
}

function removeStagedFile(index: number) {
  const target = stagedFiles.value[index]
  if (!target) return

  let typedIndex = -1
  for (let i = 0; i <= index; i += 1) {
    const item = stagedFiles.value[i]
    if (!item) continue
    if (target.type === 'image') {
      if (item.type === 'image') typedIndex += 1
    } else if (item.type !== 'image') {
      typedIndex += 1
    }
  }

  if (target.type === 'image') {
    removeImage(typedIndex)
  } else {
    removeFile(typedIndex)
  }
}

async function handleModelChange(value: unknown) {
  const option = enabledModelOptions.value.find((item) => item.key === value)
  if (!option) return
  await selectModel(option)
}

async function selectModel(option: ProviderModelOption) {
  selectedModelKey.value = option.key

  if (!currSessionId.value) return

  try {
    await providerStore.setSessionModel({
      sessionId: currSessionId.value,
      providerId: option.providerId,
      modelId: option.modelId,
    })

    const session = getCurrentSession.value
    if (session) {
      session.providerId = option.providerId
      session.defaultProviderId = option.providerId
      session.modelId = option.modelId
      session.defaultModelId = option.modelId
    }
  } catch (error) {
    console.warn('Failed to persist selected model:', error)
  }
}

async function handleSubmit() {
  if (!canSend.value) return

  const messageId = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`
  const parts = buildOutgoingParts()
  if (!parts.length) return

  sending.value = true

  try {
    const sessionId = currSessionId.value || await newSession()
    currSessionId.value = sessionId
    selectedSessions.value = [sessionId]
    chatStore.activeSessionId = sessionId

    const { userRecord, botRecord } = createLocalExchange({
      sessionId,
      messageId,
      parts,
    })

    draft.value = ''
    chatStore.draft = ''
    clearStaged()

    await sendMessageStream({
      sessionId,
      messageId,
      parts,
      transport: 'sse',
      selectedProvider: selectedModel.value?.providerId || '',
      selectedModel: selectedModel.value?.modelId || '',
      enableStreaming: true,
      userRecord,
      botRecord,
    })
  } finally {
    sending.value = false
  }
}

function buildOutgoingParts(): MessagePart[] {
  const parts: MessagePart[] = []
  const text = draft.value.trim()

  if (text) {
    parts.push({ type: 'plain', text })
  }

  for (const file of stagedFiles.value) {
    parts.push({
      type: file.type,
      attachmentId: file.attachmentId,
      attachment_id: file.attachment_id || file.attachmentId,
      filename: file.filename,
    })
  }

  return parts
}

function recordKey(record: ChatRecord, index: number) {
  return String(record.id ?? `record-${index}`)
}

function recordParts(record: ChatRecord) {
  return displayParts(messageContent(record))
}

function attachmentIcon(part: MessagePart | StagedFileInfo) {
  return part.type === 'image' ? ImageIcon : FileIcon
}

function attachmentLabel(part: MessagePart | StagedFileInfo) {
  const filename = 'filename' in part ? part.filename : ''
  if (filename) return filename
  if (part.type === 'image') return '图片'
  if (part.type === 'video') return '视频'
  if (part.type === 'record') return '音频'
  return '附件'
}

function isAttachmentPart(part: MessagePart) {
  return ['image', 'video', 'record', 'file'].includes(part.type)
}

function toolCallLabel(part: MessagePart) {
  const calls = part.tool_calls || part.toolCalls || []
  if (!Array.isArray(calls) || !calls.length) return '工具调用'
  const firstCall = calls[0]
  return firstCall.name || firstCall.toolName || firstCall.tool_name || '工具调用'
}
</script>

<template>
  <SidebarProvider>
    <ChatSidebar
      :sessions="sessions"
      :active-session-id="currSessionId"
      :creating="creatingSession"
      @new-chat="handleNewChat"
      @select-session="handleSelectSession"
      @open-settings="openSettings"
    />

    <SidebarInset class="h-svh overflow-hidden">
      <header class="flex h-12 shrink-0 items-center border-b px-3 md:hidden">
        <SidebarTrigger />
      </header>

      <main class="flex min-h-0 flex-1 flex-col bg-background">
        <ScrollArea
          v-if="hasMessages"
          class="min-h-0 flex-1"
        >
          <div class="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-6 md:px-6">
            <article
              v-for="(record, recordIndex) in activeMessages"
              :key="recordKey(record, recordIndex)"
              :class="cn('flex w-full', isUserMessage(record) ? 'justify-end' : 'justify-start')"
            >
              <div
                :class="cn(
                  'flex max-w-[min(42rem,85%)] flex-col gap-2 rounded-lg px-3 py-2 text-sm leading-6',
                  isUserMessage(record)
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground',
                )"
              >
                <template
                  v-for="(part, partIndex) in recordParts(record)"
                  :key="`${recordKey(record, recordIndex)}-${part.type}-${partIndex}`"
                >
                  <p
                    v-if="part.type === 'plain'"
                    class="whitespace-pre-wrap"
                  >
                    {{ part.text }}
                  </p>

                  <Badge
                    v-else-if="isAttachmentPart(part)"
                    variant="secondary"
                  >
                    <component
                      :is="attachmentIcon(part)"
                      data-icon="inline-start"
                    />
                    <span class="truncate">{{ attachmentLabel(part) }}</span>
                  </Badge>

                  <Badge
                    v-else-if="part.type === 'tool_call'"
                    variant="outline"
                  >
                    <SparklesIcon data-icon="inline-start" />
                    <span class="truncate">{{ toolCallLabel(part) }}</span>
                  </Badge>
                </template>

                <span
                  v-if="!recordParts(record).length"
                  class="text-muted-foreground"
                >
                  正在思考...
                </span>
              </div>
            </article>
          </div>
        </ScrollArea>

        <div
          v-else-if="loadingMessages"
          class="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-4 py-6 md:px-6"
        >
          <Skeleton class="h-16 w-2/3" />
          <Skeleton class="h-24 w-5/6 self-end" />
          <Skeleton class="h-20 w-3/4" />
        </div>

        <div
          :class="cn(
            'flex w-full flex-col items-center px-6 pb-6 md:px-10 lg:px-16',
            showWelcome ? 'flex-1 justify-center gap-8' : 'shrink-0',
          )"
        >
          <h1
            v-if="showWelcome"
            class="text-center text-3xl font-semibold tracking-normal md:text-4xl"
          >
            👋 欢迎使用 OmniClaw
          </h1>

          <div class="w-full max-w-4xl">
            <ChatComposer
              v-model="draft"
              :staged-files="stagedFiles"
              :model-options="enabledModelOptions"
              :selected-model-key="selectedModelKey"
              :selected-model-label="selectedModelLabel"
              :selected-model-meta="selectedModelMeta"
              :disabled="sending || currentSessionRunning"
              :can-send="canSend"
              @add-attachment="openFilePicker"
              @remove-attachment="removeStagedFile"
              @select-model="handleModelChange"
              @paste="handlePaste"
              @submit="handleSubmit"
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
      </main>
    </SidebarInset>
  </SidebarProvider>
</template>

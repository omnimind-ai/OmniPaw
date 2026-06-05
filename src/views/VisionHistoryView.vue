<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import {
  appBridge,
  type BridgeChatMessage,
  type BridgeChatSession,
  type BridgeStreamEvent,
  type BridgeUnsubscribe,
} from '@/bridge/app'
import ChatMessageList from '@/components/chat/ChatMessageList.vue'
import { contentText } from '@/components/chat/chat-display'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { type ChatRecord, messageBlocks, normalizeMessageParts } from '@/composables/useMessages'
import { useObservationStore } from '@/stores/observation'
import { useSettingsStore } from '@/stores/settings'
import { copyToClipboard } from '@/utils/clipboard'
import { errorToText, useToast } from '@/utils/toast'

const route = useRoute()
const toast = useToast()
const observationStore = useObservationStore()
const settingsStore = useSettingsStore()
const sessions = ref<BridgeChatSession[]>([])
const activeSessionId = ref('')
const messages = ref<ChatRecord[]>([])
const loading = ref(false)
const streamRuns = ref(new Set<string>())
let unsubscribeStream: BridgeUnsubscribe | undefined
let unsubscribeObservation: BridgeUnsubscribe | undefined

const activeRun = computed(() => observationStore.activeRun)
const statusLabel = computed(() => {
  if (!activeRun.value) return '未运行'
  return '运行中'
})
const latestDecision = computed(() => activeRun.value?.lastDecision)
const showReasoningContent = computed(() => settingsStore.showReasoningContent)

onMounted(async () => {
  subscribe()
  await Promise.allSettled([loadSessions(), observationStore.load(), settingsStore.load()])
})

onBeforeUnmount(() => {
  unsubscribeStream?.()
  unsubscribeObservation?.()
})

async function loadSessions(): Promise<void> {
  loading.value = true
  try {
    sessions.value = await appBridge.chat.listSessions({ kind: 'vision' })
    const routeSessionId = route.query.sessionId
    activeSessionId.value =
      (typeof routeSessionId === 'string' &&
        sessions.value.find((session) => session.id === routeSessionId)?.id) ||
      observationStore.visionSessionId ||
      sessions.value[0]?.id ||
      ''
    if (activeSessionId.value) {
      await loadMessages(activeSessionId.value)
    }
  } catch (error) {
    toast.error(errorToText(error, '主动视觉历史加载失败。'))
  } finally {
    loading.value = false
  }
}

async function loadMessages(sessionId: string): Promise<void> {
  if (!sessionId) return
  const history = await appBridge.chat.listMessages?.(sessionId)
  messages.value = (history ?? []).map(mapMessage)
}

async function startRuntime(): Promise<void> {
  try {
    await observationStore.start(
      activeSessionId.value ? { visionSessionId: activeSessionId.value } : {}
    )
    await loadSessions()
  } catch (error) {
    toast.error(errorToText(error, '主动视觉启动失败。'))
  }
}

async function stopRuntime(): Promise<void> {
  try {
    await observationStore.stop({
      ...(activeRun.value ? { runId: activeRun.value.id } : {}),
      reason: 'user',
    })
  } catch (error) {
    toast.error(errorToText(error, '主动视觉停止失败。'))
  }
}

async function triggerRuntime(): Promise<void> {
  try {
    await observationStore.trigger(activeRun.value ? { runId: activeRun.value.id } : undefined)
  } catch (error) {
    toast.error(errorToText(error, '立即观察失败。'))
  }
}

function subscribe(): void {
  unsubscribeStream = appBridge.chat.onStreamEvent?.((event) => {
    if (event.sessionId !== activeSessionId.value) return
    handleStreamEvent(event)
  })
  unsubscribeObservation = appBridge.observation?.onChanged?.((event) => {
    if (!event.run || event.run.visionSessionId !== activeSessionId.value) return
    if (event.reason === 'tick' || event.reason === 'updated' || event.reason === 'failed') {
      void loadMessages(event.run.visionSessionId)
    }
  })
}

function handleStreamEvent(event: BridgeStreamEvent): void {
  if (event.type === 'started') {
    streamRuns.value.add(event.runId)
    return
  }
  if (event.type === 'final') {
    streamRuns.value.delete(event.runId)
    void loadMessages(event.sessionId)
    return
  }
  if (event.type === 'error') {
    streamRuns.value.delete(event.runId)
  }
}

function isUserMessage(record: ChatRecord): boolean {
  return record.content.type === 'user'
}

function isMessageStreaming(record: ChatRecord): boolean {
  return Boolean(record.runId && streamRuns.value.has(record.runId))
}

function messageContent(record: ChatRecord) {
  return record.content || { type: 'bot', message: [] }
}

function copyMessage(record: ChatRecord): void {
  void copyToClipboard(contentText(messageContent(record)))
}

function mapMessage(message: BridgeChatMessage): ChatRecord {
  const parts = normalizeMessageParts(message.parts || [])
  const roleType = message.role === 'user' ? 'user' : 'bot'
  return {
    id: message.id,
    created_at: new Date(message.createdAt || Date.now()).toISOString(),
    updated_at: new Date(message.updatedAt || message.createdAt || Date.now()).toISOString(),
    sender_id: roleType === 'bot' ? 'bot' : 'user',
    sender_name: roleType === 'bot' ? 'Assistant' : 'User',
    status: message.status,
    error: message.error,
    usage: message.usage,
    runId: message.runId,
    content: {
      type: roleType,
      message: parts,
      isLoading: message.status === 'pending' || message.status === 'streaming',
    },
  }
}
</script>

<template>
  <main class="flex h-full min-h-0 flex-col bg-background text-foreground">
    <header class="flex shrink-0 flex-wrap items-center gap-3 border-b px-4 py-3">
      <div class="min-w-0 flex-1">
        <h1 class="truncate text-base font-semibold">主动视觉</h1>
        <p class="truncate text-sm text-muted-foreground">
          {{ activeSessionId || '尚未创建 vision session' }}
        </p>
      </div>
      <Badge variant="secondary">{{ statusLabel }}</Badge>
      <Button
        type="button"
        variant="outline"
        size="sm"
        :disabled="observationStore.running"
        @click="activeRun ? stopRuntime() : startRuntime()"
      >
        {{ activeRun ? '停止' : '启动' }}
      </Button>
      <Button
        type="button"
        size="sm"
        :disabled="!activeRun || observationStore.running"
        @click="triggerRuntime"
      >
        立即观察
      </Button>
    </header>

    <section
      v-if="latestDecision"
      class="shrink-0 border-b px-4 py-2 text-sm text-muted-foreground"
    >
      最近决定：{{ latestDecision.decision }}
    </section>

    <div class="min-h-0 flex-1 overflow-auto">
      <ChatMessageList
        :messages="messages"
        :loading="loading"
        :show-reasoning-content="showReasoningContent"
        :is-user-message="isUserMessage"
        :message-content="messageContent"
        :message-blocks="messageBlocks"
        :is-message-streaming="isMessageStreaming"
        @copy-message="copyMessage"
        @copy-code="copyToClipboard"
        @edit-message="() => {}"
        @regenerate-message="() => {}"
        @continue-message="() => {}"
        @quote-message="() => {}"
        @jump-message="() => {}"
      />
    </div>
  </main>
</template>

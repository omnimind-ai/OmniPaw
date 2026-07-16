<script setup lang="ts">
import { RefreshCwIcon } from '@lucide/vue'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { Button } from '@/components/ui/button'
import { Marker, MarkerContent, MarkerIcon } from '@/components/ui/marker'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import type {
  ChatContent,
  ChatRecord,
  MessageDisplayBlock,
  MessagePart,
} from '@/composables/useMessages'
import { cn } from '@/lib/utils'
import { extractWorkspaceFileChanges } from '@/utils/chat-file-changes'
import type { RefItem } from './chat-display'
import {
  contentText,
  formatTime,
  isAttachmentPart,
  isRecordAborted,
  isRecordErrored,
  recordErrorText,
  recordId,
} from './chat-display'
import MessageAttachmentGrid from './parts/MessageAttachmentGrid.vue'
import MessageFilesChangedCard from './parts/MessageFilesChangedCard.vue'
import MessagePartRenderer from './parts/MessagePartRenderer.vue'
import MessageToolbar from './parts/MessageToolbar.vue'
import ReasoningBlock from './parts/ReasoningBlock.vue'
import RefsPanel from './RefsPanel.vue'

const props = withDefaults(
  defineProps<{
    messages: ChatRecord[]
    loading?: boolean
    highlightedMessageId?: string
    showReasoningContent?: boolean
    sessionId?: string
    isUserMessage: (record: ChatRecord) => boolean
    messageContent: (record: ChatRecord) => ChatContent
    messageBlocks: (content: ChatContent) => MessageDisplayBlock[]
    isMessageStreaming: (record: ChatRecord, index: number) => boolean
  }>(),
  {
    loading: false,
    highlightedMessageId: '',
    showReasoningContent: true,
    sessionId: '',
  }
)
const { t } = useI18n()

const emit = defineEmits<{
  copyMessage: [record: ChatRecord]
  copyCode: [code: string]
  editMessage: [record: ChatRecord, text: string]
  regenerateMessage: [record: ChatRecord]
  continueMessage: [record: ChatRecord]
  quoteMessage: [record: ChatRecord, text: string]
  jumpMessage: [messageId: string]
  openWorkspaceFile: [payload: { path: string; lineStart?: number; lineEnd?: number }]
}>()

const editingRecordId = ref('')
const editingText = ref('')
const copiedRecordId = ref('')
const refsPanelOpen = ref(false)
const selectedRefs = ref<RefItem[]>([])

const hasMessages = computed(() => props.messages.length > 0)

type MessageRenderSegment = {
  kind: 'thinking' | 'content' | 'attachments'
  parts: MessagePart[]
}

function blocks(record: ChatRecord) {
  return props.messageBlocks(props.messageContent(record))
}

function renderSegments(record: ChatRecord): MessageRenderSegment[] {
  const segments: MessageRenderSegment[] = []

  for (const block of blocks(record)) {
    if (block.kind === 'thinking') {
      if (!props.showReasoningContent) continue
      segments.push({
        kind: 'thinking',
        parts: block.parts,
      })
      continue
    }

    let current: MessageRenderSegment | null = null
    for (const part of block.parts) {
      const kind: MessageRenderSegment['kind'] = isAttachmentPart(part) ? 'attachments' : 'content'
      if (!current || current.kind !== kind) {
        current = { kind, parts: [] }
        segments.push(current)
      }
      current.parts.push(part)
    }
  }

  return segments
}

function hasDisplayBlocks(record: ChatRecord) {
  return renderSegments(record).length > 0
}

function errorText(record: ChatRecord) {
  return recordErrorText(record)
}

function showThinkingFallback(record: ChatRecord, index: number) {
  return (
    !hasDisplayBlocks(record) && !isRecordErrored(record) && props.isMessageStreaming(record, index)
  )
}

function runProgressText(record: ChatRecord): string {
  const progress = record.runProgress
  if (!progress) return ''
  if (progress.type === 'resumed') {
    return t('chat.runProgress.resumed')
  }
  const key =
    progress.reason === 'stream_incomplete'
      ? 'chat.runProgress.retryIncomplete'
      : 'chat.runProgress.retryNetwork'
  return t(key, {
    attempt: progress.attempt ?? 1,
    max: progress.maxAttempts ?? 1,
  })
}

function messageDisplayTime(record: ChatRecord) {
  const timeValue = props.isUserMessage(record)
    ? record.created_at || record.updated_at
    : record.updated_at || record.created_at
  return formatTime(timeValue)
}

function beginEdit(record: ChatRecord) {
  editingRecordId.value = recordId(record)
  editingText.value = contentText(props.messageContent(record))
}

function cancelEdit() {
  editingRecordId.value = ''
  editingText.value = ''
}

function confirmEdit(record: ChatRecord) {
  emit('editMessage', record, editingText.value)
  cancelEdit()
}

function quoteRecord(record: ChatRecord) {
  const selection = window.getSelection?.()?.toString().trim()
  emit('quoteMessage', record, selection || contentText(props.messageContent(record)))
}

function copyRecord(record: ChatRecord) {
  copiedRecordId.value = recordId(record)
  emit('copyMessage', record)
  window.setTimeout(() => {
    if (copiedRecordId.value === recordId(record)) copiedRecordId.value = ''
  }, 1200)
}

function openRefs(refs: RefItem[]) {
  selectedRefs.value = refs
  refsPanelOpen.value = true
}

function messageClass(record: ChatRecord, index: number) {
  const user = props.isUserMessage(record)
  return cn(
    'group/message flex w-full scroll-mt-6',
    user ? 'justify-end' : 'justify-start',
    props.highlightedMessageId &&
      props.highlightedMessageId === recordId(record) &&
      'rounded-xl ring-2 ring-ring/50 ring-offset-4 ring-offset-background',
    props.isMessageStreaming(record, index) && 'opacity-95'
  )
}

function messageShellClass(record: ChatRecord) {
  const user = props.isUserMessage(record)
  return cn(
    'flex min-w-0 flex-col gap-2',
    user ? 'w-fit max-w-[min(34rem,86%)] items-end' : 'w-full max-w-[min(52rem,92%)] items-stretch'
  )
}

function messageContentClass(record: ChatRecord) {
  const user = props.isUserMessage(record)
  return cn(
    'flex min-w-0 flex-col text-sm',
    user
      ? 'gap-1 rounded-[1.75rem] bg-muted px-5 py-2.5 leading-[1.25] text-foreground shadow-sm'
      : 'gap-4 text-foreground leading-6',
    isRecordErrored(record) && user && 'ring-1 ring-destructive/50'
  )
}

function messageStatusClass(record: ChatRecord) {
  const user = props.isUserMessage(record)
  return cn(
    'text-sm',
    user ? 'rounded-xl bg-muted px-4 py-2 leading-6 shadow-sm' : 'px-1 py-1 leading-6'
  )
}

function messageErrorStatusClass(record: ChatRecord) {
  return cn(messageStatusClass(record), 'text-destructive')
}

function fileChangesFor(record: ChatRecord) {
  if (props.isUserMessage(record)) return []
  return extractWorkspaceFileChanges(record)
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-6 md:px-6">
    <template v-if="loading">
      <Skeleton class="h-16 w-2/3" />
      <Skeleton class="h-24 w-5/6 self-end" />
      <Skeleton class="h-20 w-3/4" />
    </template>

    <article
      v-for="(record, recordIndex) in messages"
      v-else-if="hasMessages"
      :id="recordId(record) ? `message-${recordId(record)}` : undefined"
      :key="recordId(record) || `record-${recordIndex}`"
      :class="messageClass(record, recordIndex)"
    >
      <div :class="messageShellClass(record)">
        <div
          v-if="editingRecordId === recordId(record)"
          :class="messageContentClass(record)"
        >
          <div class="flex flex-col gap-2">
            <Textarea
              v-model="editingText"
              rows="4"
              aria-label="编辑消息"
            />
            <div class="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                @click="cancelEdit"
              >
                取消
              </Button>
              <Button
                type="button"
                size="sm"
                @click="confirmEdit(record)"
              >
                保存
              </Button>
            </div>
          </div>
        </div>

        <template v-else>
          <template
            v-for="(segment, segmentIndex) in renderSegments(record)"
            :key="`${recordId(record)}-segment-${segmentIndex}-${segment.kind}`"
          >
            <ReasoningBlock
              v-if="segment.kind === 'thinking'"
              :parts="segment.parts"
              :streaming="isMessageStreaming(record, recordIndex)"
              @copy-code="emit('copyCode', $event)"
            />

            <MessageAttachmentGrid
              v-else-if="segment.kind === 'attachments'"
              :parts="segment.parts"
              :user="isUserMessage(record)"
              @jump-message="emit('jumpMessage', $event)"
              @open-refs="openRefs"
              @copy-code="emit('copyCode', $event)"
            />

            <div
              v-else
              :class="messageContentClass(record)"
            >
              <MessagePartRenderer
                v-for="(part, partIndex) in segment.parts"
                :key="`${recordId(record)}-part-${segmentIndex}-${part.type}-${partIndex}`"
                :part="part"
                :user="isUserMessage(record)"
                @jump-message="emit('jumpMessage', $event)"
                @open-refs="openRefs"
                @copy-code="emit('copyCode', $event)"
                @open-workspace-file="emit('openWorkspaceFile', $event)"
              />
            </div>
          </template>

          <div
            v-if="isRecordErrored(record) && errorText(record)"
            :class="messageErrorStatusClass(record)"
          >
            <p class="font-medium">
              生成失败
            </p>
            <p class="mt-1 whitespace-pre-wrap break-words">
              {{ errorText(record) }}
            </p>
          </div>

          <Marker
            v-if="!isUserMessage(record) && record.runProgress"
            role="status"
            class="px-1 py-1"
          >
            <MarkerIcon>
              <RefreshCwIcon class="animate-spin" />
            </MarkerIcon>
            <MarkerContent class="shimmer">
              {{ runProgressText(record) }}
            </MarkerContent>
          </Marker>

          <Marker
            v-else-if="showThinkingFallback(record, recordIndex)"
            role="status"
            class="px-1 py-1"
          >
            <MarkerContent class="shimmer">
              {{ t('chat.runProgress.thinking') }}
            </MarkerContent>
          </Marker>

          <MessageFilesChangedCard
            v-if="!isUserMessage(record) && sessionId && fileChangesFor(record).length"
            :session-id="sessionId"
            :changes="fileChangesFor(record)"
          />
        </template>

        <MessageToolbar
          :time="messageDisplayTime(record)"
          :streaming="isMessageStreaming(record, recordIndex)"
          :aborted="isRecordAborted(record)"
          :errored="isRecordErrored(record)"
          :checkpoint-id="record.checkpointId"
          :user="isUserMessage(record)"
          :copied="copiedRecordId === recordId(record)"
          @copy="copyRecord(record)"
          @quote="quoteRecord(record)"
          @edit="beginEdit(record)"
          @continue-message="emit('continueMessage', record)"
          @regenerate="emit('regenerateMessage', record)"
        />
      </div>
    </article>

    <RefsPanel
      v-model:open="refsPanelOpen"
      :refs="selectedRefs"
    />
  </div>
</template>

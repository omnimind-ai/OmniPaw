<script setup lang="ts">
import { computed, ref } from 'vue'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { ChatContent, ChatRecord, MessageDisplayBlock } from '@/composables/useMessages'
import {
  contentText,
  formatTime,
  isRecordAborted,
  isRecordErrored,
  recordErrorText,
  recordId,
} from './chat-display'
import type { RefItem } from './chat-display'
import MessagePartRenderer from './parts/MessagePartRenderer.vue'
import MessageToolbar from './parts/MessageToolbar.vue'
import ReasoningBlock from './parts/ReasoningBlock.vue'
import RefsPanel from './RefsPanel.vue'

const props = defineProps<{
  messages: ChatRecord[]
  loading?: boolean
  highlightedMessageId?: string
  isUserMessage: (record: ChatRecord) => boolean
  messageContent: (record: ChatRecord) => ChatContent
  messageBlocks: (content: ChatContent) => MessageDisplayBlock[]
  isMessageStreaming: (record: ChatRecord, index: number) => boolean
}>()

const emit = defineEmits<{
  copyMessage: [record: ChatRecord]
  copyCode: [code: string]
  editMessage: [record: ChatRecord, text: string]
  regenerateMessage: [record: ChatRecord]
  continueMessage: [record: ChatRecord]
  quoteMessage: [record: ChatRecord, text: string]
  jumpMessage: [messageId: string]
}>()

const editingRecordId = ref('')
const editingText = ref('')
const copiedRecordId = ref('')
const refsPanelOpen = ref(false)
const selectedRefs = ref<RefItem[]>([])

const hasMessages = computed(() => props.messages.length > 0)

function blocks(record: ChatRecord) {
  return props.messageBlocks(props.messageContent(record))
}

function hasDisplayBlocks(record: ChatRecord) {
  return blocks(record).length > 0
}

function errorText(record: ChatRecord) {
  return recordErrorText(record)
}

function showThinkingFallback(record: ChatRecord, index: number) {
  return (
    !hasDisplayBlocks(record) && !isRecordErrored(record) && props.isMessageStreaming(record, index)
  )
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

function messageContentStackClass(record: ChatRecord) {
  return cn(
    'flex min-w-0 flex-col',
    props.isUserMessage(record) ? 'items-start' : 'items-stretch',
    props.isUserMessage(record) ? 'gap-1' : 'gap-3'
  )
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
        <div :class="messageContentClass(record)">
          <div
            v-if="editingRecordId === recordId(record)"
            class="flex flex-col gap-2"
          >
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

          <template v-else>
            <template
              v-for="(block, blockIndex) in blocks(record)"
              :key="`${recordId(record)}-block-${blockIndex}-${block.kind}`"
            >
              <ReasoningBlock
                v-if="block.kind === 'thinking'"
                :parts="block.parts"
                :streaming="isMessageStreaming(record, recordIndex)"
              />

              <div
                v-else
                :class="messageContentStackClass(record)"
              >
                <MessagePartRenderer
                  v-for="(part, partIndex) in block.parts"
                  :key="`${recordId(record)}-part-${blockIndex}-${part.type}-${partIndex}`"
                  :part="part"
                  :user="isUserMessage(record)"
                  @jump-message="emit('jumpMessage', $event)"
                  @open-refs="openRefs"
                  @copy-code="emit('copyCode', $event)"
                />
              </div>
            </template>

            <div
              v-if="isRecordErrored(record) && errorText(record)"
              class="mt-1 px-1 py-1 text-sm text-destructive"
            >
              <p class="font-medium">
                生成失败
              </p>
              <p class="mt-1 whitespace-pre-wrap break-words leading-6">
                {{ errorText(record) }}
              </p>
            </div>

            <span
              v-else-if="showThinkingFallback(record, recordIndex)"
              class="text-muted-foreground"
            >
              正在思考...
            </span>
          </template>
        </div>

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

<script setup lang="ts">
import { CheckIcon, CopyIcon, Edit3Icon, GitBranchIcon, RefreshCwIcon, TextQuoteIcon } from 'lucide-vue-next'
import { computed, ref } from 'vue'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { ChatContent, ChatRecord, MessageDisplayBlock } from '@/composables/useMessages'
import { contentText, formatTime, isRecordAborted, isRecordErrored, recordId } from './chat-display'
import type { RefItem } from './chat-display'
import MessagePartRenderer from './parts/MessagePartRenderer.vue'
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
    'group/message flex w-full scroll-mt-6 gap-3',
    user ? 'justify-end' : 'justify-start',
    props.highlightedMessageId && props.highlightedMessageId === recordId(record) && 'rounded-lg ring-2 ring-ring/50',
    props.isMessageStreaming(record, index) && 'opacity-95',
  )
}

function bubbleClass(record: ChatRecord) {
  const user = props.isUserMessage(record)
  return cn(
    'flex max-w-[min(46rem,88%)] flex-col gap-3 rounded-lg px-3 py-2 text-sm leading-6 shadow-sm',
    user ? 'bg-primary text-primary-foreground' : 'border bg-card text-card-foreground',
    isRecordErrored(record) && 'border-destructive/50',
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
      <div :class="bubbleClass(record)">
        <div class="flex items-center justify-between gap-2">
          <div class="flex min-w-0 items-center gap-2">
            <Badge
              v-if="isMessageStreaming(record, recordIndex)"
              variant="outline"
            >
              生成中
            </Badge>
            <Badge
              v-else-if="isRecordAborted(record)"
              variant="secondary"
            >
              已停止
            </Badge>
            <Badge
              v-else-if="isRecordErrored(record)"
              variant="destructive"
            >
              错误
            </Badge>
            <Badge
              v-if="record.checkpointId"
              variant="outline"
            >
              <GitBranchIcon data-icon="inline-start" />
              checkpoint
            </Badge>
          </div>
          <span
            v-if="formatTime(record.created_at)"
            class="shrink-0 text-xs opacity-70"
          >
            {{ formatTime(record.created_at) }}
          </span>
        </div>

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
            :key="`${recordId(record)}-${block.kind}-${blockIndex}`"
          >
            <ReasoningBlock
              v-if="block.kind === 'thinking'"
              :parts="block.parts"
              :streaming="isMessageStreaming(record, recordIndex)"
            />
            <template v-else>
              <MessagePartRenderer
                v-for="(part, partIndex) in block.parts"
                :key="`${recordId(record)}-${blockIndex}-${part.type}-${partIndex}`"
                :part="part"
                :user="isUserMessage(record)"
                @jump-message="emit('jumpMessage', $event)"
                @open-refs="openRefs"
                @copy-code="emit('copyCode', $event)"
              />
            </template>
          </template>

          <span
            v-if="!blocks(record).length"
            class="text-muted-foreground"
          >
            正在思考...
          </span>
        </template>

        <div class="flex flex-wrap items-center justify-end gap-1 opacity-100 md:opacity-0 md:transition-opacity md:group-hover/message:opacity-100 md:group-focus-within/message:opacity-100">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="复制消息"
            @click="copyRecord(record)"
          >
            <CheckIcon
              v-if="copiedRecordId === recordId(record)"
              data-icon="inline-start"
            />
            <CopyIcon
              v-else
              data-icon="inline-start"
            />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="引用消息"
            @click="quoteRecord(record)"
          >
            <TextQuoteIcon data-icon="inline-start" />
          </Button>
          <Button
            v-if="isUserMessage(record)"
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="编辑消息"
            @click="beginEdit(record)"
          >
            <Edit3Icon data-icon="inline-start" />
          </Button>
          <Button
            v-if="isUserMessage(record)"
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="继续生成"
            @click="emit('continueMessage', record)"
          >
            <RefreshCwIcon data-icon="inline-start" />
          </Button>
          <Button
            v-if="!isUserMessage(record)"
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="重新生成"
            @click="emit('regenerateMessage', record)"
          >
            <RefreshCwIcon data-icon="inline-start" />
          </Button>
        </div>
      </div>
    </article>

    <RefsPanel
      v-model:open="refsPanelOpen"
      :refs="selectedRefs"
    />
  </div>
</template>

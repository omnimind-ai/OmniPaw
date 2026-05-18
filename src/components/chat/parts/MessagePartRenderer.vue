<script setup lang="ts">
import { ExternalLinkIcon, FileDownIcon, ReplyIcon } from 'lucide-vue-next'
import { computed } from 'vue'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { MessagePart } from '@/composables/useMessages'
import {
  attachmentIcon,
  attachmentLabel,
  formatJson,
  isAttachmentPart,
  partUrl,
  refsFromPart,
  replyMessageId,
  replyPreview,
  toolCalls,
} from '../chat-display'
import MarkdownMessagePart from './MarkdownMessagePart.vue'
import ToolCallCard from './ToolCallCard.vue'

const props = withDefaults(
  defineProps<{
    part: MessagePart
    user?: boolean
  }>(),
  {
    user: false,
  }
)

const emit = defineEmits<{
  jumpMessage: [messageId: string]
  openRefs: [refs: Array<{ id: string; title?: string; url?: string; snippet?: string }>]
  copyCode: [code: string]
}>()

const url = computed(() => partUrl(props.part))
const refs = computed(() => refsFromPart(props.part))

function jumpReply() {
  const messageId = replyMessageId(props.part)
  if (messageId) emit('jumpMessage', messageId)
}
</script>

<template>
  <MarkdownMessagePart
    v-if="part.type === 'plain'"
    :content="part.text || ''"
    :user="user"
    @copy-code="emit('copyCode', $event)"
  />

  <Button
    v-else-if="part.type === 'reply'"
    type="button"
    variant="outline"
    size="sm"
    class="max-w-full justify-start"
    @click="jumpReply"
  >
    <ReplyIcon data-icon="inline-start" />
    <span class="truncate">{{ replyPreview(part) }}</span>
  </Button>

  <button
    v-else-if="part.type === 'image' && url"
    type="button"
    class="max-w-full overflow-hidden rounded-md border bg-background"
  >
    <img
      :src="url"
      :alt="attachmentLabel(part)"
      class="max-h-80 max-w-full object-contain"
    >
  </button>

  <audio
    v-else-if="part.type === 'record' && url"
    class="w-full max-w-md"
    controls
    :src="url"
  />

  <video
    v-else-if="part.type === 'video' && url"
    class="max-h-80 max-w-full rounded-md border bg-background"
    controls
    :src="url"
  />

  <a
    v-else-if="part.type === 'file' && url"
    :href="url"
    :download="attachmentLabel(part)"
    class="inline-flex max-w-full items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
  >
    <FileDownIcon aria-hidden="true" />
    <span class="truncate">{{ attachmentLabel(part) }}</span>
  </a>

  <Badge
    v-else-if="isAttachmentPart(part)"
    variant="secondary"
    class="max-w-full justify-start"
  >
    <component
      :is="attachmentIcon(part)"
      data-icon="inline-start"
    />
    <span class="truncate">{{ attachmentLabel(part) }}</span>
  </Badge>

  <div
    v-else-if="part.type === 'tool_call'"
    class="flex flex-col gap-2"
  >
    <ToolCallCard
      v-for="(toolCall, toolIndex) in toolCalls(part)"
      :key="String(toolCall.id || toolCall.index || toolIndex)"
      :tool-call="toolCall"
    />
  </div>

  <div
    v-else-if="part.type === 'ref' && refs.length"
    class="flex flex-col gap-2 rounded-md border bg-background/70 p-3"
  >
    <div class="flex items-center justify-between gap-2">
      <p class="text-sm font-medium">
        引用来源
      </p>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        @click="emit('openRefs', refs)"
      >
        <ExternalLinkIcon data-icon="inline-start" />
        查看
      </Button>
    </div>
    <button
      v-for="refItem in refs.slice(0, 3)"
      :key="refItem.id"
      type="button"
      class="flex min-w-0 flex-col gap-1 rounded-md px-2 py-1 text-left hover:bg-accent"
      @click="emit('openRefs', refs)"
    >
      <span class="truncate text-sm">{{ refItem.title || refItem.url || refItem.id }}</span>
      <span
        v-if="refItem.snippet"
        class="line-clamp-2 text-xs text-muted-foreground"
      >
        {{ refItem.snippet }}
      </span>
    </button>
  </div>

  <pre
    v-else
    class="max-h-64 max-w-full overflow-auto rounded-md border bg-muted p-2 text-xs leading-5 text-muted-foreground"
  >{{ formatJson(part) }}</pre>
</template>

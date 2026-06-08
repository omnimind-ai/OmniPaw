<script setup lang="ts">
import { ExternalLinkIcon, FileDownIcon, ReplyIcon } from 'lucide-vue-next'
import { computed, ref } from 'vue'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { MessagePart } from '@/composables/useMessages'
import { cn } from '@/lib/utils'
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
  visionCaptureLabel,
} from '../chat-display'
import ImageViewerModal from './ImageViewerModal.vue'
import MarkdownMessagePart from './MarkdownMessagePart.vue'
import ToolCallCard from './ToolCallCard.vue'

const props = withDefaults(
  defineProps<{
    part: MessagePart
    user?: boolean
    compactAttachment?: boolean
  }>(),
  {
    user: false,
    compactAttachment: false,
  }
)

const emit = defineEmits<{
  jumpMessage: [messageId: string]
  openRefs: [refs: Array<{ id: string; title?: string; url?: string; snippet?: string }>]
  copyCode: [code: string]
}>()

const url = computed(() => partUrl(props.part))
const refs = computed(() => refsFromPart(props.part))
const viewerOpen = ref(false)

const attachmentTileClass = computed(() =>
  cn(
    'group/attachment relative flex size-24 shrink-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border bg-background text-center text-xs shadow-sm transition-colors',
    'hover:bg-accent hover:text-accent-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
    props.user && 'bg-background'
  )
)

function jumpReply() {
  const messageId = replyMessageId(props.part)
  if (messageId) emit('jumpMessage', messageId)
}

function openImageViewer() {
  if (url.value) viewerOpen.value = true
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
    :class="cn(attachmentTileClass, 'cursor-zoom-in')"
    :aria-label="`预览图片：${attachmentLabel(part)}`"
    @click="openImageViewer"
  >
    <img
      :src="url"
      :alt="attachmentLabel(part)"
      class="size-full object-cover"
    >
    <span class="absolute inset-x-1 bottom-1 truncate rounded-md bg-background/90 px-1 py-0.5 text-[0.65rem] leading-4 opacity-0 shadow-sm transition-opacity group-hover/attachment:opacity-100">
      {{ attachmentLabel(part) }}
    </span>
  </button>

  <audio
    v-else-if="part.type === 'record' && url && !compactAttachment"
    class="w-full max-w-md"
    controls
    :src="url"
  />

  <video
    v-else-if="part.type === 'video' && url && !compactAttachment"
    class="max-h-80 max-w-full rounded-md border bg-background"
    controls
    :src="url"
  />

  <a
    v-else-if="part.type === 'file' && url"
    :href="url"
    :download="attachmentLabel(part)"
    :class="attachmentTileClass"
  >
    <FileDownIcon aria-hidden="true" />
    <span class="line-clamp-2 max-w-full break-all px-1 leading-4">{{ attachmentLabel(part) }}</span>
  </a>

  <div
    v-else-if="isAttachmentPart(part) && compactAttachment"
    :class="attachmentTileClass"
    :title="attachmentLabel(part)"
  >
    <component
      :is="attachmentIcon(part)"
      aria-hidden="true"
    />
    <span class="line-clamp-2 max-w-full break-all px-1 leading-4">{{ attachmentLabel(part) }}</span>
  </div>

  <Badge
    v-else-if="part.type === 'vision_capture'"
    variant="secondary"
    class="max-w-full justify-start"
  >
    <component
      :is="attachmentIcon(part)"
      data-icon="inline-start"
    />
    <span class="truncate">{{ visionCaptureLabel(part) }}</span>
  </Badge>

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
    class="flex w-full flex-col gap-1.5"
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

  <ImageViewerModal
    v-if="part.type === 'image' && url"
    v-model:open="viewerOpen"
    :src="url"
    :title="attachmentLabel(part)"
    :alt="attachmentLabel(part)"
  />
</template>

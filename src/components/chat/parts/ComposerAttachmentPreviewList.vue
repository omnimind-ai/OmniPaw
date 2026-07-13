<script setup lang="ts">
import {
  AlertCircleIcon,
  FileIcon,
  ImageIcon,
  Loader2Icon,
  MicIcon,
  VideoIcon,
  XIcon,
} from '@lucide/vue'
import { computed, reactive, watch } from 'vue'
import { appBridge } from '@/bridge/app'
import {
  formatBytes,
  type StagedFileInfo,
  type StagedUploadItem,
} from '@/composables/useMediaHandling'
import { cn } from '@/lib/utils'
import { logger } from '@/utils/logger'

type AttachmentPreviewItem = StagedFileInfo | StagedUploadItem
type ItemScope = 'staged' | 'upload'

const props = withDefaults(
  defineProps<{
    stagedFiles: StagedFileInfo[]
    uploadItems?: StagedUploadItem[]
    compact?: boolean
  }>(),
  {
    uploadItems: () => [],
    compact: false,
  }
)

const emit = defineEmits<{
  removeAttachment: [index: number]
  removeUploadItem: [index: number]
}>()

const previewLogger = logger.child('chat.composer.attachments')
const resolvedPreviewUrls = reactive<Record<string, string>>({})
const resolvingPreviewKeys = reactive<Record<string, boolean>>({})

const uploadItems = computed(() => props.uploadItems || [])

watch(
  () => [props.stagedFiles, uploadItems.value],
  () => {
    props.stagedFiles.forEach((file, index) => {
      if (file.type === 'image' && !file.url) void resolvePreviewUrl(file, index, 'staged')
    })
    uploadItems.value.forEach((file, index) => {
      if (file.type === 'image' && !file.url) void resolvePreviewUrl(file, index, 'upload')
    })
  },
  { deep: true, immediate: true }
)

function attachmentIcon(file: AttachmentPreviewItem) {
  if (file.type === 'image') return ImageIcon
  if (file.type === 'record') return MicIcon
  if (file.type === 'video') return VideoIcon
  return FileIcon
}

function attachmentLabel(file: AttachmentPreviewItem) {
  if (file.filename) return file.filename
  if (file.type === 'image') return '图片'
  if (file.type === 'video') return '视频'
  if (file.type === 'record') return '音频'
  return '附件'
}

function attachmentMeta(file: AttachmentPreviewItem) {
  const details = []
  if ('size' in file && file.size) details.push(formatBytes(file.size))
  if ('mimeType' in file && file.mimeType) details.push(file.mimeType)
  return details.join(' · ')
}

function attachmentId(file: AttachmentPreviewItem) {
  return file.attachmentId || file.attachment_id || ''
}

function itemKey(file: AttachmentPreviewItem, index: number, scope: ItemScope) {
  const id = attachmentId(file)
  if (id) return `${scope}:attachment:${id}`
  if ('id' in file && file.id) return `${scope}:upload:${file.id}`
  return `${scope}:${file.signature || file.filename || 'attachment'}:${index}`
}

function previewUrl(file: AttachmentPreviewItem, index: number, scope: ItemScope) {
  const key = itemKey(file, index, scope)
  return resolvedPreviewUrls[key] || file.url || ''
}

async function resolvePreviewUrl(file: AttachmentPreviewItem, index: number, scope: ItemScope) {
  if (file.type !== 'image') return

  const key = itemKey(file, index, scope)
  if (resolvedPreviewUrls[key] || resolvingPreviewKeys[key]) return

  const id = attachmentId(file)
  if (!id) return

  resolvingPreviewKeys[key] = true
  try {
    const preview = await appBridge.attachment?.getPreviewUrl(id)
    const url = typeof preview === 'string' ? preview : preview?.url || ''
    if (url) resolvedPreviewUrls[key] = url
  } catch (error) {
    previewLogger.warn('Failed to resolve composer attachment preview.', {
      attachmentId: id,
      filename: file.filename,
      error,
    })
  } finally {
    delete resolvingPreviewKeys[key]
  }
}

function handleImageError(file: AttachmentPreviewItem, index: number, scope: ItemScope) {
  void resolvePreviewUrl(file, index, scope)
}

function itemClass(file: AttachmentPreviewItem) {
  return cn(
    props.compact
      ? [
          'relative flex h-16 shrink-0 overflow-hidden rounded-lg border bg-background text-xs shadow-sm',
          file.type === 'image' ? 'w-28' : 'w-40 items-center gap-2 px-3 pr-9',
        ]
      : 'relative flex size-24 shrink-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border bg-background p-2 text-center text-xs shadow-sm',
    'status' in file && file.status === 'failed' && 'border-destructive/50'
  )
}

function mediaShellClass(file: AttachmentPreviewItem) {
  return cn(
    'flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden bg-muted',
    props.compact ? 'rounded-lg' : 'rounded-md',
    props.compact && file.type !== 'image' && 'size-9 flex-none rounded-md'
  )
}

function imageClass() {
  return props.compact ? 'size-full object-contain' : 'size-full object-cover'
}

function removeButtonClass() {
  return props.compact
    ? 'absolute top-1.5 right-1.5 grid size-7 place-items-center rounded-md bg-background/90 text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none'
    : 'absolute top-1 right-1 bg-background/90'
}
</script>

<template>
  <div
    v-if="uploadItems.length"
    class="flex w-full flex-wrap gap-2"
  >
    <div
      v-for="(file, fileIndex) in uploadItems"
      :key="itemKey(file, fileIndex, 'upload')"
      :class="itemClass(file)"
    >
      <div :class="mediaShellClass(file)">
        <img
          v-if="file.type === 'image' && previewUrl(file, fileIndex, 'upload')"
          :src="previewUrl(file, fileIndex, 'upload')"
          :alt="attachmentLabel(file)"
          :class="imageClass()"
          @error="handleImageError(file, fileIndex, 'upload')"
        >
        <component
          :is="attachmentIcon(file)"
          v-else
          aria-hidden="true"
        />
      </div>

      <template v-if="!compact">
        <div class="flex min-w-0 max-w-full items-center gap-1">
          <Loader2Icon
            v-if="file.status === 'pending'"
            class="animate-spin"
            aria-hidden="true"
          />
          <AlertCircleIcon
            v-if="file.status === 'failed'"
            class="text-destructive"
            aria-hidden="true"
          />
          <span class="truncate font-medium">{{ attachmentLabel(file) }}</span>
        </div>
        <p class="max-w-full truncate text-muted-foreground">
          {{ file.error || attachmentMeta(file) || file.status }}
        </p>
      </template>

      <span
        v-else-if="file.type !== 'image'"
        class="min-w-0 flex-1 truncate pr-1 text-left font-medium"
      >
        {{ attachmentLabel(file) }}
      </span>

      <div
        v-else-if="file.status === 'pending' || file.status === 'failed'"
        class="absolute bottom-1.5 left-1.5 rounded-md bg-background/90 p-1 shadow-sm"
      >
        <Loader2Icon
          v-if="file.status === 'pending'"
          class="animate-spin"
          aria-hidden="true"
        />
        <AlertCircleIcon
          v-else
          class="text-destructive"
          aria-hidden="true"
        />
      </div>

      <button
        type="button"
        :class="removeButtonClass()"
        :aria-label="`移除附件：${attachmentLabel(file)}`"
        @click="emit('removeUploadItem', fileIndex)"
      >
        <XIcon
          class="size-4"
          aria-hidden="true"
        />
      </button>
    </div>
  </div>

  <div
    v-if="stagedFiles.length"
    class="flex w-full flex-wrap gap-2"
  >
    <div
      v-for="(file, fileIndex) in stagedFiles"
      :key="itemKey(file, fileIndex, 'staged')"
      :class="itemClass(file)"
    >
      <div :class="mediaShellClass(file)">
        <img
          v-if="file.type === 'image' && previewUrl(file, fileIndex, 'staged')"
          :src="previewUrl(file, fileIndex, 'staged')"
          :alt="attachmentLabel(file)"
          :class="imageClass()"
          @error="handleImageError(file, fileIndex, 'staged')"
        >
        <component
          :is="attachmentIcon(file)"
          v-else
          aria-hidden="true"
        />
      </div>

      <template v-if="!compact">
        <span class="max-w-full truncate font-medium">{{ attachmentLabel(file) }}</span>
        <span
          v-if="attachmentMeta(file)"
          class="max-w-full truncate text-muted-foreground"
        >
          {{ attachmentMeta(file) }}
        </span>
      </template>

      <span
        v-else-if="file.type !== 'image'"
        class="min-w-0 flex-1 truncate pr-1 text-left font-medium"
      >
        {{ attachmentLabel(file) }}
      </span>

      <button
        type="button"
        :class="removeButtonClass()"
        :aria-label="`移除附件：${attachmentLabel(file)}`"
        @click="emit('removeAttachment', fileIndex)"
      >
        <XIcon
          class="size-4"
          aria-hidden="true"
        />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  AlertCircleIcon,
  ArrowUpIcon,
  FileIcon,
  ImageIcon,
  Loader2Icon,
  MicIcon,
  PlusIcon,
  ReplyIcon,
  SparklesIcon,
  SquareIcon,
  VideoIcon,
  XIcon,
} from 'lucide-vue-next'
import { computed, ref } from 'vue'

import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from '@/components/ui/input-group'
import {
  ATTACHMENT_LIMITS,
  formatBytes,
  type StagedFileInfo,
  type StagedUploadItem,
} from '@/composables/useMediaHandling'
import { cn } from '@/lib/utils'
import type { ProviderModelOption } from '@/stores/provider'

const props = defineProps<{
  modelValue: string
  stagedFiles: StagedFileInfo[]
  stagedUploadItems?: StagedUploadItem[]
  modelOptions: ProviderModelOption[]
  selectedModelKey: string
  selectedModelLabel: string
  selectedModelMeta?: string
  replyPreview?: string
  running?: boolean
  uploadPending?: boolean
  attachmentWarning?: string
  disabled?: boolean
  canSend?: boolean
  canStop?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  selectModel: [key: string]
  addAttachment: []
  removeAttachment: [index: number]
  removeUploadItem: [index: number]
  filesDropped: [files: File[]]
  clearReply: []
  paste: [event: ClipboardEvent]
  submit: []
  stop: []
}>()

const compositionActive = ref(false)
const lastCompositionEndAt = ref<number | null>(null)
const dragging = ref(false)
const textareaValue = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', String(value)),
})
const uploadItems = computed(() => props.stagedUploadItems || [])
const attachmentCount = computed(
  () =>
    uploadItems.value.filter((item) => item.status !== 'failed').length || props.stagedFiles.length
)
const limitsText = computed(
  () =>
    `${attachmentCount.value}/${ATTACHMENT_LIMITS.maxFilesPerMessage} · ${formatBytes(ATTACHMENT_LIMITS.maxFileBytes)} / 文件`
)
const primaryActionLabel = computed(() => (props.running ? '停止生成' : '发送'))
const canUsePrimaryAction = computed(() =>
  props.running ? props.canStop !== false : props.canSend
)

function handleCompositionStart() {
  compositionActive.value = true
}

function handleCompositionEnd(event: CompositionEvent) {
  compositionActive.value = false
  lastCompositionEndAt.value = event.timeStamp
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey) return

  const recentCompositionEnd =
    typeof lastCompositionEndAt.value === 'number' &&
    event.timeStamp >= lastCompositionEndAt.value &&
    event.timeStamp - lastCompositionEndAt.value < 100

  if (
    compositionActive.value ||
    event.isComposing ||
    event.keyCode === 229 ||
    recentCompositionEnd
  ) {
    return
  }

  event.preventDefault()
  emit('submit')
}

function attachmentIcon(file: StagedFileInfo | StagedUploadItem) {
  if (file.type === 'image') return ImageIcon
  if (file.type === 'record') return MicIcon
  if (file.type === 'video') return VideoIcon
  return FileIcon
}

function attachmentLabel(file: StagedFileInfo | StagedUploadItem) {
  if (file.filename) return file.filename
  if (file.type === 'image') return '图片'
  if (file.type === 'video') return '视频'
  if (file.type === 'record') return '音频'
  return '附件'
}

function attachmentMeta(file: StagedFileInfo | StagedUploadItem) {
  const details = []
  if ('size' in file && file.size) details.push(formatBytes(file.size))
  if ('mimeType' in file && file.mimeType) details.push(file.mimeType)
  return details.join(' · ')
}

function handlePrimaryAction() {
  if (props.running) {
    emit('stop')
    return
  }
  emit('submit')
}

function handleDragOver() {
  if (props.disabled) return
  dragging.value = true
}

function handleDragLeave(event: DragEvent) {
  const current = event.currentTarget as HTMLElement | null
  const related = event.relatedTarget as Node | null
  if (current && related && current.contains(related)) return
  dragging.value = false
}

function handleDrop(event: DragEvent) {
  dragging.value = false
  if (props.disabled) return
  const files = Array.from(event.dataTransfer?.files || [])
  if (files.length) emit('filesDropped', files)
}
</script>

<template>
  <form
    :class="cn('w-full rounded-xl transition-colors', dragging && 'bg-accent/40')"
    @submit.prevent="emit('submit')"
    @dragover.prevent="handleDragOver"
    @dragleave.prevent="handleDragLeave"
    @drop.prevent="handleDrop"
  >
    <FieldGroup>
      <Field>
        <FieldLabel
          for="chat-composer"
          class="sr-only"
        >
          输入消息
        </FieldLabel>

        <InputGroup :class="cn('min-h-36 shadow-sm', dragging && 'border-ring ring-3 ring-ring/30')">
          <InputGroupTextarea
            id="chat-composer"
            v-model="textareaValue"
            rows="3"
            :placeholder="dragging ? '松开以上传附件' : 'Ask OmniClaw...'"
            class="min-h-24"
            :disabled="disabled && !running"
            @keydown="handleKeydown"
            @paste="emit('paste', $event)"
            @compositionstart="handleCompositionStart"
            @compositionend="handleCompositionEnd"
          />

          <InputGroupAddon
            align="block-end"
            class="flex-col gap-2"
          >
            <div
              v-if="replyPreview"
              class="flex w-full items-center justify-between gap-2 rounded-md border bg-muted/60 px-3 py-2 text-sm"
            >
              <div class="flex min-w-0 items-center gap-2">
                <ReplyIcon data-icon="inline-start" />
                <span class="truncate">{{ replyPreview }}</span>
              </div>
              <InputGroupButton
                size="icon-xs"
                aria-label="取消引用"
                @click="emit('clearReply')"
              >
                <XIcon data-icon="inline-start" />
              </InputGroupButton>
            </div>

            <div
              v-if="uploadItems.length"
              class="grid w-full gap-2 sm:grid-cols-2"
            >
              <div
                v-for="(file, fileIndex) in uploadItems"
                :key="`${file.id}-${fileIndex}`"
                :class="cn(
                  'flex min-w-0 items-center gap-2 rounded-md border bg-background p-2 text-sm',
                  file.status === 'failed' && 'border-destructive/50',
                )"
              >
                <div class="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                  <img
                    v-if="file.type === 'image' && file.url"
                    :src="file.url"
                    :alt="attachmentLabel(file)"
                    class="size-full object-cover"
                  >
                  <component
                    :is="attachmentIcon(file)"
                    v-else
                    aria-hidden="true"
                  />
                </div>

                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <span class="truncate font-medium">{{ attachmentLabel(file) }}</span>
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
                  </div>
                  <p class="truncate text-xs text-muted-foreground">
                    {{ file.error || attachmentMeta(file) || file.status }}
                  </p>
                </div>

                <InputGroupButton
                  size="icon-xs"
                  aria-label="移除附件"
                  @click="emit('removeUploadItem', fileIndex)"
                >
                  <XIcon data-icon="inline-start" />
                </InputGroupButton>
              </div>
            </div>

            <div
              v-else-if="stagedFiles.length"
              class="flex w-full flex-wrap items-center gap-2"
            >
              <Badge
                v-for="(file, fileIndex) in stagedFiles"
                :key="`${file.attachmentId}-${fileIndex}`"
                as="button"
                type="button"
                variant="secondary"
                class="max-w-56"
                @click="emit('removeAttachment', fileIndex)"
              >
                <component
                  :is="attachmentIcon(file)"
                  data-icon="inline-start"
                />
                <span class="truncate">{{ attachmentLabel(file) }}</span>
                <XIcon />
              </Badge>
            </div>

            <div
              v-if="attachmentWarning || uploadPending || attachmentCount"
              class="flex w-full flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"
            >
              <span :class="cn(attachmentWarning && 'text-destructive')">
                {{ attachmentWarning || limitsText }}
              </span>
              <span v-if="uploadPending">附件上传中</span>
            </div>

            <div class="flex w-full items-center justify-between gap-2">
              <div class="flex min-w-0 items-center gap-2">
                <InputGroupButton
                  size="icon-sm"
                  aria-label="添加附件"
                  :disabled="disabled && !running"
                  @click="emit('addAttachment')"
                >
                  <PlusIcon data-icon="inline-start" />
                </InputGroupButton>

                <DropdownMenu>
                  <DropdownMenuTrigger as-child>
                    <InputGroupButton
                      class="max-w-64 justify-start"
                      :disabled="!modelOptions.length"
                    >
                      <SparklesIcon data-icon="inline-start" />
                      <span class="truncate">{{ selectedModelLabel }}</span>
                    </InputGroupButton>
                  </DropdownMenuTrigger>

                  <DropdownMenuContent
                    align="start"
                    class="w-80"
                  >
                    <DropdownMenuLabel>切换模型</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuRadioGroup
                      :model-value="selectedModelKey"
                      @update:model-value="emit('selectModel', String($event))"
                    >
                      <DropdownMenuRadioItem
                        v-for="option in modelOptions"
                        :key="option.key"
                        :value="option.key"
                        class="items-start"
                      >
                        <div class="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span class="truncate">{{ option.modelName }}</span>
                          <span class="truncate text-xs text-muted-foreground">
                            {{ option.providerName }}
                          </span>
                        </div>
                      </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div class="flex items-center gap-2">
                <span
                  v-if="selectedModelMeta"
                  class="hidden max-w-36 truncate text-xs text-muted-foreground sm:inline"
                >
                  {{ selectedModelMeta }}
                </span>

                <InputGroupButton
                  size="icon-sm"
                  variant="default"
                  :aria-label="primaryActionLabel"
                  :disabled="!canUsePrimaryAction"
                  @click="handlePrimaryAction"
                >
                  <SquareIcon
                    v-if="running"
                    data-icon="inline-start"
                  />
                  <ArrowUpIcon
                    v-else
                    data-icon="inline-start"
                  />
                </InputGroupButton>
              </div>
            </div>
          </InputGroupAddon>
        </InputGroup>
      </Field>
    </FieldGroup>
  </form>
</template>

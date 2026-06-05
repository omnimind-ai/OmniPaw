<script setup lang="ts">
import type { ToolProfile } from '@shared/types/chat'
import {
  AlertCircleIcon,
  ArrowUpIcon,
  FileIcon,
  ImageIcon,
  Loader2Icon,
  MicIcon,
  PlusIcon,
  ReplyIcon,
  ShieldCheckIcon,
  SparklesIcon,
  SquareIcon,
  VideoIcon,
  XIcon,
} from 'lucide-vue-next'
import { computed, ref } from 'vue'
import ChatContextUsageIndicator from '@/components/chat/ChatContextUsageIndicator.vue'
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
import type { SessionContextUsage } from '@/stores/chat'
import type { ProviderModelOption } from '@/stores/provider'

const props = defineProps<{
  modelValue: string
  stagedFiles: StagedFileInfo[]
  stagedUploadItems?: StagedUploadItem[]
  modelOptions: ProviderModelOption[]
  selectedModelKey: string
  selectedModelLabel: string
  selectedModelMeta?: string
  toolProfile: ToolProfile
  toolProfileOptions: Array<{
    value: ToolProfile
    label: string
    description: string
  }>
  showToolProfile?: boolean
  toolProfileSaving?: boolean
  contextUsage?: SessionContextUsage
  contextUsageLoading?: boolean
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
  selectToolProfile: [profile: ToolProfile]
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
    props.stagedFiles.length + uploadItems.value.filter((item) => item.status !== 'failed').length
)
const limitsText = computed(
  () =>
    `${attachmentCount.value}/${ATTACHMENT_LIMITS.maxFilesPerMessage} · ${formatBytes(ATTACHMENT_LIMITS.maxFileBytes)} / 文件`
)
const primaryActionLabel = computed(() => (props.running ? '停止生成' : '发送'))
const canUsePrimaryAction = computed(() =>
  props.running ? props.canStop !== false : props.canSend
)
const selectedToolProfile = computed(
  () =>
    props.toolProfileOptions.find((option) => option.value === props.toolProfile) ??
    props.toolProfileOptions[0] ??
    null
)
const selectedModelOption = computed(
  () => props.modelOptions.find((option) => option.key === props.selectedModelKey) ?? null
)
const selectedModelCompactLabel = computed(() =>
  compactModelLabel(
    selectedModelOption.value?.modelName || props.selectedModelLabel,
    selectedModelOption.value?.providerName
  )
)
const selectedToolProfileLabel = computed(() => selectedToolProfile.value?.label ?? '权限')
const selectedToolProfileDescription = computed(
  () => selectedToolProfile.value?.description ?? '选择 Agent 工具权限'
)
const showToolProfileControl = computed(() => props.showToolProfile !== false)

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

function compactModelLabel(label: string, providerName?: string): string {
  let value = label.trim()
  if (!value) return label

  const pathParts = value.split('/').filter(Boolean)
  value = pathParts[pathParts.length - 1]?.trim() || value

  const prefixes = [
    providerName,
    'openai',
    'anthropic',
    'google',
    'deepseek',
    'qwen',
    'moonshot',
    'openrouter',
    'siliconflow',
    'volcengine',
  ]

  for (const prefix of prefixes) {
    const normalized = prefix ? escapeRegExp(prefix.trim()).replace(/\s+/g, '[-_\\s]+') : ''
    if (!normalized) continue
    value = value.replace(new RegExp(`^${normalized}[-_\\s]+`, 'i'), '')
  }

  return value.replace(/[-_]+/g, ' ').trim() || label
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function handleToolProfileSelect(value: unknown) {
  if (typeof value !== 'string') return
  emit('selectToolProfile', value as ToolProfile)
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
    :class="cn('@container/chat-composer w-full rounded-xl transition-colors', dragging && 'bg-accent/40')"
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
          <InputGroupAddon
            v-if="uploadItems.length || stagedFiles.length || attachmentWarning || uploadPending || attachmentCount"
            align="block-start"
            class="flex-col gap-2 border-b"
          >
            <div
              v-if="uploadItems.length"
              class="flex w-full flex-wrap gap-2"
            >
              <div
                v-for="(file, fileIndex) in uploadItems"
                :key="`${file.id}-${fileIndex}`"
                :class="cn(
                  'relative flex size-24 shrink-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border bg-background p-2 text-center text-xs shadow-sm',
                  file.status === 'failed' && 'border-destructive/50',
                )"
              >
                <div class="flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden rounded-md bg-muted">
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

                <InputGroupButton
                  size="icon-xs"
                  class="absolute top-1 right-1 bg-background/90"
                  aria-label="移除附件"
                  @click="emit('removeUploadItem', fileIndex)"
                >
                  <XIcon data-icon="inline-start" />
                </InputGroupButton>
              </div>
            </div>

            <div
              v-if="stagedFiles.length"
              class="flex w-full flex-wrap gap-2"
            >
              <div
                v-for="(file, fileIndex) in stagedFiles"
                :key="`${file.attachmentId}-${fileIndex}`"
                :class="cn(
                  'relative flex size-24 shrink-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border bg-background p-2 text-center text-xs shadow-sm',
                )"
              >
                <div class="flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden rounded-md bg-muted">
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
                <span class="max-w-full truncate font-medium">{{ attachmentLabel(file) }}</span>
                <span
                  v-if="attachmentMeta(file)"
                  class="max-w-full truncate text-muted-foreground"
                >
                    {{ attachmentMeta(file) }}
                  </span>
                <InputGroupButton
                  size="icon-xs"
                  class="absolute top-1 right-1 bg-background/90"
                  :aria-label="`移除附件：${attachmentLabel(file)}`"
                  @click="emit('removeAttachment', fileIndex)"
                >
                  <XIcon data-icon="inline-start" />
                </InputGroupButton>
              </div>
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
          </InputGroupAddon>

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

            <div class="flex w-full min-w-0 items-center justify-between gap-2">
              <div class="flex min-w-0 flex-1 items-center gap-1.5">
                <InputGroupButton
                  size="icon-sm"
                  aria-label="添加附件"
                  :disabled="disabled && !running"
                  @click="emit('addAttachment')"
                >
                  <PlusIcon data-icon="inline-start" />
                </InputGroupButton>

                <slot name="controls" />

                <DropdownMenu>
                  <DropdownMenuTrigger as-child>
                    <InputGroupButton
                      class="max-w-9 justify-start px-1.5 @min-[30rem]/chat-composer:max-w-36 @min-[44rem]/chat-composer:max-w-64"
                      :disabled="!modelOptions.length"
                      :aria-label="`切换模型：${selectedModelLabel}`"
                    >
                      <SparklesIcon data-icon="inline-start" />
                      <span class="hidden truncate @min-[30rem]/chat-composer:inline @min-[44rem]/chat-composer:hidden">
                        {{ selectedModelCompactLabel }}
                      </span>
                      <span class="hidden truncate @min-[44rem]/chat-composer:inline">
                        {{ selectedModelLabel }}
                      </span>
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

                <DropdownMenu v-if="showToolProfileControl">
                  <DropdownMenuTrigger as-child>
                    <InputGroupButton
                      class="min-w-0 max-w-28 justify-start px-1.5 @min-[44rem]/chat-composer:max-w-40"
                      :disabled="toolProfileSaving || !toolProfileOptions.length"
                      :aria-label="`Agent 权限：${selectedToolProfileDescription}`"
                    >
                      <ShieldCheckIcon data-icon="inline-start" />
                      <span class="truncate">
                        {{ selectedToolProfileLabel }}
                      </span>
                    </InputGroupButton>
                  </DropdownMenuTrigger>

                  <DropdownMenuContent
                    align="start"
                    class="w-72"
                  >
                    <DropdownMenuLabel>Agent 权限</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuRadioGroup
                      :model-value="toolProfile"
                      @update:model-value="handleToolProfileSelect"
                    >
                      <DropdownMenuRadioItem
                        v-for="option in toolProfileOptions"
                        :key="option.value"
                        :value="option.value"
                        class="items-start"
                      >
                        <div class="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span class="truncate">{{ option.label }}</span>
                          <span class="text-xs text-muted-foreground">
                            {{ option.description }}
                          </span>
                        </div>
                      </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>

                <ChatContextUsageIndicator
                  :usage="contextUsage"
                  :loading="contextUsageLoading"
                />
              </div>

              <div class="flex shrink-0 items-center gap-2">
                <span
                  v-if="selectedModelMeta"
                  class="hidden max-w-36 truncate text-xs text-muted-foreground @min-[44rem]/chat-composer:inline"
                >
                  {{ selectedModelMeta }}
                </span>

                <InputGroupButton
                  size="icon-sm"
                  variant="default"
                  class="grid place-items-center"
                  :aria-label="primaryActionLabel"
                  :disabled="!canUsePrimaryAction"
                  @click="handlePrimaryAction"
                >
                  <SquareIcon
                    v-if="running"
                    data-icon
                  />
                  <ArrowUpIcon
                    v-else
                    data-icon
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

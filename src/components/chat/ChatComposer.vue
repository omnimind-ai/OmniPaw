<script setup lang="ts">
import type { ToolProfile } from '@shared/types/chat'
import {
  ArrowUpIcon,
  PlusIcon,
  ReplyIcon,
  ShieldCheckIcon,
  SparklesIcon,
  SquareIcon,
  XIcon,
} from 'lucide-vue-next'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
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
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import {
  ATTACHMENT_LIMITS,
  formatBytes,
  type StagedFileInfo,
  type StagedUploadItem,
} from '@/composables/useMediaHandling'
import { cn } from '@/lib/utils'
import type { SessionContextUsage } from '@/stores/chat'
import type { ProviderModelOption } from '@/stores/provider'
import ComposerAttachmentPreviewList from './parts/ComposerAttachmentPreviewList.vue'

const { t } = useI18n()

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
  compactAttachments?: boolean
  showAttachmentPresets?: boolean
  autoFocus?: boolean
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
const formRef = ref<HTMLFormElement | null>(null)
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
const attachmentStatusText = computed(
  () => props.attachmentWarning || (!props.compactAttachments ? limitsText.value : '')
)
const showAttachmentStatus = computed(() =>
  Boolean(props.attachmentWarning || props.uploadPending || attachmentStatusText.value)
)
const primaryActionLabel = computed(() =>
  props.running ? t('chat.composer.stop') : t('chat.composer.send')
)
const canUsePrimaryAction = computed(() =>
  props.running ? props.canStop !== false : props.canSend
)
const modifierKeyLabel = getPrimaryModifierLabel()
const inputGroupClass = computed(() =>
  cn(
    props.compactAttachments ? 'min-h-28' : 'min-h-36',
    'shadow-sm',
    dragging.value && 'border-ring ring-3 ring-ring/30'
  )
)
const formClass = computed(() =>
  cn(
    '@container/chat-composer w-full rounded-xl transition-colors',
    dragging.value && 'bg-accent/40'
  )
)
const textareaClass = computed(() => (props.compactAttachments ? 'min-h-16' : 'min-h-24'))
const composerPlaceholder = computed(() => {
  if (dragging.value) return t('chat.composer.uploadDragPlaceholder')
  if (showAttachmentPresetPanel.value) return ''
  return 'Ask OmniClaw...'
})
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
const selectedToolProfileLabel = computed(
  () => selectedToolProfile.value?.label ?? t('chat.composer.permissionFallbackLabel')
)
const selectedToolProfileDescription = computed(
  () => selectedToolProfile.value?.description ?? t('chat.composer.permissionFallbackDescription')
)
const showToolProfileControl = computed(() => props.showToolProfile !== false)
const firstAttachmentForPresets = computed(() => props.stagedFiles[0] ?? null)
const attachmentPresets = computed(() => {
  const attachment = firstAttachmentForPresets.value
  if (!attachment) return []
  return presetsForAttachment(attachment).slice(0, 2)
})
const showAttachmentPresetPanel = computed(
  () =>
    props.showAttachmentPresets === true &&
    !dragging.value &&
    !props.running &&
    !props.attachmentWarning &&
    !textareaValue.value.trim() &&
    attachmentPresets.value.length > 0
)
const canUseAttachmentPreset = computed(
  () =>
    showAttachmentPresetPanel.value &&
    props.canSend === true &&
    !props.uploadPending &&
    !(props.disabled && !props.running)
)
const attachmentStatusClass = computed(() => cn(props.attachmentWarning && 'text-destructive'))

function focus(options: FocusOptions = { preventScroll: true }) {
  const textarea = formRef.value?.querySelector<HTMLTextAreaElement>('textarea')
  if (!textarea || textarea.disabled) {
    return
  }

  textarea.focus(options)
  textarea.setSelectionRange(textarea.value.length, textarea.value.length)
}

function scheduleFocus() {
  if (!props.autoFocus) {
    return
  }

  void nextTick(() => {
    window.requestAnimationFrame(() => focus())
  })
}

onMounted(scheduleFocus)

watch(
  () => props.disabled,
  (disabled) => {
    if (!disabled) {
      scheduleFocus()
    }
  }
)

defineExpose({
  focus,
})

function handleCompositionStart() {
  compositionActive.value = true
}

function handleCompositionEnd(event: CompositionEvent) {
  compositionActive.value = false
  lastCompositionEndAt.value = event.timeStamp
}

function handleKeydown(event: KeyboardEvent) {
  if (handleAttachmentPresetShortcut(event)) return
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

function handleAttachmentPresetShortcut(event: KeyboardEvent) {
  if (
    compositionActive.value ||
    event.isComposing ||
    event.keyCode === 229 ||
    !isPrimaryModifierPressed(event) ||
    event.shiftKey ||
    event.altKey
  ) {
    return false
  }

  const shortcutIndex = Number(event.key) - 1
  if (!Number.isInteger(shortcutIndex) || shortcutIndex < 0 || shortcutIndex > 1) {
    return false
  }
  if (!attachmentPresets.value[shortcutIndex] || !canUseAttachmentPreset.value) {
    return false
  }

  event.preventDefault()
  void submitAttachmentPreset(shortcutIndex)
  return true
}

async function submitAttachmentPreset(index: number) {
  const preset = attachmentPresets.value[index]
  if (!preset || !canUseAttachmentPreset.value) return

  textareaValue.value = preset.prompt
  await nextTick()
  emit('submit')
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

function presetsForAttachment(file: StagedFileInfo) {
  const extension = fileExtension(file.filename || file.original_name)
  const mimeType = file.mimeType || ''

  if (file.type === 'image' || mimeType.startsWith('image/')) {
    return [
      { label: '描述图片', prompt: '帮我描述这张图片，指出关键信息' },
      { label: '提取文字', prompt: '帮我提取这张图片里的文字' },
    ]
  }

  if (isCodeExtension(extension)) {
    return [
      { label: '解释代码', prompt: '帮我解释这个代码文件的' },
      { label: '补全文件', prompt: '帮我补全这个代码文件' },
    ]
  }

  if (isDataExtension(extension) || isDataMimeType(mimeType)) {
    return [
      { label: '分析数据', prompt: '帮我分析这个数据文件，概括结构和关键字段。' },
      { label: '提取要点', prompt: '帮我提取这个数据文件里的关键信息和异常点。' },
    ]
  }

  if (isDocumentExtension(extension) || mimeType.startsWith('text/')) {
    return [
      { label: '总结文件', prompt: '帮我总结这个文件，列出核心内容。' },
      { label: '补全文件', prompt: '帮我补全这个文件，保持原有语气和结构。' },
    ]
  }

  return [
    { label: '总结文件', prompt: '帮我总结这个文件，列出核心内容。' },
    { label: '提取信息', prompt: '帮我提取这个文件里的关键信息，并整理成清单。' },
  ]
}

function fileExtension(filename?: string) {
  const name = filename?.trim() || ''
  const lastDot = name.lastIndexOf('.')
  if (lastDot <= 0 || lastDot === name.length - 1) return ''
  return name.slice(lastDot + 1).toLowerCase()
}

function isCodeExtension(extension: string) {
  return [
    'c',
    'cc',
    'cpp',
    'cs',
    'css',
    'go',
    'h',
    'hpp',
    'html',
    'java',
    'js',
    'jsx',
    'kt',
    'lua',
    'mjs',
    'php',
    'py',
    'rb',
    'rs',
    'scss',
    'sh',
    'svelte',
    'swift',
    'ts',
    'tsx',
    'vue',
  ].includes(extension)
}

function isDataExtension(extension: string) {
  return ['csv', 'json', 'jsonl', 'ndjson', 'toml', 'tsv', 'xml', 'yaml', 'yml'].includes(extension)
}

function isDataMimeType(mimeType: string) {
  return [
    'application/json',
    'application/jsonl',
    'application/x-ndjson',
    'application/xml',
    'text/csv',
    'text/tab-separated-values',
    'text/xml',
    'text/yaml',
  ].includes(mimeType)
}

function isDocumentExtension(extension: string) {
  return ['conf', 'ini', 'log', 'md', 'mdx', 'rst', 'text', 'txt'].includes(extension)
}

function getPrimaryModifierLabel() {
  return isMacLikePlatform() ? '⌘' : 'Ctrl'
}

function isPrimaryModifierPressed(event: KeyboardEvent) {
  return isMacLikePlatform() ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
}

function isMacLikePlatform() {
  if (typeof navigator === 'undefined') return false
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform)
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
    ref="formRef"
    :class="formClass"
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
          {{ t('chat.composer.inputLabel') }}
        </FieldLabel>

        <InputGroup :class="inputGroupClass">
          <InputGroupAddon
            v-if="uploadItems.length || stagedFiles.length || attachmentWarning || uploadPending || attachmentCount"
            align="block-start"
            class="flex-col gap-2 border-b"
          >
            <ComposerAttachmentPreviewList
              :staged-files="stagedFiles"
              :upload-items="uploadItems"
              :compact="compactAttachments"
              @remove-attachment="emit('removeAttachment', $event)"
              @remove-upload-item="emit('removeUploadItem', $event)"
            />

            <div
              v-if="showAttachmentStatus"
              class="flex w-full flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"
            >
              <span :class="attachmentStatusClass">
                {{ attachmentStatusText }}
              </span>
              <span v-if="uploadPending">{{ t('chat.composer.uploadingAttachments') }}</span>
            </div>
          </InputGroupAddon>

          <div class="relative w-full min-w-0">
            <InputGroupTextarea
              id="chat-composer"
              v-model="textareaValue"
              rows="3"
              :placeholder="composerPlaceholder"
              :class="textareaClass"
              :disabled="disabled && !running"
              @keydown="handleKeydown"
              @paste="emit('paste', $event)"
              @compositionstart="handleCompositionStart"
              @compositionend="handleCompositionEnd"
            />

            <div
              v-if="showAttachmentPresetPanel"
              class="pointer-events-none absolute inset-x-2 top-2 flex max-h-[calc(100%-0.75rem)] flex-col gap-1 overflow-hidden"
              :aria-label="t('chat.composer.attachmentPresetsAria')"
            >
              <div
                v-for="(preset, presetIndex) in attachmentPresets"
                :key="preset.prompt"
                class="flex min-h-6 w-full items-center justify-between gap-1.5 rounded-md bg-transparent px-2 py-0.5 text-left text-[11px] text-muted-foreground/50 @min-[28rem]/chat-composer:min-h-7 @min-[28rem]/chat-composer:gap-2 @min-[28rem]/chat-composer:px-2.5 @min-[28rem]/chat-composer:text-xs"
              >
                <span class="min-w-0 truncate">{{ preset.prompt }}</span>
                <KbdGroup class="shrink-0 opacity-60">
                  <Kbd class="h-4 min-w-4 bg-muted/50 px-1 text-[10px] text-muted-foreground/70 @min-[28rem]/chat-composer:h-5 @min-[28rem]/chat-composer:min-w-5 @min-[28rem]/chat-composer:text-xs">
                    {{ modifierKeyLabel }}
                  </Kbd>
                  <Kbd class="h-4 min-w-4 bg-muted/50 px-1 text-[10px] text-muted-foreground/70 @min-[28rem]/chat-composer:h-5 @min-[28rem]/chat-composer:min-w-5 @min-[28rem]/chat-composer:text-xs">
                    {{ presetIndex + 1 }}
                  </Kbd>
                </KbdGroup>
              </div>
            </div>
          </div>

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
                :aria-label="t('chat.composer.clearReplyAria')"
                @click="emit('clearReply')"
              >
                <XIcon data-icon="inline-start" />
              </InputGroupButton>
            </div>

            <div class="flex w-full min-w-0 items-center justify-between gap-2">
              <div class="flex min-w-0 flex-1 items-center gap-1.5">
                <InputGroupButton
                  size="icon-sm"
                  :aria-label="t('chat.composer.addAttachmentAria')"
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
                      :aria-label="t('chat.composer.switchModelAria', { model: selectedModelLabel })"
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
                    <DropdownMenuLabel>{{ t('chat.composer.switchModel') }}</DropdownMenuLabel>
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
                      :aria-label="t('chat.composer.agentPermissionAria', { description: selectedToolProfileDescription })"
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
                    <DropdownMenuLabel>{{ t('chat.composer.agentPermission') }}</DropdownMenuLabel>
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

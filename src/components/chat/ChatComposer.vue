<script setup lang="ts">
import {
  ArrowUpIcon,
  BookOpenIcon,
  PlugIcon,
  PlusIcon,
  ReplyIcon,
  ShieldCheckIcon,
  SquareIcon,
  XIcon,
} from '@lucide/vue'
import type { ToolProfile } from '@shared/types/chat'
import type { LocalSkillSummary } from '@shared/types/skill'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { BridgeMcpDiscoveredToolSummary } from '@/bridge/app'
import ChatContextUsageIndicator from '@/components/chat/ChatContextUsageIndicator.vue'
import ChatSlashMenu from '@/components/chat/ChatSlashMenu.vue'
import ProviderBrandIcon from '@/components/settings/provider-settings/ProviderBrandIcon.vue'
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
import { presetsForAttachment } from './attachment-presets'
import {
  type ChatCapabilityMention,
  type ChatCapabilityReference,
  type ChatSlashMenuItem,
  chatSlashItemDomId,
  chatSlashItemMatches,
  findChatSlashQuery,
  parseChatCapabilityMentions,
  replaceChatSlashQuery,
  serializeChatCapabilityMentions,
} from './chat-slash-menu'
import ComposerAttachmentPreviewList from './parts/ComposerAttachmentPreviewList.vue'
import ComposerCapabilityMentionList from './parts/ComposerCapabilityMentionList.vue'

const { t } = useI18n()

const props = defineProps<{
  modelValue: string
  skills?: LocalSkillSummary[]
  skillsLoading?: boolean
  skillsUnavailable?: boolean
  mcpTools?: BridgeMcpDiscoveredToolSummary[]
  mcpLoading?: boolean
  mcpUnavailable?: boolean
  stagedFiles: StagedFileInfo[]
  stagedUploadItems?: StagedUploadItem[]
  modelOptions: ProviderModelOption[]
  selectedModelKey: string
  selectedModelLabel: string
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
const inputFocused = ref(false)
const cursorPosition = ref(0)
const activeSlashItemIndex = ref(0)
const dismissedSlashSignature = ref('')
const slashMenuMaxHeight = ref(440)
const availableSkills = computed(() =>
  (props.skills ?? []).filter((skill) => skill.enabled && skill.status === 'available')
)
const availableMcpTools = computed(() =>
  (props.mcpTools ?? []).filter((tool) => tool.enabled && tool.profiles.includes(props.toolProfile))
)
const parsedCapabilityDraft = computed(() =>
  parseChatCapabilityMentions(
    props.modelValue,
    availableSkills.value.map((skill) => skill.id),
    availableMcpTools.value.map((tool) => tool.name)
  )
)
const selectedCapabilityMentions = computed<ChatCapabilityMention[]>(() => {
  const skillsById = new Map(availableSkills.value.map((skill) => [skill.id, skill]))
  const mcpToolsByName = new Map(availableMcpTools.value.map((tool) => [tool.name, tool]))

  return parsedCapabilityDraft.value.references.flatMap((reference) => {
    if (reference.kind === 'skill') {
      const skill = skillsById.get(reference.id)
      return skill
        ? [{ ...reference, key: `skill:${reference.id}`, label: skill.name || skill.id }]
        : []
    }

    const tool = mcpToolsByName.get(reference.id)
    return tool
      ? [{ ...reference, key: `mcp:${reference.id}`, label: tool.label || tool.name }]
      : []
  })
})
const textareaValue = computed({
  get: () => parsedCapabilityDraft.value.text,
  set: (value) =>
    updateDraftWithCapabilityMentions(parsedCapabilityDraft.value.references, String(value)),
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
    '@container/chat-composer relative w-full rounded-xl transition-colors',
    dragging.value && 'bg-accent/40'
  )
)
const textareaClass = computed(() =>
  cn(
    'max-h-48 w-auto min-w-40 flex-1 overflow-y-auto overscroll-contain px-0 pt-0 text-base leading-6 md:text-sm md:leading-5',
    props.compactAttachments ? 'min-h-16' : 'min-h-24'
  )
)
const composerPlaceholder = computed(() => {
  if (dragging.value) return t('chat.composer.uploadDragPlaceholder')
  if (selectedCapabilityMentions.value.length) return ''
  if (showAttachmentPresetPanel.value) return ''
  return 'Ask OmniPaw...'
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
const selectedProvider = computed(() => ({
  id: selectedModelOption.value?.providerId,
  name: selectedModelOption.value?.providerName,
  type: selectedModelOption.value?.providerType ?? selectedModelOption.value?.providerApi,
  baseUrl: selectedModelOption.value?.baseUrl,
}))
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
  return presetsForAttachment(attachment)
    .slice(0, 2)
    .map((entry) => ({ label: t(entry.labelKey), prompt: t(entry.promptKey) }))
})
const showAttachmentPresetPanel = computed(
  () =>
    props.showAttachmentPresets === true &&
    !dragging.value &&
    !props.running &&
    !props.attachmentWarning &&
    selectedCapabilityMentions.value.length === 0 &&
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
const slashQuery = computed(() => findChatSlashQuery(textareaValue.value, cursorPosition.value))
const slashSkillItems = computed<ChatSlashMenuItem[]>(() =>
  availableSkills.value
    .map((skill) => ({
      id: `skill:${skill.id}`,
      kind: 'skill',
      label: skill.name || skill.id,
      description: skill.description || t('chat.composer.slashMenu.skillDescriptionFallback'),
      token: `/${skill.id}`,
      keywords: `${skill.id} ${skill.name} ${skill.description}`,
      icon: BookOpenIcon,
      reference: { kind: 'skill', id: skill.id },
    }))
    .sort((left, right) => left.label.localeCompare(right.label))
)
const slashMcpItems = computed<ChatSlashMenuItem[]>(() =>
  availableMcpTools.value
    .map((tool) => ({
      id: `mcp:${tool.name}`,
      kind: 'mcp',
      label: tool.label || tool.name,
      description: tool.description || t('chat.composer.slashMenu.mcpDescriptionFallback'),
      token: `/${tool.name}`,
      keywords: `${tool.name} ${tool.label ?? ''} ${tool.description} ${tool.serverName}`,
      icon: PlugIcon,
      reference: { kind: 'mcp', id: tool.name },
    }))
    .sort((left, right) => left.label.localeCompare(right.label))
)
const filteredSlashItems = computed(() => {
  const query = slashQuery.value?.query ?? ''
  return [...slashSkillItems.value, ...slashMcpItems.value].filter((item) =>
    chatSlashItemMatches(item, query)
  )
})
const slashMenuOpen = computed(
  () =>
    Boolean(slashQuery.value) &&
    inputFocused.value &&
    !compositionActive.value &&
    !dragging.value &&
    !(props.disabled && !props.running) &&
    slashQuery.value?.signature !== dismissedSlashSignature.value
)
const activeSlashItem = computed(
  () => filteredSlashItems.value[activeSlashItemIndex.value] ?? filteredSlashItems.value[0]
)
const activeSlashItemDomId = computed(() =>
  slashMenuOpen.value && activeSlashItem.value
    ? chatSlashItemDomId(activeSlashItem.value.id)
    : undefined
)

watch(
  () =>
    `${slashQuery.value?.signature ?? ''}:${filteredSlashItems.value.map((item) => item.id).join('|')}`,
  () => {
    activeSlashItemIndex.value = 0
  }
)

watch(slashMenuOpen, (open) => {
  if (open) void nextTick(updateSlashMenuMaxHeight)
})

function focus(options: FocusOptions = { preventScroll: true }) {
  const textarea = getTextarea()
  if (!textarea || textarea.disabled) {
    return
  }

  textarea.focus(options)
  textarea.setSelectionRange(textarea.value.length, textarea.value.length)
  cursorPosition.value = textarea.value.length
}

function getTextarea(): HTMLTextAreaElement | null {
  return formRef.value?.querySelector<HTMLTextAreaElement>('textarea') ?? null
}

function focusAt(position: number) {
  void nextTick(() => {
    const textarea = getTextarea()
    if (!textarea || textarea.disabled) return
    textarea.focus({ preventScroll: true })
    textarea.setSelectionRange(position, position)
    cursorPosition.value = position
  })
}

function updateSlashMenuMaxHeight() {
  const formTop = formRef.value?.getBoundingClientRect().top
  if (typeof formTop !== 'number') return
  slashMenuMaxHeight.value = Math.max(160, Math.min(440, formTop - 56))
}

function scheduleFocus() {
  if (!props.autoFocus) {
    return
  }

  void nextTick(() => {
    window.requestAnimationFrame(() => focus())
  })
}

onMounted(() => {
  scheduleFocus()
  window.addEventListener('resize', updateSlashMenuMaxHeight)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateSlashMenuMaxHeight)
})

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
  if (handleSlashMenuKeydown(event)) return
  if (handleCapabilityMentionBackspace(event)) return
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

function handleCapabilityMentionBackspace(event: KeyboardEvent): boolean {
  if (
    event.key !== 'Backspace' ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    cursorPosition.value !== 0 ||
    !selectedCapabilityMentions.value.length
  ) {
    return false
  }

  event.preventDefault()
  const lastMention = selectedCapabilityMentions.value.at(-1)
  if (lastMention) removeCapabilityMention(lastMention)
  return true
}

function handleSlashMenuKeydown(event: KeyboardEvent): boolean {
  if (!slashMenuOpen.value || isCompositionKeyboardEvent(event)) return false

  if (event.key === 'Escape') {
    event.preventDefault()
    dismissedSlashSignature.value = slashQuery.value?.signature ?? ''
    return true
  }

  if (!filteredSlashItems.value.length) return false

  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    const direction = event.key === 'ArrowDown' ? 1 : -1
    activeSlashItemIndex.value =
      (activeSlashItemIndex.value + direction + filteredSlashItems.value.length) %
      filteredSlashItems.value.length
    return true
  }

  if (event.key === 'Enter' || event.key === 'Tab') {
    event.preventDefault()
    const item = activeSlashItem.value
    if (item) selectSlashItem(item)
    return true
  }

  return false
}

function isCompositionKeyboardEvent(event: KeyboardEvent): boolean {
  const recentCompositionEnd =
    typeof lastCompositionEndAt.value === 'number' &&
    event.timeStamp >= lastCompositionEndAt.value &&
    event.timeStamp - lastCompositionEndAt.value < 100
  return (
    compositionActive.value || event.isComposing || event.keyCode === 229 || recentCompositionEnd
  )
}

function handleTextareaSelection(event: Event) {
  const textarea = event.target as HTMLTextAreaElement | null
  if (!textarea) return
  cursorPosition.value = textarea.selectionStart ?? textarea.value.length
}

function handleTextareaFocus(event: FocusEvent) {
  inputFocused.value = true
  handleTextareaSelection(event)
}

function handleTextareaBlur() {
  inputFocused.value = false
}

function selectSlashItem(item: ChatSlashMenuItem) {
  const query = slashQuery.value
  if (!query) return

  const replacement = replaceChatSlashQuery(textareaValue.value, query, '')
  updateDraftWithCapabilityMentions(
    [...parsedCapabilityDraft.value.references, item.reference],
    replacement.value
  )
  dismissedSlashSignature.value = ''
  focusAt(replacement.cursorPosition)
}

function updateDraftWithCapabilityMentions(
  references: Iterable<ChatCapabilityReference>,
  text: string
) {
  emit('update:modelValue', serializeChatCapabilityMentions(references, text))
}

function removeCapabilityMention(mention: ChatCapabilityMention) {
  updateDraftWithCapabilityMentions(
    parsedCapabilityDraft.value.references.filter(
      (reference) => reference.kind !== mention.kind || reference.id !== mention.id
    ),
    textareaValue.value
  )
  focusAt(Math.min(cursorPosition.value, textareaValue.value.length))
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

        <ChatSlashMenu
          v-if="slashMenuOpen"
          :items="filteredSlashItems"
          :active-item-id="activeSlashItem?.id"
          :skills-loading="skillsLoading"
          :skills-unavailable="skillsUnavailable"
          :mcp-loading="mcpLoading"
          :mcp-unavailable="mcpUnavailable"
          :max-height="slashMenuMaxHeight"
          @select="selectSlashItem"
        />

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

          <div class="relative flex w-full min-w-0 flex-wrap items-start gap-1.5 px-2.5 pt-2">
            <ComposerCapabilityMentionList
              v-if="selectedCapabilityMentions.length"
              :mentions="selectedCapabilityMentions"
              :disabled="disabled && !running"
              @remove="removeCapabilityMention"
            />

            <InputGroupTextarea
              id="chat-composer"
              v-model="textareaValue"
              rows="3"
              :placeholder="composerPlaceholder"
              :class="textareaClass"
              :disabled="disabled && !running"
              role="combobox"
              aria-autocomplete="list"
              aria-controls="chat-slash-menu"
              :aria-expanded="slashMenuOpen"
              :aria-activedescendant="activeSlashItemDomId"
              @keydown="handleKeydown"
              @input="handleTextareaSelection"
              @click="handleTextareaSelection"
              @select="handleTextareaSelection"
              @focus="handleTextareaFocus"
              @blur="handleTextareaBlur"
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
                      <ProviderBrandIcon
                        :provider="selectedProvider"
                        data-icon="inline-start"
                        class="size-4!"
                      />
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

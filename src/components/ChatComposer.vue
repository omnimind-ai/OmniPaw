<script setup lang="ts">
import { ArrowUpIcon, FileIcon, ImageIcon, PlusIcon, SparklesIcon, XIcon } from 'lucide-vue-next'
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
import type { StagedFileInfo } from '@/composables/useMediaHandling'
import type { ProviderModelOption } from '@/stores/provider'

const props = defineProps<{
  modelValue: string
  stagedFiles: StagedFileInfo[]
  modelOptions: ProviderModelOption[]
  selectedModelKey: string
  selectedModelLabel: string
  selectedModelMeta?: string
  disabled?: boolean
  canSend?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'selectModel': [key: string]
  'addAttachment': []
  'removeAttachment': [index: number]
  'paste': [event: ClipboardEvent]
  'submit': []
}>()

const compositionActive = ref(false)
const lastCompositionEndAt = ref<number | null>(null)
const textareaValue = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', String(value)),
})

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
    typeof lastCompositionEndAt.value === 'number'
    && event.timeStamp >= lastCompositionEndAt.value
    && event.timeStamp - lastCompositionEndAt.value < 100

  if (compositionActive.value || event.isComposing || event.keyCode === 229 || recentCompositionEnd) {
    return
  }

  event.preventDefault()
  emit('submit')
}

function attachmentIcon(file: StagedFileInfo) {
  return file.type === 'image' ? ImageIcon : FileIcon
}

function attachmentLabel(file: StagedFileInfo) {
  if (file.filename) return file.filename
  if (file.type === 'image') return '图片'
  if (file.type === 'video') return '视频'
  if (file.type === 'record') return '音频'
  return '附件'
}
</script>

<template>
  <form
    class="w-full"
    @submit.prevent="emit('submit')"
  >
    <FieldGroup>
      <Field>
        <FieldLabel
          for="chat-composer"
          class="sr-only"
        >
          输入消息
        </FieldLabel>

        <InputGroup class="min-h-36 shadow-sm">
          <InputGroupTextarea
            id="chat-composer"
            v-model="textareaValue"
            rows="3"
            placeholder="Ask OmniClaw..."
            class="min-h-24"
            :disabled="disabled"
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
              v-if="stagedFiles.length"
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

            <div class="flex w-full items-center justify-between gap-2">
              <div class="flex min-w-0 items-center gap-2">
                <InputGroupButton
                  size="icon-sm"
                  aria-label="添加附件"
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
                  aria-label="发送"
                  :disabled="!canSend"
                  @click="emit('submit')"
                >
                  <ArrowUpIcon data-icon="inline-start" />
                </InputGroupButton>
              </div>
            </div>
          </InputGroupAddon>
        </InputGroup>
      </Field>
    </FieldGroup>
  </form>
</template>

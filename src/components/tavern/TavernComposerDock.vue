<script setup lang="ts">
import type { ToolProfile } from '@shared/types/chat'
import { BookOpenIcon, SettingsIcon, UserRoundIcon } from 'lucide-vue-next'
import { computed } from 'vue'

import ChatComposer from '@/components/chat/ChatComposer.vue'
import { useChatWorkspaceContext } from '@/components/chat/chat-workspace-context'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { InputGroupButton } from '@/components/ui/input-group'
import { cn } from '@/lib/utils'

const minimalToolProfileOptions: Array<{
  value: ToolProfile
  label: string
  description: string
}> = [
  {
    value: 'minimal',
    label: '最小',
    description: '酒馆模式固定使用低噪声上下文。',
  },
]

const {
  selectedModel,
  providersLoading,
  openSettings,
  openTavernSettings,
  draft,
  stagedFiles,
  stagedUploadItems,
  enabledModelOptions,
  selectedModelKey,
  selectedModelLabel,
  selectedModelMeta,
  tavernCharacters,
  tavernLorebooks,
  tavernSelectedCharacterId,
  tavernSelectedLorebookIds,
  tavernSelectedCharacterLabel,
  tavernSelectedLorebookLabel,
  tavernCanSend,
  currentSessionRunning,
  uploadPending,
  attachmentWarning,
  sending,
  openFilePicker,
  removeStagedFile,
  removeUploadAt,
  handleFilesDropped,
  clearReply,
  handleModelChange,
  handleTavernCharacterChange,
  handleTavernLorebookToggle,
  handlePaste,
  handleTavernSubmit,
  handleStop,
  fileInput,
  handleFileInputChange,
} = useChatWorkspaceContext()

const selectedLorebookSet = computed(() => new Set(tavernSelectedLorebookIds.value))
</script>

<template>
  <div class="flex w-full flex-1 flex-col items-center justify-center gap-8 px-6 pb-6 md:px-10 lg:px-16">
    <h1 class="text-center text-3xl font-semibold tracking-normal md:text-4xl">
      今天想让小万变身为什么角色
    </h1>

    <div class="w-full max-w-4xl">
      <div
        v-if="!selectedModel && !providersLoading"
        class="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground"
      >
        <span>未配置可用模型</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          @click="openSettings"
        >
          打开设置
        </Button>
      </div>

      <div
        v-if="!tavernCharacters.length"
        class="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground"
      >
        <span>未配置可用角色卡</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          @click="openTavernSettings"
        >
          <SettingsIcon data-icon="inline-start" />
          打开酒馆设置
        </Button>
      </div>

      <ChatComposer
        v-model="draft"
        :staged-files="stagedFiles"
        :staged-upload-items="stagedUploadItems"
        :model-options="enabledModelOptions"
        :selected-model-key="selectedModelKey"
        :selected-model-label="selectedModelLabel"
        :selected-model-meta="selectedModelMeta"
        tool-profile="minimal"
        :tool-profile-options="minimalToolProfileOptions"
        :show-tool-profile="false"
        :reply-preview="''"
        :running="currentSessionRunning"
        :upload-pending="uploadPending"
        :attachment-warning="attachmentWarning"
        :disabled="sending || currentSessionRunning || uploadPending"
        :can-send="tavernCanSend"
        :can-stop="currentSessionRunning"
        @add-attachment="openFilePicker"
        @remove-attachment="removeStagedFile"
        @remove-upload-item="removeUploadAt"
        @files-dropped="handleFilesDropped"
        @clear-reply="clearReply"
        @select-model="handleModelChange"
        @paste="handlePaste"
        @submit="handleTavernSubmit"
        @stop="handleStop"
      >
        <template #controls>
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <InputGroupButton
                class="max-w-9 justify-start px-1.5 @min-[34rem]/chat-composer:max-w-36 @min-[44rem]/chat-composer:max-w-44"
                :disabled="!tavernCharacters.length"
                :aria-label="`角色卡：${tavernSelectedCharacterLabel}`"
              >
                <UserRoundIcon data-icon="inline-start" />
                <span class="hidden truncate @min-[34rem]/chat-composer:inline">
                  {{ tavernSelectedCharacterLabel }}
                </span>
              </InputGroupButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              class="w-80"
            >
              <DropdownMenuLabel>角色卡</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup
                :model-value="tavernSelectedCharacterId"
                @update:model-value="handleTavernCharacterChange"
              >
                <DropdownMenuRadioItem
                  v-for="character in tavernCharacters"
                  :key="character.id"
                  :value="character.id"
                  class="items-start"
                >
                  <div class="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span class="truncate">{{ character.name }}</span>
                    <span
                      v-if="character.description"
                      class="line-clamp-2 text-xs text-muted-foreground"
                    >
                      {{ character.description }}
                    </span>
                  </div>
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <InputGroupButton
                class="max-w-9 justify-start px-1.5 @min-[34rem]/chat-composer:max-w-36 @min-[44rem]/chat-composer:max-w-44"
                :disabled="!tavernLorebooks.length"
                :aria-label="`世界书：${tavernSelectedLorebookLabel}`"
              >
                <BookOpenIcon data-icon="inline-start" />
                <span
                  :class="cn(
                    'hidden truncate @min-[34rem]/chat-composer:inline',
                    !tavernSelectedLorebookIds.length && 'text-muted-foreground',
                  )"
                >
                  {{ tavernSelectedLorebookLabel }}
                </span>
              </InputGroupButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              class="w-80"
            >
              <DropdownMenuLabel>世界书</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                v-for="lorebook in tavernLorebooks"
                :key="lorebook.id"
                :checked="selectedLorebookSet.has(lorebook.id)"
                class="items-start"
                @select.prevent
                @update:checked="handleTavernLorebookToggle(lorebook.id, $event)"
              >
                <div class="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span class="truncate">{{ lorebook.name }}</span>
                  <span class="text-xs text-muted-foreground">
                    {{ lorebook.entries.length }} 个条目
                  </span>
                </div>
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </template>
      </ChatComposer>
    </div>

    <input
      ref="fileInput"
      class="sr-only"
      type="file"
      multiple
      @change="handleFileInputChange"
    >
  </div>
</template>

<script setup lang="ts">
import type { ToolProfile } from '@shared/types/chat'
import {
  BookOpenIcon,
  IdCardIcon,
  ScrollTextIcon,
  SettingsIcon,
  UserRoundIcon,
} from 'lucide-vue-next'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

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

const { t } = useI18n()

const minimalToolProfileOptions = computed<
  Array<{ value: ToolProfile; label: string; description: string }>
>(() => [
  {
    value: 'minimal',
    label: t('chat.tavernDock.minimalProfile.label'),
    description: t('chat.tavernDock.minimalProfile.description'),
  },
])

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
  tavernPromptPresets,
  tavernUserProfiles,
  tavernSelectedCharacterId,
  tavernSelectedLorebookIds,
  tavernSelectedPromptPresetId,
  tavernSelectedUserProfileId,
  tavernSelectedCharacterLabel,
  tavernSelectedLorebookLabel,
  tavernSelectedPromptPresetLabel,
  tavernSelectedUserProfileLabel,
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
  handleTavernPromptPresetChange,
  handleTavernUserProfileChange,
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
      {{ t('chat.tavernDock.welcomeTitle') }}
    </h1>

    <div class="w-full max-w-4xl">
      <div
        v-if="!selectedModel && !providersLoading"
        class="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground"
      >
        <span>{{ t('chat.noModel.message') }}</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          @click="openSettings"
        >
          {{ t('chat.noModel.openSettings') }}
        </Button>
      </div>

      <div
        v-if="!tavernCharacters.length"
        class="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground"
      >
        <span>{{ t('chat.tavernDock.noCharacter.message') }}</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          @click="openTavernSettings"
        >
          <SettingsIcon data-icon="inline-start" />
          {{ t('chat.tavernDock.noCharacter.openSettings') }}
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
                :aria-label="t('chat.tavernDock.characterAria', { name: tavernSelectedCharacterLabel })"
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
              <DropdownMenuLabel>{{ t('chat.tavernDock.character') }}</DropdownMenuLabel>
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
                :aria-label="t('chat.tavernDock.lorebookAria', { name: tavernSelectedLorebookLabel })"
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
              <DropdownMenuLabel>{{ t('chat.tavernDock.lorebook') }}</DropdownMenuLabel>
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
                    {{ t('chat.tavernDock.entriesCount', { count: lorebook.entries.length }) }}
                  </span>
                </div>
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <InputGroupButton
                class="max-w-9 justify-start px-1.5 @min-[34rem]/chat-composer:max-w-36 @min-[44rem]/chat-composer:max-w-44"
                :disabled="!tavernPromptPresets.length"
                :aria-label="t('chat.tavernDock.presetAria', { name: tavernSelectedPromptPresetLabel })"
              >
                <ScrollTextIcon data-icon="inline-start" />
                <span class="hidden truncate @min-[34rem]/chat-composer:inline">
                  {{ tavernSelectedPromptPresetLabel }}
                </span>
              </InputGroupButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              class="w-80"
            >
              <DropdownMenuLabel>Prompt preset</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup
                :model-value="tavernSelectedPromptPresetId"
                @update:model-value="handleTavernPromptPresetChange"
              >
                <DropdownMenuRadioItem value="">
                  {{ t('chat.tavernDock.noPreset') }}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem
                  v-for="preset in tavernPromptPresets"
                  :key="preset.id"
                  :value="preset.id"
                  class="items-start"
                >
                  <div class="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span class="truncate">{{ preset.name }}</span>
                    <span class="text-xs text-muted-foreground">
                      {{ t('chat.tavernDock.slotsCount', { count: preset.slots.length }) }}
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
                :disabled="!tavernUserProfiles.length"
                :aria-label="t('chat.tavernDock.userProfileAria', { name: tavernSelectedUserProfileLabel })"
              >
                <IdCardIcon data-icon="inline-start" />
                <span class="hidden truncate @min-[34rem]/chat-composer:inline">
                  {{ tavernSelectedUserProfileLabel }}
                </span>
              </InputGroupButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              class="w-80"
            >
              <DropdownMenuLabel>{{ t('chat.tavernDock.userProfile') }}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup
                :model-value="tavernSelectedUserProfileId"
                @update:model-value="handleTavernUserProfileChange"
              >
                <DropdownMenuRadioItem value="">
                  {{ t('chat.tavernDock.noUserProfile') }}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem
                  v-for="profile in tavernUserProfiles"
                  :key="profile.id"
                  :value="profile.id"
                  class="items-start"
                >
                  <div class="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span class="truncate">{{ profile.name }}</span>
                    <span class="line-clamp-2 text-xs text-muted-foreground">
                      {{ t('chat.tavernDock.userProfileSnapshotNote') }}
                    </span>
                  </div>
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
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

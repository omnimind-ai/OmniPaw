<script setup lang="ts">
import { DramaIcon, EyeIcon } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { useChatWorkspaceContext } from '@/components/chat/chat-workspace-context'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const {
  activeTavernMetadata,
  activeTavernCharacter,
  activeTavernLorebookNames,
  activeTavernPromptPreset,
  activeTavernUserProfile,
  activeTavernGreetingOptions,
  activeTavernCanReplaceGreeting,
  tavernPromptPresets,
  tavernUserProfiles,
  tavernPromptPreview,
  tavernPreviewLoading,
  handleTavernGreetingChange,
  handleActiveTavernPromptPresetChange,
  handleActiveTavernUserProfileChange,
  handleActiveTavernScanDepthChange,
  handleActiveTavernLoreBudgetChange,
  handleTavernPromptPreview,
  clearTavernPromptPreview,
} = useChatWorkspaceContext()

const previewOpen = ref(false)
const scanDepthOptions = [0, 4, 8, 12, 20]
const loreBudgetOptions = [0, 400, 800, 1200, 2000]
const selectedGreeting = computed(() =>
  String(activeTavernMetadata.value?.selectedGreetingIndex ?? 0)
)
const selectedPromptPreset = computed(() => activeTavernMetadata.value?.promptPresetId ?? '')
const selectedUserProfile = computed(() => activeTavernMetadata.value?.userProfileId ?? '')
const selectedScanDepth = computed(() =>
  String(activeTavernMetadata.value?.loreSettings?.scanDepth ?? 12)
)
const selectedLoreBudget = computed(() =>
  String(activeTavernMetadata.value?.loreSettings?.loreBudget ?? 800)
)
const characterName = computed(
  () => activeTavernCharacter.value?.name || activeTavernMetadata.value?.characterName || '角色缺失'
)
const lorebookLabel = computed(() => {
  if (!activeTavernLorebookNames.value.length) return '未绑定世界书'
  return activeTavernLorebookNames.value.join(' / ')
})
const promptPresetLabel = computed(() => activeTavernPromptPreset.value?.name || '无 preset')
const userProfileLabel = computed(() => activeTavernUserProfile.value?.name || '无酒馆用户')

async function openPreview() {
  await handleTavernPromptPreview()
  previewOpen.value = true
}

function handlePreviewOpen(value: boolean) {
  previewOpen.value = value
  if (!value) clearTavernPromptPreview()
}
</script>

<template>
  <div
    v-if="activeTavernMetadata?.enabled"
    class="flex min-h-11 flex-wrap items-center justify-between gap-3 border-b px-4 py-2 text-sm"
  >
    <div class="flex min-w-0 flex-wrap items-center gap-2">
      <DramaIcon class="shrink-0" />
      <span class="truncate font-medium">{{ characterName }}</span>
      <Badge variant="outline">{{ lorebookLabel }}</Badge>
      <Badge variant="secondary">{{ promptPresetLabel }}</Badge>
      <Badge variant="secondary">{{ userProfileLabel }}</Badge>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <Select
        :model-value="selectedPromptPreset"
        @update:model-value="handleActiveTavernPromptPresetChange"
      >
        <SelectTrigger class="w-40">
          <SelectValue placeholder="Prompt preset" />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectGroup>
            <SelectItem value="">
              无 preset
            </SelectItem>
            <SelectItem
              v-for="preset in tavernPromptPresets"
              :key="preset.id"
              :value="preset.id"
            >
              {{ preset.name }}
            </SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>

      <Select
        :model-value="selectedUserProfile"
        @update:model-value="handleActiveTavernUserProfileChange"
      >
        <SelectTrigger class="w-40">
          <SelectValue placeholder="酒馆用户" />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectGroup>
            <SelectItem value="">
              无酒馆用户
            </SelectItem>
            <SelectItem
              v-for="profile in tavernUserProfiles"
              :key="profile.id"
              :value="profile.id"
            >
              {{ profile.name }}
            </SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>

      <Select
        :model-value="selectedScanDepth"
        @update:model-value="handleActiveTavernScanDepthChange"
      >
        <SelectTrigger class="w-28">
          <SelectValue placeholder="Scan" />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectGroup>
            <SelectItem
              v-for="depth in scanDepthOptions"
              :key="depth"
              :value="String(depth)"
            >
              Scan {{ depth }}
            </SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>

      <Select
        :model-value="selectedLoreBudget"
        @update:model-value="handleActiveTavernLoreBudgetChange"
      >
        <SelectTrigger class="w-32">
          <SelectValue placeholder="Lore" />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectGroup>
            <SelectItem
              v-for="budget in loreBudgetOptions"
              :key="budget"
              :value="String(budget)"
            >
              Lore {{ budget }}
            </SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>

      <Select
        v-if="activeTavernCanReplaceGreeting && activeTavernGreetingOptions.length > 1"
        :model-value="selectedGreeting"
        @update:model-value="handleTavernGreetingChange"
      >
        <SelectTrigger class="w-36">
          <SelectValue placeholder="开场白" />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectGroup>
            <SelectItem
              v-for="option in activeTavernGreetingOptions"
              :key="option.index"
              :value="String(option.index)"
            >
              {{ option.label }}
            </SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>

      <Button
        type="button"
        variant="outline"
        size="sm"
        :disabled="tavernPreviewLoading"
        @click="openPreview"
      >
        <EyeIcon data-icon="inline-start" />
        Preview
      </Button>
    </div>

    <Dialog
      :open="previewOpen"
      @update:open="handlePreviewOpen"
    >
      <DialogContent class="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Prompt preview</DialogTitle>
        </DialogHeader>
        <ScrollArea class="max-h-[70vh] pr-4">
          <div class="flex flex-col gap-4">
            <section
              v-for="section in tavernPromptPreview?.sections ?? []"
              :key="section.id"
              class="rounded-md border p-3"
            >
              <div class="mb-2 flex flex-wrap items-center gap-2">
                <Badge variant="outline">{{ section.kind }}</Badge>
                <span class="font-medium">{{ section.title }}</span>
                <span class="text-xs text-muted-foreground">
                  {{ section.estimatedTokens }} tokens
                </span>
              </div>
              <pre class="whitespace-pre-wrap break-words text-sm">{{ section.text }}</pre>
            </section>
            <p
              v-if="!tavernPromptPreview?.sections.length"
              class="text-sm text-muted-foreground"
            >
              无 preview 内容
            </p>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  </div>
</template>

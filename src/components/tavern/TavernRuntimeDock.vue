<script setup lang="ts">
import { ChevronDownIcon, ChevronUpIcon, EyeIcon, SlidersHorizontalIcon } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { useChatWorkspaceContext } from '@/components/chat/chat-workspace-context'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
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
import { cn } from '@/lib/utils'

const {
  activeTavernMetadata,
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
const settingsOpen = ref(false)
const NO_SELECTION_VALUE = '__none__'
const scanDepthOptions = [0, 4, 8, 12, 20]
const loreBudgetOptions = [0, 400, 800, 1200, 2000]
const selectedGreeting = computed(() =>
  String(activeTavernMetadata.value?.selectedGreetingIndex ?? 0)
)
const selectedPromptPreset = computed(
  () => activeTavernMetadata.value?.promptPresetId ?? NO_SELECTION_VALUE
)
const selectedUserProfile = computed(
  () => activeTavernMetadata.value?.userProfileId ?? NO_SELECTION_VALUE
)
const selectedScanDepth = computed(() =>
  String(activeTavernMetadata.value?.loreSettings?.scanDepth ?? 12)
)
const selectedLoreBudget = computed(() =>
  String(activeTavernMetadata.value?.loreSettings?.loreBudget ?? 800)
)
const promptPresetLabel = computed(
  () =>
    tavernPromptPresets.value.find(
      (preset) => preset.id === activeTavernMetadata.value?.promptPresetId
    )?.name ?? '无预设'
)
const userProfileLabel = computed(
  () =>
    tavernUserProfiles.value.find(
      (profile) => profile.id === activeTavernMetadata.value?.userProfileId
    )?.name ?? '无酒馆用户'
)

async function openPreview() {
  await handleTavernPromptPreview()
  previewOpen.value = true
}

function handlePreviewOpen(value: boolean) {
  previewOpen.value = value
  if (!value) clearTavernPromptPreview()
}

async function handlePromptPresetSelect(value: string | number) {
  await handleActiveTavernPromptPresetChange(value === NO_SELECTION_VALUE ? '' : value)
}

async function handleUserProfileSelect(value: string | number) {
  await handleActiveTavernUserProfileChange(value === NO_SELECTION_VALUE ? '' : value)
}
</script>

<template>
  <Collapsible
    v-if="activeTavernMetadata?.enabled"
    v-model:open="settingsOpen"
    class="overflow-hidden rounded-md border bg-muted/30 text-xs"
  >
    <CollapsibleContent>
      <div class="flex flex-wrap items-center gap-1.5 border-b bg-muted/20 p-2">
        <Select
          :model-value="selectedPromptPreset"
          @update:model-value="handlePromptPresetSelect"
        >
          <SelectTrigger
            size="sm"
            class="h-6 w-36 rounded-md border-border/70 bg-background/50 text-xs [&_svg]:size-3"
          >
            <SelectValue placeholder="预设" />
          </SelectTrigger>
          <SelectContent align="start">
            <SelectGroup>
              <SelectItem :value="NO_SELECTION_VALUE">
                无预设
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
          @update:model-value="handleUserProfileSelect"
        >
          <SelectTrigger
            size="sm"
            class="h-6 w-32 rounded-md border-border/70 bg-background/50 text-xs [&_svg]:size-3"
          >
            <SelectValue placeholder="酒馆用户" />
          </SelectTrigger>
          <SelectContent align="start">
            <SelectGroup>
              <SelectItem :value="NO_SELECTION_VALUE">
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
          <SelectTrigger
            size="sm"
            class="h-6 w-auto min-w-28 rounded-md border-border/70 bg-background/50 text-xs [&_svg]:size-3"
          >
            <SelectValue placeholder="扫描深度" />
          </SelectTrigger>
          <SelectContent align="start">
            <SelectGroup>
              <SelectItem
                v-for="depth in scanDepthOptions"
                :key="depth"
                :value="String(depth)"
              >
                扫描深度 {{ depth }}
              </SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>

        <Select
          :model-value="selectedLoreBudget"
          @update:model-value="handleActiveTavernLoreBudgetChange"
        >
          <SelectTrigger
            size="sm"
            class="h-6 w-auto min-w-32 rounded-md border-border/70 bg-background/50 text-xs [&_svg]:size-3"
          >
            <SelectValue placeholder="世界书预算" />
          </SelectTrigger>
          <SelectContent align="start">
            <SelectGroup>
              <SelectItem
                v-for="budget in loreBudgetOptions"
                :key="budget"
                :value="String(budget)"
              >
                世界书预算 {{ budget }}
              </SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>

        <Select
          v-if="activeTavernCanReplaceGreeting && activeTavernGreetingOptions.length > 1"
          :model-value="selectedGreeting"
          @update:model-value="handleTavernGreetingChange"
        >
          <SelectTrigger
            size="sm"
            class="h-6 w-24 rounded-md border-border/70 bg-background/50 text-xs [&_svg]:size-3"
          >
            <SelectValue placeholder="开场白" />
          </SelectTrigger>
          <SelectContent align="start">
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
      </div>
    </CollapsibleContent>

    <div class="flex min-h-8 items-center justify-between gap-2 px-2 py-1">
      <CollapsibleTrigger as-child>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          class="min-w-0 flex-1 justify-start rounded-sm bg-transparent px-1.5 hover:bg-muted/60 aria-expanded:bg-transparent active:translate-y-0"
          :aria-label="settingsOpen ? '收起酒馆运行设置' : '展开酒馆运行设置'"
        >
          <SlidersHorizontalIcon data-icon="inline-start" />
          <span class="font-medium">运行设置</span>
          <span class="min-w-0 truncate text-muted-foreground">
            预设 {{ promptPresetLabel }} · 用户 {{ userProfileLabel }}
          </span>
          <span class="hidden shrink-0 text-muted-foreground sm:inline">
            · 扫描深度 {{ selectedScanDepth }} · 世界书预算 {{ selectedLoreBudget }}
          </span>
          <component
            :is="settingsOpen ? ChevronDownIcon : ChevronUpIcon"
            data-icon="inline-end"
            :class="cn('ml-auto shrink-0 transition-transform')"
          />
        </Button>
      </CollapsibleTrigger>

      <Button
        type="button"
        variant="outline"
        size="xs"
        class="rounded-sm border-border/70 bg-background/50 active:translate-y-0"
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
  </Collapsible>
</template>

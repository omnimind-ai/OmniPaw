<script setup lang="ts">
import { ImageIcon, MessagesSquareIcon, SlidersHorizontalIcon, Trash2Icon } from 'lucide-vue-next'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type {
  BridgeAppLanguage,
  BridgeAppTheme,
  BridgeContextAttachmentPolicy,
  BridgeDesktopSettingsConfig,
} from '@/bridge/app'
import { appBridge } from '@/bridge/app'
import SettingEntry from '@/components/settings/common/SettingEntry.vue'
import SettingsSection from '@/components/settings/common/SettingsSection.vue'
import { Button } from '@/components/ui/button'
import { FieldGroup } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { errorToText, useToast } from '@/utils/toast'

const props = defineProps<{
  draft: BridgeDesktopSettingsConfig
}>()

const { t } = useI18n()
const toast = useToast()

const language = computed({
  get: () => props.draft.app.language,
  set: (value: BridgeAppLanguage) => {
    props.draft.app.language = value
  },
})

const theme = computed({
  get: () => props.draft.app.theme,
  set: (value: BridgeAppTheme) => {
    props.draft.app.theme = value
  },
})

const minimizeToTrayOnStartup = computed({
  get: () => props.draft.app.minimizeToTrayOnStartup,
  set: (value: boolean) => {
    props.draft.app.minimizeToTrayOnStartup = value
  },
})

const compactSkillDescriptions = computed({
  get: () => props.draft.app.compactSkillDescriptions,
  set: (value: boolean) => {
    props.draft.app.compactSkillDescriptions = value
  },
})

const showReasoningContent = computed({
  get: () => props.draft.app.showReasoningContent,
  set: (value: boolean) => {
    props.draft.app.showReasoningContent = value
  },
})

const maxRecentMessages = computed({
  get: () => props.draft.app.maxRecentMessages,
  set: (value: string | number) => {
    const next = Math.max(1, Number(value) || 1)
    props.draft.app.maxRecentMessages = Math.round(next)
    props.draft.app.chatContext.recentMessages = Math.round(next)
  },
})

const chatContext = computed(() => props.draft.app.chatContext)

const inputBudgetPercent = computed({
  get: () => chatContext.value.maxInputBudgetPercent,
  set: (value: string | number) => {
    chatContext.value.maxInputBudgetPercent = clampPercent(value)
  },
})

const includeAttachments = computed({
  get: () => chatContext.value.includeAttachments,
  set: (value: BridgeContextAttachmentPolicy) => {
    chatContext.value.includeAttachments = value
  },
})

const autoCompact = computed({
  get: () => chatContext.value.autoCompact,
  set: (value: boolean) => {
    chatContext.value.autoCompact = value
  },
})

const compactThresholdPercent = computed({
  get: () => chatContext.value.compactThresholdPercent,
  set: (value: string | number) => {
    chatContext.value.compactThresholdPercent = clampPercent(value)
  },
})

const zoomFactor = computed({
  get: () => props.draft.app.zoom.factor,
  set: (value: string | number) => {
    const min = props.draft.app.zoom.min
    const max = props.draft.app.zoom.max
    const next = Number(value)
    if (!Number.isFinite(next)) return
    props.draft.app.zoom.factor = Math.min(max, Math.max(min, next))
  },
})

const background = computed(() => props.draft.app.background)
const backgroundEnabled = computed({
  get: () => background.value.enabled,
  set: (value: boolean) => {
    background.value.enabled = value && Boolean(background.value.image)
  },
})
const backgroundOpacityPercent = computed({
  get: () => Math.round(background.value.opacity * 100),
  set: (value: string | number) => {
    const next = Number(value)
    if (!Number.isFinite(next)) return
    background.value.opacity = Math.min(1, Math.max(0, Math.round(next) / 100))
  },
})
const backgroundImageLabel = computed(() => {
  const imagePath = background.value.image?.path
  if (!imagePath) return t('settings.general.background.noImage')
  return imagePath.split(/[\\/]/).pop() || imagePath
})

function clampPercent(value: string | number): number {
  const next = Number(value)
  if (!Number.isFinite(next)) return 1
  return Math.min(100, Math.max(1, Math.round(next)))
}

async function pickBackgroundImage(): Promise<void> {
  try {
    const result = await appBridge.settings?.pickBackgroundImage()
    if (!result || result.canceled || !result.image) {
      return
    }

    props.draft.app.background.image = result.image
    props.draft.app.background.enabled = true
  } catch (error) {
    toast.error(errorToText(error, t('settings.general.background.pickFailed')))
  }
}

function clearBackgroundImage(): void {
  props.draft.app.background.enabled = false
  props.draft.app.background.image = undefined
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <SettingsSection
      :title="t('settings.general.title')"
      :description="t('settings.general.description')"
      :icon="SlidersHorizontalIcon"
    >
      <FieldGroup class="gap-0">
        <SettingEntry
          control-id="settings-language"
          :title="t('settings.general.language.title')"
          :description="t('settings.general.language.description')"
        >
          <Select
            v-model="language"
            class="w-full md:w-48"
          >
            <SelectTrigger
              id="settings-language"
              class="w-full md:w-48"
            >
              <SelectValue :placeholder="t('settings.general.language.placeholder')" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="system">{{ t('settings.general.language.system') }}</SelectItem>
                <SelectItem value="zh-CN">{{ t('settings.general.language.zhCN') }}</SelectItem>
                <SelectItem value="en-US">{{ t('settings.general.language.enUS') }}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </SettingEntry>

        <SettingEntry
          control-id="settings-theme"
          :title="t('settings.general.theme.title')"
          :description="t('settings.general.theme.description')"
        >
          <Select
            v-model="theme"
            class="w-full md:w-48"
          >
            <SelectTrigger
              id="settings-theme"
              class="w-full md:w-48"
            >
              <SelectValue :placeholder="t('settings.general.theme.placeholder')" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="system">{{ t('settings.general.theme.system') }}</SelectItem>
                <SelectItem value="light">{{ t('settings.general.theme.light') }}</SelectItem>
                <SelectItem value="dark">{{ t('settings.general.theme.dark') }}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </SettingEntry>

        <SettingEntry
          control-id="settings-zoom"
          :title="t('settings.general.zoom.title')"
        >
          <template #description>
            {{ t('settings.general.zoom.description', draft.app.zoom) }}
          </template>
          <Input
            id="settings-zoom"
            v-model="zoomFactor"
            class="w-full md:w-48"
            type="number"
            step="0.05"
            :min="draft.app.zoom.min"
            :max="draft.app.zoom.max"
          />
        </SettingEntry>

        <SettingEntry
          control-id="settings-minimize-tray"
          :title="t('settings.general.minimizeToTray.title')"
          :description="t('settings.general.minimizeToTray.description')"
        >
          <Switch
            id="settings-minimize-tray"
            v-model="minimizeToTrayOnStartup"
            :aria-label="t('settings.general.minimizeToTray.title')"
          />
        </SettingEntry>

        <SettingEntry
          control-id="settings-show-reasoning"
          :title="t('settings.general.showReasoning.title')"
          :description="t('settings.general.showReasoning.description')"
        >
          <Switch
            id="settings-show-reasoning"
            v-model="showReasoningContent"
            :aria-label="t('settings.general.showReasoning.title')"
          />
        </SettingEntry>
      </FieldGroup>
    </SettingsSection>

    <SettingsSection
      :title="t('settings.general.background.title')"
      :description="t('settings.general.background.description')"
      :icon="ImageIcon"
    >
      <FieldGroup class="gap-0">
        <SettingEntry
          control-id="settings-background-image"
          :title="t('settings.general.background.image.title')"
          :description="t('settings.general.background.image.description')"
        >
          <div class="flex w-full flex-col gap-3 md:w-80">
            <div class="flex items-center gap-2">
              <Button
                id="settings-background-image"
                type="button"
                variant="outline"
                size="sm"
                @click="pickBackgroundImage"
              >
                <ImageIcon data-icon="inline-start" />
                {{ t('settings.general.background.image.choose') }}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                :disabled="!background.image"
                :aria-label="t('settings.general.background.image.clear')"
                @click="clearBackgroundImage"
              >
                <Trash2Icon data-icon />
              </Button>
            </div>
            <div class="truncate text-sm text-muted-foreground">
              {{ backgroundImageLabel }}
            </div>
            <div
              v-if="background.image"
              class="flex items-center gap-3 rounded-md border bg-muted/30 p-2"
            >
              <img
                :src="background.image.url"
                :alt="t('settings.general.background.image.previewAlt')"
                class="h-16 w-24 rounded object-cover"
                draggable="false"
              />
              <div class="min-w-0 text-xs text-muted-foreground">
                {{ t('settings.general.background.image.size', background.image) }}
              </div>
            </div>
          </div>
        </SettingEntry>

        <SettingEntry
          control-id="settings-background-enabled"
          :title="t('settings.general.background.enabled.title')"
          :description="t('settings.general.background.enabled.description')"
          :disabled="!background.image"
        >
          <Switch
            id="settings-background-enabled"
            v-model="backgroundEnabled"
            :disabled="!background.image"
            :aria-label="t('settings.general.background.enabled.title')"
          />
        </SettingEntry>

        <SettingEntry
          control-id="settings-background-opacity"
          :title="t('settings.general.background.opacity.title')"
          :description="t('settings.general.background.opacity.description')"
          :disabled="!background.image"
        >
          <div class="flex w-full items-center gap-3 md:w-80">
            <Input
              id="settings-background-opacity"
              v-model="backgroundOpacityPercent"
              class="w-full"
              type="range"
              min="0"
              max="100"
              step="1"
              :disabled="!background.image"
              :aria-valuenow="backgroundOpacityPercent"
              :aria-valuetext="`${backgroundOpacityPercent}%`"
            />
            <span class="w-12 shrink-0 text-right text-sm text-muted-foreground">
              {{ backgroundOpacityPercent }}%
            </span>
          </div>
        </SettingEntry>
      </FieldGroup>
    </SettingsSection>

    <SettingsSection
      :title="t('settings.general.chat.title')"
      :description="t('settings.general.chat.description')"
      :icon="MessagesSquareIcon"
    >
      <FieldGroup class="gap-0">
        <SettingEntry
          control-id="settings-max-recent"
          :title="t('settings.general.chat.maxRecent.title')"
          :description="t('settings.general.chat.maxRecent.description')"
        >
          <Input
            id="settings-max-recent"
            v-model="maxRecentMessages"
            class="w-full md:w-48"
            type="number"
            min="1"
            step="1"
          />
        </SettingEntry>

        <template v-if="chatContext">
          <SettingEntry
            control-id="settings-context-budget"
            :title="t('settings.general.chat.inputBudget.title')"
            :description="t('settings.general.chat.inputBudget.description')"
          >
            <Input
              id="settings-context-budget"
              v-model="inputBudgetPercent"
              class="w-full md:w-48"
              type="number"
              min="1"
              max="100"
              step="1"
            />
          </SettingEntry>

          <SettingEntry
            control-id="settings-context-attachments"
            :title="t('settings.general.chat.attachments.title')"
            :description="t('settings.general.chat.attachments.description')"
          >
            <Select
              v-model="includeAttachments"
              class="w-full md:w-48"
            >
              <SelectTrigger
                id="settings-context-attachments"
                class="w-full md:w-48"
              >
                <SelectValue :placeholder="t('settings.general.chat.attachments.placeholder')" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="current-only">
                    {{ t('settings.general.chat.attachments.currentOnly') }}
                  </SelectItem>
                  <SelectItem value="recent">
                    {{ t('settings.general.chat.attachments.recent') }}
                  </SelectItem>
                  <SelectItem value="never">
                    {{ t('settings.general.chat.attachments.never') }}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </SettingEntry>

          <SettingEntry
            control-id="settings-context-auto-compact"
            :title="t('settings.general.chat.autoCompact.title')"
            :description="t('settings.general.chat.autoCompact.description')"
          >
            <Switch
              id="settings-context-auto-compact"
              v-model="autoCompact"
              :aria-label="t('settings.general.chat.autoCompact.title')"
            />
          </SettingEntry>

          <SettingEntry
            control-id="settings-context-compact-threshold"
            :title="t('settings.general.chat.compactThreshold.title')"
            :description="t('settings.general.chat.compactThreshold.description')"
            :disabled="!autoCompact"
          >
            <Input
              id="settings-context-compact-threshold"
              v-model="compactThresholdPercent"
              class="w-full md:w-48"
              type="number"
              min="1"
              max="100"
              step="1"
              :disabled="!autoCompact"
            />
          </SettingEntry>
        </template>

        <SettingEntry
          control-id="settings-compact-skills"
          :title="t('settings.general.chat.compactSkills.title')"
          :description="t('settings.general.chat.compactSkills.description')"
        >
          <Switch
            id="settings-compact-skills"
            v-model="compactSkillDescriptions"
            :aria-label="t('settings.general.chat.compactSkills.title')"
          />
        </SettingEntry>
      </FieldGroup>
    </SettingsSection>
  </div>
</template>

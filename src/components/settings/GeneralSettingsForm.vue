<script setup lang="ts">
import { computed } from 'vue'
import type {
  BridgeAppLanguage,
  BridgeAppTheme,
  BridgeContextAttachmentPolicy,
  BridgeDesktopSettingsConfig,
} from '@/bridge/app'
import SettingEntry from '@/components/settings/common/SettingEntry.vue'
import SettingsSection from '@/components/settings/common/SettingsSection.vue'
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

const props = defineProps<{
  draft: BridgeDesktopSettingsConfig
}>()

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

function clampPercent(value: string | number): number {
  const next = Number(value)
  if (!Number.isFinite(next)) return 1
  return Math.min(100, Math.max(1, Math.round(next)))
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <SettingsSection title="常规设置">
      <FieldGroup class="gap-0">
        <SettingEntry
          control-id="settings-language"
          title="语言"
          description="切换桌面端界面语言。"
        >
          <Select
            v-model="language"
            class="w-full md:w-48"
          >
            <SelectTrigger
              id="settings-language"
              class="w-full md:w-48"
            >
              <SelectValue placeholder="选择语言" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="system">系统默认</SelectItem>
                <SelectItem value="zh-CN">中文</SelectItem>
                <SelectItem value="en-US">English</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </SettingEntry>

        <SettingEntry
          control-id="settings-theme"
          title="主题"
          description="跟随系统或固定为亮色、深色。"
        >
          <Select
            v-model="theme"
            class="w-full md:w-48"
          >
            <SelectTrigger
              id="settings-theme"
              class="w-full md:w-48"
            >
              <SelectValue placeholder="选择主题" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="system">系统默认</SelectItem>
                <SelectItem value="light">亮色</SelectItem>
                <SelectItem value="dark">深色</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </SettingEntry>

        <SettingEntry control-id="settings-zoom" title="缩放比例">
          <template #description>
            当前范围 {{ draft.app.zoom.min }} - {{ draft.app.zoom.max }}。
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
          title="关闭/最小化到托盘"
          description="关闭或最小化主窗口后保持后台可用。"
        >
          <Switch
            id="settings-minimize-tray"
            v-model="minimizeToTrayOnStartup"
            aria-label="关闭/最小化到托盘"
          />
        </SettingEntry>

        <SettingEntry
          control-id="settings-show-reasoning"
          title="显示模型思考内容"
          description="关闭后对话中隐藏模型推理和思考内容块。"
        >
          <Switch
            id="settings-show-reasoning"
            v-model="showReasoningContent"
            aria-label="显示模型思考内容"
          />
        </SettingEntry>
      </FieldGroup>
    </SettingsSection>

    <SettingsSection title="对话设置">
      <FieldGroup class="gap-0">
        <SettingEntry
          control-id="settings-max-recent"
          title="上下文最近消息数"
          description="发送给模型前保留的最近消息数量。"
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
            title="输入预算上限"
            description="按模型上下文窗口保留的最大输入比例。"
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
            title="附件策略"
            description="选择默认进入上下文的附件范围。"
          >
            <Select
              v-model="includeAttachments"
              class="w-full md:w-48"
            >
              <SelectTrigger
                id="settings-context-attachments"
                class="w-full md:w-48"
              >
                <SelectValue placeholder="选择附件策略" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="current-only">仅当前消息</SelectItem>
                  <SelectItem value="recent">最近消息</SelectItem>
                  <SelectItem value="never">不包含附件</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </SettingEntry>

          <SettingEntry
            control-id="settings-context-auto-compact"
            title="自动压缩上下文"
            description="达到阈值后自动维护会话上下文摘要。"
          >
            <Switch
              id="settings-context-auto-compact"
              v-model="autoCompact"
              aria-label="自动压缩上下文"
            />
          </SettingEntry>

          <SettingEntry
            control-id="settings-context-compact-threshold"
            title="压缩阈值"
            description="按输入预算百分比触发自动压缩。"
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
          title="压缩工具描述"
          description="减少工具描述占用的上下文长度。"
        >
          <Switch
            id="settings-compact-skills"
            v-model="compactSkillDescriptions"
            aria-label="压缩工具描述"
          />
        </SettingEntry>
      </FieldGroup>
    </SettingsSection>
  </div>
</template>

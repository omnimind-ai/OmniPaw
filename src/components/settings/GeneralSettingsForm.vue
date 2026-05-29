<script setup lang="ts">
import { computed } from 'vue'
import type {
  BridgeAppLanguage,
  BridgeAppTheme,
  BridgeContextAttachmentPolicy,
  BridgeDesktopSettingsConfig,
} from '@/bridge/app'
import SettingsSection from '@/components/settings/SettingsSection.vue'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
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
        <Field
          orientation="responsive"
          class="border-b px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="settings-language">语言</FieldLabel>
            <FieldDescription>切换桌面端界面语言。</FieldDescription>
          </FieldContent>
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
        </Field>

        <Field
          orientation="responsive"
          class="border-b px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="settings-theme">主题</FieldLabel>
            <FieldDescription>跟随系统或固定为亮色、深色。</FieldDescription>
          </FieldContent>
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
        </Field>

        <Field
          orientation="responsive"
          class="border-b px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="settings-zoom">缩放比例</FieldLabel>
            <FieldDescription>
              当前范围 {{ draft.app.zoom.min }} - {{ draft.app.zoom.max }}。
            </FieldDescription>
          </FieldContent>
          <Input
            id="settings-zoom"
            v-model="zoomFactor"
            class="w-full md:w-48"
            type="number"
            step="0.05"
            :min="draft.app.zoom.min"
            :max="draft.app.zoom.max"
          />
        </Field>

        <Field
          orientation="responsive"
          class="border-b px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="settings-minimize-tray">关闭/最小化到托盘</FieldLabel>
            <FieldDescription>关闭或最小化主窗口后保持后台可用。</FieldDescription>
          </FieldContent>
          <Switch
            id="settings-minimize-tray"
            v-model="minimizeToTrayOnStartup"
            aria-label="关闭/最小化到托盘"
          />
        </Field>

        <Field
          orientation="responsive"
          class="px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="settings-show-reasoning">显示模型思考内容</FieldLabel>
            <FieldDescription>关闭后对话中隐藏模型推理和思考内容块。</FieldDescription>
          </FieldContent>
          <Switch
            id="settings-show-reasoning"
            v-model="showReasoningContent"
            aria-label="显示模型思考内容"
          />
        </Field>
      </FieldGroup>
    </SettingsSection>

    <SettingsSection title="对话设置">
      <FieldGroup class="gap-0">
        <Field
          orientation="responsive"
          class="border-b px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="settings-max-recent">上下文最近消息数</FieldLabel>
            <FieldDescription>发送给模型前保留的最近消息数量。</FieldDescription>
          </FieldContent>
          <Input
            id="settings-max-recent"
            v-model="maxRecentMessages"
            class="w-full md:w-48"
            type="number"
            min="1"
            step="1"
          />
        </Field>

        <template v-if="chatContext">
          <Field
            orientation="responsive"
            class="border-b px-4 py-3"
          >
            <FieldContent>
              <FieldLabel for="settings-context-budget">输入预算上限</FieldLabel>
              <FieldDescription>按模型上下文窗口保留的最大输入比例。</FieldDescription>
            </FieldContent>
            <Input
              id="settings-context-budget"
              v-model="inputBudgetPercent"
              class="w-full md:w-48"
              type="number"
              min="1"
              max="100"
              step="1"
            />
          </Field>

          <Field
            orientation="responsive"
            class="border-b px-4 py-3"
          >
            <FieldContent>
              <FieldLabel for="settings-context-attachments">附件策略</FieldLabel>
              <FieldDescription>选择默认进入上下文的附件范围。</FieldDescription>
            </FieldContent>
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
          </Field>

          <Field
            orientation="responsive"
            class="border-b px-4 py-3"
          >
            <FieldContent>
              <FieldLabel for="settings-context-auto-compact">自动压缩上下文</FieldLabel>
              <FieldDescription>达到阈值后自动维护会话上下文摘要。</FieldDescription>
            </FieldContent>
            <Switch
              id="settings-context-auto-compact"
              v-model="autoCompact"
              aria-label="自动压缩上下文"
            />
          </Field>

          <Field
            orientation="responsive"
            class="border-b px-4 py-3"
          >
            <FieldContent>
              <FieldLabel for="settings-context-compact-threshold">压缩阈值</FieldLabel>
              <FieldDescription>按输入预算百分比触发自动压缩。</FieldDescription>
            </FieldContent>
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
          </Field>
        </template>

        <Field
          orientation="responsive"
          class="px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="settings-compact-skills">压缩工具描述</FieldLabel>
            <FieldDescription>减少工具描述占用的上下文长度。</FieldDescription>
          </FieldContent>
          <Switch
            id="settings-compact-skills"
            v-model="compactSkillDescriptions"
            aria-label="压缩工具描述"
          />
        </Field>
      </FieldGroup>
    </SettingsSection>
  </div>
</template>

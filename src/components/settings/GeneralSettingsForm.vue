<script setup lang="ts">
import { computed } from 'vue'
import type { BridgeAppLanguage, BridgeAppTheme, BridgeDesktopSettingsConfig } from '@/bridge/app'
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

const maxRecentMessages = computed({
  get: () => props.draft.app.maxRecentMessages,
  set: (value: string | number) => {
    const next = Math.max(1, Number(value) || 1)
    props.draft.app.maxRecentMessages = Math.round(next)
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
          class="px-4 py-3"
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

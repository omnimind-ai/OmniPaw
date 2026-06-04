<script setup lang="ts">
import { FolderCogIcon, TerminalIcon } from 'lucide-vue-next'
import { computed } from 'vue'
import type { BridgeDesktopSettingsConfig } from '@/bridge/app'
import SettingEntry from '@/components/settings/common/SettingEntry.vue'
import SettingsSection from '@/components/settings/common/SettingsSection.vue'
import { Badge } from '@/components/ui/badge'
import { FieldGroup } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

const props = defineProps<{
  draft: BridgeDesktopSettingsConfig
}>()

const workspaceEnabled = computed({
  get: () => props.draft.tools.workspace.enabled,
  set: (value: boolean) => {
    props.draft.tools.workspace.enabled = value
  },
})
const terminalEnabled = computed({
  get: () => props.draft.tools.terminal.enabled,
  set: (value: boolean) => {
    props.draft.tools.terminal.enabled = value
  },
})
const workspaceMaxReadMb = computed({
  get: () => bytesToMb(props.draft.tools.workspace.maxReadBytes),
  set: (value: string | number) => {
    props.draft.tools.workspace.maxReadBytes = mbToBytes(value, 1, 64)
  },
})
const workspaceMaxWriteMb = computed({
  get: () => bytesToMb(props.draft.tools.workspace.maxWriteBytes),
  set: (value: string | number) => {
    props.draft.tools.workspace.maxWriteBytes = mbToBytes(value, 1, 64)
  },
})
const terminalTimeoutSeconds = computed({
  get: () => Math.round(props.draft.tools.terminal.timeoutMs / 1000),
  set: (value: string | number) => {
    props.draft.tools.terminal.timeoutMs = secondsToMs(value, 1, 24 * 60 * 60)
  },
})
const terminalOutputKb = computed({
  get: () => Math.round(props.draft.tools.terminal.maxOutputChars / 1024),
  set: (value: string | number) => {
    props.draft.tools.terminal.maxOutputChars = kbToChars(value, 1, 976)
  },
})
const assistantApproval = computed({
  get: () => props.draft.tools.terminal.assistant.approval,
  set: (value: string | string[] | undefined) => {
    if (value === 'ask' || value === 'allow' || value === 'deny') {
      props.draft.tools.terminal.assistant.approval = value
    }
  },
})

function bytesToMb(value: number) {
  return Math.round(value / 1024 / 1024)
}

function mbToBytes(value: string | number, min: number, max: number) {
  const next = Number(value)
  if (!Number.isFinite(next)) return min * 1024 * 1024
  return Math.round(Math.min(max, Math.max(min, next)) * 1024 * 1024)
}

function secondsToMs(value: string | number, min: number, max: number) {
  const next = Number(value)
  if (!Number.isFinite(next)) return min * 1000
  return Math.round(Math.min(max, Math.max(min, next)) * 1000)
}

function kbToChars(value: string | number, min: number, max: number) {
  const next = Number(value)
  if (!Number.isFinite(next)) return min * 1024
  return Math.round(Math.min(max, Math.max(min, next)) * 1024)
}
</script>

<template>
  <SettingsSection
    title="本地 Agent 能力"
    description="托管 workspace 和本机 terminal 默认开箱即用；Docker 与专用镜像不是默认路径。"
  >
    <FieldGroup class="gap-0">
      <SettingEntry
        control-id="local-workspace-enabled"
        description="生成文件默认写入按会话隔离的 userData 托管目录。"
      >
        <template #title>
          <span class="flex items-center gap-2">
            Workspace
          </span>
        </template>
        <div class="flex items-center gap-3">
          <Switch
            id="local-workspace-enabled"
            v-model="workspaceEnabled"
            aria-label="启用本地 workspace"
          />
        </div>
      </SettingEntry>

      <SettingEntry
        control-id="local-terminal-enabled"
        description="assistant 默认 ask-first，power 是 full local access。"
      >
        <template #title>
          <span class="flex items-center gap-2">
            Terminal
          </span>
        </template>
        <div class="flex items-center gap-3">
          <Switch
            id="local-terminal-enabled"
            v-model="terminalEnabled"
            aria-label="启用本地 terminal"
          />
        </div>
      </SettingEntry>

      <SettingEntry
        title="Assistant terminal approval"
        description="默认逐条审批 terminal；power 模式固定为无需审批的 full local access。"
        control-class="@md/field-group:min-w-fit"
      >
        <ToggleGroup
          v-model="assistantApproval"
          type="single"
          variant="outline"
          class="w-full md:w-auto"
        >
          <ToggleGroupItem value="ask" class="flex-1 md:flex-none">Ask</ToggleGroupItem>
          <ToggleGroupItem value="allow" class="flex-1 md:flex-none">Allow</ToggleGroupItem>
          <ToggleGroupItem value="deny" class="flex-1 md:flex-none">Deny</ToggleGroupItem>
        </ToggleGroup>
      </SettingEntry>

      <SettingEntry
        control-id="local-workspace-read-limit"
        title="Workspace 读取上限"
        description="单次 workspace read/search 可进入工具结果的内容上限。"
      >
        <Input
          id="local-workspace-read-limit"
          v-model="workspaceMaxReadMb"
          class="w-full md:w-40"
          type="number"
          min="1"
          max="64"
        />
      </SettingEntry>

      <SettingEntry
        control-id="local-workspace-write-limit"
        title="Workspace 写入上限"
        description="单次 workspace write/patch 的文本大小上限，单位 MB。"
      >
        <Input
          id="local-workspace-write-limit"
          v-model="workspaceMaxWriteMb"
          class="w-full md:w-40"
          type="number"
          min="1"
          max="64"
        />
      </SettingEntry>

      <SettingEntry
        control-id="local-terminal-timeout"
        title="Terminal 超时"
        description="前台命令默认运行时间上限，单位秒。"
      >
        <Input
          id="local-terminal-timeout"
          v-model="terminalTimeoutSeconds"
          class="w-full md:w-40"
          type="number"
          min="1"
        />
      </SettingEntry>

      <SettingEntry
        control-id="local-terminal-output-limit"
        title="Terminal 输出上限"
        description="stdout/stderr 只保留尾部内容，单位 KB。"
      >
        <Input
          id="local-terminal-output-limit"
          v-model="terminalOutputKb"
          class="w-full md:w-40"
          type="number"
          min="1"
        />
      </SettingEntry>
    </FieldGroup>
  </SettingsSection>
</template>

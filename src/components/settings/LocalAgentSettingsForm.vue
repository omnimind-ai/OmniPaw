<script setup lang="ts">
import { TerminalIcon } from 'lucide-vue-next'
import { computed } from 'vue'
import type { BridgeDesktopSettingsConfig } from '@/bridge/app'
import SettingEntry from '@/components/settings/common/SettingEntry.vue'
import SettingsSection from '@/components/settings/common/SettingsSection.vue'
import { FieldGroup } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

const props = defineProps<{
  draft: BridgeDesktopSettingsConfig
}>()

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
const maxAgentSteps = computed({
  get: () => props.draft.tools.maxAgentSteps,
  set: (value: string | number) => {
    props.draft.tools.maxAgentSteps = clampInteger(value, 1, 24, 6)
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

function clampInteger(value: string | number, min: number, max: number, fallback: number) {
  const next = Number(value)
  if (!Number.isFinite(next)) return fallback
  return Math.round(Math.min(max, Math.max(min, next)))
}
</script>

<template>
  <SettingsSection
    title="本地 Agent 能力"
    description="配置 workspace 和 terminal 的运行限制。"
    :icon="TerminalIcon"
  >
    <FieldGroup class="gap-0">
      <SettingEntry
        control-id="local-agent-max-steps"
        title="Agent 最大步骤"
        description="单次回复中模型可连续调用工具的最大轮数，过高会增加延迟和成本。"
      >
        <Input
          id="local-agent-max-steps"
          v-model="maxAgentSteps"
          class="w-full md:w-40"
          type="number"
          min="1"
          max="24"
          step="1"
        />
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

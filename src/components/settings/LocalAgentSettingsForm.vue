<script setup lang="ts">
import { FolderCogIcon, ShieldAlertIcon, TerminalIcon } from 'lucide-vue-next'
import { computed } from 'vue'
import type { BridgeDesktopSettingsConfig } from '@/bridge/app'
import SettingsSection from '@/components/settings/SettingsSection.vue'
import { Badge } from '@/components/ui/badge'
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
const powerApproval = computed({
  get: () => props.draft.tools.terminal.power.approval,
  set: (value: string | string[] | undefined) => {
    if (value === 'ask' || value === 'allow' || value === 'deny') {
      props.draft.tools.terminal.power.approval = value
    }
  },
})
const sandbox = computed({
  get: () => props.draft.tools.terminal.sandbox,
  set: (value: string) => {
    if (
      value === 'policy-only' ||
      value === 'non-sandboxed' ||
      value === 'macos-seatbelt' ||
      value === 'linux-bubblewrap' ||
      value === 'windows-restricted'
    ) {
      props.draft.tools.terminal.sandbox = value
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
      <Field
        orientation="responsive"
        class="border-b px-4 py-3"
      >
        <FieldContent>
          <FieldLabel for="local-workspace-enabled">
            <FolderCogIcon data-icon="inline-start" />
            Workspace
          </FieldLabel>
          <FieldDescription>
            生成文件默认写入按会话隔离的 userData 托管目录。
          </FieldDescription>
        </FieldContent>
        <div class="flex items-center gap-3">
          <Badge variant="outline">managed-user-data</Badge>
          <Switch
            id="local-workspace-enabled"
            v-model="workspaceEnabled"
            aria-label="启用本地 workspace"
          />
        </div>
      </Field>

      <Field
        orientation="responsive"
        class="border-b px-4 py-3"
      >
        <FieldContent>
          <FieldLabel for="local-terminal-enabled">
            <TerminalIcon data-icon="inline-start" />
            Terminal
          </FieldLabel>
          <FieldDescription>
            assistant 默认 ask-first，power 是 full local access。
          </FieldDescription>
        </FieldContent>
        <div class="flex items-center gap-3">
          <Badge :variant="draft.tools.agentToolProfile === 'power' ? 'destructive' : 'outline'">
            {{ draft.tools.agentToolProfile === 'power' ? 'full access' : 'ask-first' }}
          </Badge>
          <Switch
            id="local-terminal-enabled"
            v-model="terminalEnabled"
            aria-label="启用本地 terminal"
          />
        </div>
      </Field>

      <Field
        orientation="responsive"
        class="border-b px-4 py-3"
      >
        <FieldContent>
          <FieldLabel for="local-sandbox-level">
            <ShieldAlertIcon data-icon="inline-start" />
            Sandbox level
          </FieldLabel>
          <FieldDescription>
            当前 MVP 使用产品策略边界；无 OS sandbox 时会显式标记。
          </FieldDescription>
        </FieldContent>
        <Select
          v-model="sandbox"
          class="w-full md:w-56"
        >
          <SelectTrigger
            id="local-sandbox-level"
            class="w-full md:w-56"
          >
            <SelectValue placeholder="选择 sandbox level" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="policy-only">policy-only</SelectItem>
              <SelectItem value="non-sandboxed">non-sandboxed</SelectItem>
              <SelectItem value="macos-seatbelt">macos-seatbelt</SelectItem>
              <SelectItem value="linux-bubblewrap">linux-bubblewrap</SelectItem>
              <SelectItem value="windows-restricted">windows-restricted</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>

      <Field
        orientation="responsive"
        class="border-b px-4 py-3"
      >
        <FieldContent>
          <FieldLabel>Assistant terminal approval</FieldLabel>
          <FieldDescription>
            默认逐条审批 terminal；allow/deny 只影响 assistant，power 不套用命令规则。
          </FieldDescription>
        </FieldContent>
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
      </Field>

      <Field
        orientation="responsive"
        class="border-b px-4 py-3"
      >
        <FieldContent>
          <FieldLabel>Power terminal approval</FieldLabel>
          <FieldDescription>
            power 默认直接执行本地命令，但仍保留超时、输出上限和 abort。
          </FieldDescription>
        </FieldContent>
        <ToggleGroup
          v-model="powerApproval"
          type="single"
          variant="outline"
          class="w-full md:w-auto"
        >
          <ToggleGroupItem value="allow" class="flex-1 md:flex-none">Allow</ToggleGroupItem>
          <ToggleGroupItem value="ask" class="flex-1 md:flex-none">Ask</ToggleGroupItem>
          <ToggleGroupItem value="deny" class="flex-1 md:flex-none">Deny</ToggleGroupItem>
        </ToggleGroup>
      </Field>

      <Field
        orientation="responsive"
        class="border-b px-4 py-3"
      >
        <FieldContent>
          <FieldLabel for="local-workspace-read-limit">Workspace 读取上限</FieldLabel>
          <FieldDescription>单次 workspace read/search 可进入工具结果的内容上限。</FieldDescription>
        </FieldContent>
        <Input
          id="local-workspace-read-limit"
          v-model="workspaceMaxReadMb"
          class="w-full md:w-40"
          type="number"
          min="1"
          max="64"
        />
      </Field>

      <Field
        orientation="responsive"
        class="border-b px-4 py-3"
      >
        <FieldContent>
          <FieldLabel for="local-workspace-write-limit">Workspace 写入上限</FieldLabel>
          <FieldDescription>单次 workspace write/patch 的文本大小上限，单位 MB。</FieldDescription>
        </FieldContent>
        <Input
          id="local-workspace-write-limit"
          v-model="workspaceMaxWriteMb"
          class="w-full md:w-40"
          type="number"
          min="1"
          max="64"
        />
      </Field>

      <Field
        orientation="responsive"
        class="border-b px-4 py-3"
      >
        <FieldContent>
          <FieldLabel for="local-terminal-timeout">Terminal 超时</FieldLabel>
          <FieldDescription>前台命令默认运行时间上限，单位秒。</FieldDescription>
        </FieldContent>
        <Input
          id="local-terminal-timeout"
          v-model="terminalTimeoutSeconds"
          class="w-full md:w-40"
          type="number"
          min="1"
        />
      </Field>

      <Field
        orientation="responsive"
        class="px-4 py-3"
      >
        <FieldContent>
          <FieldLabel for="local-terminal-output-limit">Terminal 输出上限</FieldLabel>
          <FieldDescription>stdout/stderr 只保留尾部内容，单位 KB。</FieldDescription>
        </FieldContent>
        <Input
          id="local-terminal-output-limit"
          v-model="terminalOutputKb"
          class="w-full md:w-40"
          type="number"
          min="1"
        />
      </Field>
    </FieldGroup>
  </SettingsSection>
</template>

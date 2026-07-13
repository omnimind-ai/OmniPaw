<script setup lang="ts">
import { TerminalIcon } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { BridgeDesktopSettingsConfig } from '@/bridge/app'
import SettingEntry from '@/components/settings/common/SettingEntry.vue'
import SettingsSection from '@/components/settings/common/SettingsSection.vue'
import { FieldGroup } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

const props = defineProps<{
  draft: BridgeDesktopSettingsConfig
}>()

const { t } = useI18n()

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
    :title="t('settings.localAgent.title')"
    :description="t('settings.localAgent.description')"
    :icon="TerminalIcon"
  >
    <FieldGroup class="gap-0">
      <SettingEntry
        control-id="local-agent-max-steps"
        :title="t('settings.localAgent.maxSteps.title')"
        :description="t('settings.localAgent.maxSteps.description')"
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
        :title="t('settings.localAgent.workspaceReadLimit.title')"
        :description="t('settings.localAgent.workspaceReadLimit.description')"
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
        :title="t('settings.localAgent.workspaceWriteLimit.title')"
        :description="t('settings.localAgent.workspaceWriteLimit.description')"
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
        :title="t('settings.localAgent.terminalTimeout.title')"
        :description="t('settings.localAgent.terminalTimeout.description')"
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
        :title="t('settings.localAgent.terminalOutputLimit.title')"
        :description="t('settings.localAgent.terminalOutputLimit.description')"
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

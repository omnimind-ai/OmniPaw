<script setup lang="ts">
import { RefreshCwIcon, ShieldCheckIcon, TerminalIcon } from '@lucide/vue'
import type { TerminalSandboxStatus } from '@shared/types/local-agent'
import { computed, onMounted, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import type { BridgeDesktopSettingsConfig } from '@/bridge/app'
import { appBridge } from '@/bridge/app'
import SettingEntry from '@/components/settings/common/SettingEntry.vue'
import SettingsSection from '@/components/settings/common/SettingsSection.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FieldGroup } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { errorToText, useToast } from '@/utils/toast'

const props = defineProps<{
  draft: BridgeDesktopSettingsConfig
}>()

const { t } = useI18n()
const toast = useToast()
const sandboxStatus = shallowRef<TerminalSandboxStatus>()
const sandboxChecking = ref(false)
const sandboxInstalling = ref(false)

const sandboxStatusLabel = computed(() => {
  const state = sandboxStatus.value?.state
  if (!state || sandboxChecking.value) return t('settings.localAgent.sandbox.status.checking')
  return t(`settings.localAgent.sandbox.status.${state}`)
})
const sandboxStatusVariant = computed(() => {
  if (sandboxStatus.value?.ready) return 'secondary' as const
  if (sandboxStatus.value?.state === 'setup_required') return 'outline' as const
  return 'destructive' as const
})
const sandboxDetail = computed(() => {
  const current = sandboxStatus.value
  if (!current) return t('settings.localAgent.sandbox.description')
  return (
    current.errors[0] ||
    current.warnings[0] ||
    t('settings.localAgent.sandbox.implementation', { implementation: current.implementation })
  )
})
const canInstallSandbox = computed(
  () => sandboxStatus.value?.platform === 'windows' && !sandboxStatus.value.ready
)

onMounted(() => {
  void refreshSandboxStatus()
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

async function refreshSandboxStatus() {
  sandboxChecking.value = true
  try {
    sandboxStatus.value = await appBridge.terminalProcess.sandboxStatus()
  } catch (error) {
    toast.error(errorToText(error, t('settings.localAgent.sandbox.messages.checkFailed')))
  } finally {
    sandboxChecking.value = false
  }
}

async function installSandbox() {
  sandboxInstalling.value = true
  try {
    const result = await appBridge.terminalProcess.installSandbox()
    sandboxStatus.value = result.status
    if (result.cancelled) {
      toast.info(t('settings.localAgent.sandbox.messages.installCancelled'))
    } else {
      toast.success(t('settings.localAgent.sandbox.messages.installSucceeded'))
    }
  } catch (error) {
    toast.error(errorToText(error, t('settings.localAgent.sandbox.messages.installFailed')))
  } finally {
    sandboxInstalling.value = false
  }
}
</script>

<template>
  <SettingsSection
    :title="t('settings.localAgent.title')"
    :icon="TerminalIcon"
  >
    <FieldGroup class="gap-0">
      <SettingEntry
        :title="t('settings.localAgent.sandbox.title')"
        :description="sandboxDetail"
      >
        <Badge :variant="sandboxStatusVariant">
          <ShieldCheckIcon />
          {{ sandboxStatusLabel }}
        </Badge>
        <Button
          v-if="canInstallSandbox"
          size="sm"
          :disabled="sandboxInstalling || sandboxChecking"
          @click="installSandbox"
        >
          {{ sandboxInstalling ? t('settings.localAgent.sandbox.installing') : t('settings.localAgent.sandbox.install') }}
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          :aria-label="t('settings.localAgent.sandbox.refresh')"
          :disabled="sandboxInstalling || sandboxChecking"
          @click="refreshSandboxStatus"
        >
          <RefreshCwIcon :class="sandboxChecking && 'animate-spin'" />
        </Button>
      </SettingEntry>

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

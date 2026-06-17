<script setup lang="ts">
import type {
  ShortcutAction,
  ShortcutRegistrationStatus,
  ShortcutStatusChangedEvent,
} from '@shared/types/shortcuts'
import { KeyboardIcon, RotateCcwIcon } from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { BridgeDesktopSettingsConfig } from '@/bridge/app'
import { appBridge } from '@/bridge/app'
import SettingEntry from '@/components/settings/common/SettingEntry.vue'
import SettingsSection from '@/components/settings/common/SettingsSection.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FieldGroup } from '@/components/ui/field'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { useToast } from '@/utils/toast'

const shortcutItems = [
  {
    action: 'cat.toggleVisibility',
    titleKey: 'settings.shortcut.entries.toggleVisibility.title',
    descriptionKey: 'settings.shortcut.entries.toggleVisibility.description',
  },
  {
    action: 'cat.openPanel',
    titleKey: 'settings.shortcut.entries.openPanel.title',
    descriptionKey: 'settings.shortcut.entries.openPanel.description',
  },
  {
    action: 'app.zoomIn',
    titleKey: 'settings.shortcut.entries.zoomIn.title',
    descriptionKey: 'settings.shortcut.entries.zoomIn.description',
  },
  {
    action: 'app.zoomOut',
    titleKey: 'settings.shortcut.entries.zoomOut.title',
    descriptionKey: 'settings.shortcut.entries.zoomOut.description',
  },
  {
    action: 'app.zoomReset',
    titleKey: 'settings.shortcut.entries.zoomReset.title',
    descriptionKey: 'settings.shortcut.entries.zoomReset.description',
  },
] as const satisfies ReadonlyArray<{
  action: ShortcutAction
  titleKey: string
  descriptionKey: string
}>

const defaultShortcutAccelerators: Record<ShortcutAction, string> = {
  'cat.toggleVisibility': 'CmdOrCtrl+Alt+K',
  'cat.openPanel': 'CmdOrCtrl+Alt+P',
  'app.zoomIn': 'CmdOrCtrl+=',
  'app.zoomOut': 'CmdOrCtrl+-',
  'app.zoomReset': 'CmdOrCtrl+0',
}

const props = defineProps<{
  draft: BridgeDesktopSettingsConfig
}>()

const toast = useToast()
const { t } = useI18n()
const shortcutStatuses = ref<ShortcutRegistrationStatus[]>([])
const recordingAction = ref<ShortcutAction | null>(null)
let unsubscribeShortcutStatus: (() => void) | undefined

const shortcutStatusByAction = computed(() => {
  const result = new Map<ShortcutAction, ShortcutRegistrationStatus>()
  for (const status of shortcutStatuses.value) {
    result.set(status.action, status)
  }
  return result
})

onMounted(() => {
  void refreshShortcutStatus()
  unsubscribeShortcutStatus = appBridge.shortcuts?.onChanged?.((event) => {
    applyShortcutStatus(event)
  })
})

onBeforeUnmount(() => {
  unsubscribeShortcutStatus?.()
  unsubscribeShortcutStatus = undefined
  void stopShortcutCaptureMode()
})

async function refreshShortcutStatus(): Promise<void> {
  try {
    const event = await appBridge.shortcuts?.status?.()
    if (event) {
      applyShortcutStatus(event)
    }
  } catch (error) {
    toast.warning(error, { description: t('settings.shortcut.errors.failedToReadStatus') })
  }
}

function applyShortcutStatus(event: ShortcutStatusChangedEvent): void {
  shortcutStatuses.value = event.statuses
}

function shortcutBinding(action: ShortcutAction) {
  return props.draft.app.shortcuts.bindings[action]
}

function setShortcutAccelerator(action: ShortcutAction, accelerator: string): void {
  const binding = shortcutBinding(action)
  binding.accelerator = accelerator
  binding.enabled = true
}

function resetShortcut(action: ShortcutAction): void {
  setShortcutAccelerator(action, defaultShortcutAccelerators[action])
}

async function beginShortcutRecording(action: ShortcutAction): Promise<void> {
  if (recordingAction.value) {
    await cancelShortcutRecording()
  }

  try {
    recordingAction.value = action
    window.addEventListener('keydown', handleShortcutRecordingKeydown, { capture: true })
    await appBridge.shortcuts?.setCaptureMode?.(true)
  } catch (error) {
    recordingAction.value = null
    window.removeEventListener('keydown', handleShortcutRecordingKeydown, { capture: true })
    toast.error(error, { description: t('settings.shortcut.errors.failedEnterCaptureMode') })
  }
}

async function cancelShortcutRecording(): Promise<void> {
  recordingAction.value = null
  window.removeEventListener('keydown', handleShortcutRecordingKeydown, { capture: true })
  await stopShortcutCaptureMode()
}

async function stopShortcutCaptureMode(): Promise<void> {
  try {
    await appBridge.shortcuts?.setCaptureMode?.(false)
  } catch (error) {
    toast.warning(error, { description: t('settings.shortcut.errors.failedRestoreShortcuts') })
  }
}

function handleShortcutRecordingKeydown(event: KeyboardEvent): void {
  if (!recordingAction.value) {
    return
  }

  event.preventDefault()
  event.stopPropagation()

  if (event.key === 'Escape') {
    void cancelShortcutRecording()
    return
  }

  const accelerator = keyboardEventToAccelerator(event)
  if (!accelerator) {
    return
  }

  setShortcutAccelerator(recordingAction.value, accelerator)
  void cancelShortcutRecording()
}

function keyboardEventToAccelerator(event: KeyboardEvent): string | null {
  const key = normalizeAcceleratorKey(event)
  if (!key || isModifierKey(key)) {
    return null
  }

  const modifiers: string[] = []
  if (event.metaKey || event.ctrlKey) {
    modifiers.push('CmdOrCtrl')
  }
  if (event.altKey) {
    modifiers.push('Alt')
  }
  if (event.shiftKey) {
    modifiers.push('Shift')
  }
  if (modifiers.length === 0) {
    return null
  }

  return [...modifiers, key].join('+')
}

function normalizeAcceleratorKey(event: KeyboardEvent): string | null {
  const key = event.key
  if (!key) {
    return null
  }

  const namedKeys: Record<string, string> = {
    ' ': 'Space',
    Spacebar: 'Space',
    Escape: 'Esc',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    '+': 'Plus',
    '=': '=',
    '-': '-',
  }
  if (namedKeys[key]) {
    return namedKeys[key]
  }

  if (/^F\d{1,2}$/i.test(key)) {
    return key.toUpperCase()
  }
  if (key.length === 1) {
    return key.toUpperCase()
  }

  return key
}

function isModifierKey(key: string): boolean {
  return ['Control', 'Ctrl', 'Meta', 'Command', 'Cmd', 'Alt', 'Option', 'Shift'].includes(key)
}

function acceleratorParts(accelerator: string): string[] {
  return accelerator
    .split('+')
    .map((part) => {
      if (part === 'CmdOrCtrl') return 'Cmd/Ctrl'
      if (part === 'Plus') return '+'
      return part
    })
    .filter(Boolean)
}
</script>

<template>
  <SettingsSection
    :title="t('settings.shortcut.title')"
    :description="t('settings.shortcut.description')"
    :icon="KeyboardIcon"
  >
    <FieldGroup class="gap-0">
      <SettingEntry
        v-for="item in shortcutItems"
        :key="item.action"
        :control-id="`settings-shortcut-${item.action}`"
        :title="t(item.titleKey)"
        :description="t(item.descriptionKey)"
        control-class="flex-wrap @md/field-group:flex-nowrap"
      >
        <Button
          :id="`settings-shortcut-${item.action}`"
          type="button"
          variant="outline"
          class="h-8 min-w-44 justify-start px-2"
          :disabled="recordingAction !== null && recordingAction !== item.action"
          @click="beginShortcutRecording(item.action)"
        >
          <KeyboardIcon data-icon="inline-start" />
          <span
            v-if="recordingAction === item.action"
            class="truncate"
          >
            {{ $t('settings.shortcut.recording.prompt') }}
          </span>
          <KbdGroup
            v-else
            class="min-w-0"
          >
            <Kbd
              v-for="part in acceleratorParts(shortcutBinding(item.action).accelerator)"
              :key="`${item.action}-${part}`"
            >
              {{ part }}
            </Kbd>
          </KbdGroup>
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          :disabled="recordingAction !== null"
          :aria-label="t('settings.shortcut.reset.label', { title: t(item.titleKey) })"
          @click="resetShortcut(item.action)"
        >
          <RotateCcwIcon />
        </Button>
      </SettingEntry>
    </FieldGroup>
  </SettingsSection>
</template>

<script setup lang="ts">
import type {
  ShortcutAction,
  ShortcutRegistrationStatus,
  ShortcutStatusChangedEvent,
} from '@shared/types/shortcuts'
import { KeyboardIcon, RotateCcwIcon } from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
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
    title: '显示/隐藏小猫',
    description: '切换小猫悬浮窗显示状态。',
  },
  {
    action: 'cat.openPanel',
    title: '打开/关闭小猫面板',
    description: '切换小猫对话面板并激活输入。',
  },
  {
    action: 'app.zoomIn',
    title: '放大',
    description: '增加主窗口缩放比例。',
  },
  {
    action: 'app.zoomOut',
    title: '缩小',
    description: '降低主窗口缩放比例。',
  },
  {
    action: 'app.zoomReset',
    title: '重置缩放',
    description: '恢复默认缩放比例。',
  },
] as const satisfies ReadonlyArray<{
  action: ShortcutAction
  title: string
  description: string
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
    toast.warning(error, { description: '无法读取快捷键状态' })
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
    toast.error(error, { description: '无法进入快捷键录制模式' })
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
    toast.warning(error, { description: '无法恢复全局快捷键' })
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
    title="快捷键"
    description="调整全局快捷组合键。"
    :icon="KeyboardIcon"
  >
    <FieldGroup class="gap-0">
      <SettingEntry
        v-for="item in shortcutItems"
        :key="item.action"
        :control-id="`settings-shortcut-${item.action}`"
        :title="item.title"
        :description="item.description"
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
            按下组合键
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
          :aria-label="`重置${item.title}快捷键`"
          @click="resetShortcut(item.action)"
        >
          <RotateCcwIcon />
        </Button>
      </SettingEntry>
    </FieldGroup>
  </SettingsSection>
</template>

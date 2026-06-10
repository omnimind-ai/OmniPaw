import type { Logger } from '@core/logging'
import type { DesktopShortcutSettings } from '@shared/types/shortcuts'
import {
  GLOBAL_SHORTCUT_ACTIONS,
  type GlobalShortcutAction,
  SHORTCUT_ACTIONS,
  type ShortcutAction,
  type ShortcutRegistrationStatus,
  type ShortcutStatusChangedEvent,
} from '@shared/types/shortcuts'
import { globalShortcut } from 'electron'

type ShortcutActionHandlers = Record<GlobalShortcutAction, () => void>

interface ShortcutControllerOptions {
  logger: Logger
  getSettings: () => DesktopShortcutSettings
  actions: ShortcutActionHandlers
  onChanged?: (event: ShortcutStatusChangedEvent) => void
}

export interface ShortcutController {
  apply: (settings?: DesktopShortcutSettings) => ShortcutStatusChangedEvent
  status: () => ShortcutStatusChangedEvent
  setCaptureMode: (enabled: boolean) => ShortcutStatusChangedEvent
  destroy: () => void
}

export function createShortcutController(options: ShortcutControllerOptions): ShortcutController {
  const logger = options.logger.child({ scope: 'shortcuts' })
  const registeredAccelerators = new Set<string>()
  let statuses: ShortcutRegistrationStatus[] = []
  let captureMode = false

  function apply(settings = options.getSettings()): ShortcutStatusChangedEvent {
    unregisterRegisteredAccelerators()

    const updatedAt = Date.now()
    if (captureMode) {
      statuses = SHORTCUT_ACTIONS.map((action) => {
        const binding = settings.bindings[action]
        return {
          action,
          enabled: true,
          accelerator: binding.accelerator,
          state: 'disabled',
          message: '正在录制快捷键，已临时停用全局快捷键。',
          updatedAt,
        }
      })
      return emit()
    }

    const claimed = new Map<string, ShortcutAction>()
    statuses = SHORTCUT_ACTIONS.map((action) => {
      const binding = settings.bindings[action]
      const accelerator = binding.accelerator.trim()
      const base = {
        action,
        enabled: true,
        accelerator,
        updatedAt,
      }

      if (!isValidAcceleratorShape(accelerator)) {
        return {
          ...base,
          state: 'invalid',
          message: '快捷键需要至少一个修饰键和一个按键。',
        }
      }

      const key = acceleratorKey(accelerator)
      const previous = claimed.get(key)
      if (previous) {
        return {
          ...base,
          state: 'conflict',
          message: `与 ${actionLabel(previous)} 使用了相同组合键。`,
        }
      }
      claimed.set(key, action)

      if (!isGlobalShortcutAction(action)) {
        return {
          ...base,
          state: 'registered',
          message: '应用窗口聚焦时生效。',
        }
      }

      try {
        const registered = globalShortcut.register(accelerator, () => {
          try {
            logger.debug('Shortcut action invoked.', { action })
            options.actions[action]()
          } catch (error) {
            logger.warn('Shortcut action failed.', { action, error })
          }
        })

        if (!registered) {
          return {
            ...base,
            state: 'conflict',
            message: '系统或其他应用已占用该组合键。',
          }
        }

        registeredAccelerators.add(accelerator)
        return {
          ...base,
          state: 'registered',
        }
      } catch (error) {
        logger.warn('Shortcut registration failed.', { action, accelerator, error })
        return {
          ...base,
          state: 'invalid',
          message: 'Electron 无法识别该组合键。',
        }
      }
    })

    return emit()
  }

  function status(): ShortcutStatusChangedEvent {
    if (statuses.length === 0) {
      return apply()
    }
    return { statuses: statuses.map((item) => ({ ...item })) }
  }

  function setCaptureMode(enabled: boolean): ShortcutStatusChangedEvent {
    captureMode = enabled
    return apply()
  }

  function destroy(): void {
    unregisterRegisteredAccelerators()
    statuses = []
  }

  function emit(): ShortcutStatusChangedEvent {
    const event = statusSnapshot()
    options.onChanged?.(event)
    return event
  }

  function statusSnapshot(): ShortcutStatusChangedEvent {
    return {
      statuses: statuses.map((item) => ({ ...item })),
    }
  }

  function unregisterRegisteredAccelerators(): void {
    for (const accelerator of registeredAccelerators) {
      try {
        globalShortcut.unregister(accelerator)
      } catch (error) {
        logger.warn('Shortcut unregister failed.', { accelerator, error })
      }
    }
    registeredAccelerators.clear()
  }

  return {
    apply,
    status,
    setCaptureMode,
    destroy,
  }
}

function acceleratorKey(value: string): string {
  return value
    .split('+')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .join('+')
}

function isValidAcceleratorShape(value: string): boolean {
  const parts = value
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length < 2) {
    return false
  }

  const modifiers = new Set([
    'command',
    'cmd',
    'control',
    'ctrl',
    'commandorcontrol',
    'cmdorctrl',
    'alt',
    'option',
    'altgr',
    'shift',
    'super',
    'meta',
  ])
  let hasModifier = false
  let hasKey = false
  for (const part of parts) {
    if (modifiers.has(part.toLowerCase())) {
      hasModifier = true
    } else {
      hasKey = true
    }
  }
  return hasModifier && hasKey
}

function actionLabel(action: ShortcutAction): string {
  switch (action) {
    case 'cat.toggleVisibility':
      return '显示/隐藏小猫'
    case 'cat.openPanel':
      return '打开/关闭小猫面板'
    case 'app.zoomIn':
      return '放大'
    case 'app.zoomOut':
      return '缩小'
    case 'app.zoomReset':
      return '重置缩放'
  }
}

function isGlobalShortcutAction(action: ShortcutAction): action is GlobalShortcutAction {
  return (GLOBAL_SHORTCUT_ACTIONS as readonly ShortcutAction[]).includes(action)
}

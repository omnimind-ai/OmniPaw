import type { ManagedToolInfo, SetToolEnabledResponse } from '@shared/types/tool'
import type { DesktopSettingsConfig } from '@shared/types/settings'
import { listBuiltinToolDefinitions } from './builtin-tools'

const DISABLED_TOOLS_KEY = 'agent.disabledTools'

export interface ToolSettingsStore {
  getJson<T>(key: string, fallback: T): T
  setJson(key: string, value: unknown): void
}

export class ToolManagementService {
  constructor(
    private readonly settings: ToolSettingsStore | DesktopToolSettingsStore,
    private readonly extraTools?: () => ManagedToolInfo[]
  ) {}

  list(): ManagedToolInfo[] {
    const disabled = this.getDisabledToolNames()
    const builtins = listBuiltinToolDefinitions().map(
      (tool) =>
        ({
          ...tool,
          source: 'builtin',
          enabled: !disabled.has(tool.name),
          readonly: true,
        }) satisfies ManagedToolInfo
    )
    return [...builtins, ...(this.extraTools?.() ?? [])]
  }

  setEnabled(name: string, enabled: boolean): SetToolEnabledResponse {
    const registeredNames = new Set(listBuiltinToolDefinitions().map((tool) => tool.name))
    if (!registeredNames.has(name)) {
      throw new Error(`Tool is not registered: ${name}`)
    }

    const disabled = this.getDisabledToolNames()
    if (enabled) {
      disabled.delete(name)
    } else {
      disabled.add(name)
    }
    this.saveDisabledToolNames(disabled)

    const tools = this.list()
    const tool = tools.find((item) => item.name === name)
    if (!tool) {
      throw new Error(`Tool is not registered: ${name}`)
    }
    return { tool, tools }
  }

  getDisabledToolNames(): Set<string> {
    const registeredNames = new Set(listBuiltinToolDefinitions().map((tool) => tool.name))
    const stored = this.getStoredDisabledToolNames()
    if (!Array.isArray(stored)) {
      return new Set()
    }
    return new Set(
      stored.filter((name): name is string => typeof name === 'string' && registeredNames.has(name))
    )
  }

  private saveDisabledToolNames(disabled: Set<string>): void {
    const registeredNames = new Set(listBuiltinToolDefinitions().map((tool) => tool.name))
    const names = [...disabled].filter((name) => registeredNames.has(name)).sort()
    if (isDesktopToolSettingsStore(this.settings)) {
      const enabledByName = Object.fromEntries(
        listBuiltinToolDefinitions().map((tool) => [tool.name, !names.includes(tool.name)])
      )
      this.settings.updateToolsEnabledByName(enabledByName)
      return
    }

    this.settings.setJson(DISABLED_TOOLS_KEY, names)
  }

  private getStoredDisabledToolNames(): string[] {
    if (isDesktopToolSettingsStore(this.settings)) {
      const enabledByName = this.settings.getToolsEnabledByName()
      return listBuiltinToolDefinitions()
        .filter((tool) => enabledByName[tool.name] === false)
        .map((tool) => tool.name)
    }

    return this.settings.getJson<string[]>(DISABLED_TOOLS_KEY, [])
  }
}

export interface DesktopToolSettingsStore {
  getToolsEnabledByName(): DesktopSettingsConfig['tools']['enabledByName']
  updateToolsEnabledByName(enabledByName: DesktopSettingsConfig['tools']['enabledByName']): void
}

function isDesktopToolSettingsStore(
  settings: ToolSettingsStore | DesktopToolSettingsStore
): settings is DesktopToolSettingsStore {
  return 'getToolsEnabledByName' in settings && 'updateToolsEnabledByName' in settings
}

import type { ManagedToolInfo, SetToolEnabledResponse } from '@shared/types/tool'
import { listBuiltinToolDefinitions } from './builtin-tools'

const DISABLED_TOOLS_KEY = 'agent.disabledTools'

export interface ToolSettingsStore {
  getJson<T>(key: string, fallback: T): T
  setJson(key: string, value: unknown): void
}

export class ToolManagementService {
  constructor(private readonly settings: ToolSettingsStore) {}

  list(): ManagedToolInfo[] {
    const disabled = this.getDisabledToolNames()
    return listBuiltinToolDefinitions().map((tool) => ({
      ...tool,
      source: 'builtin',
      enabled: !disabled.has(tool.name),
    }))
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
    const stored = this.settings.getJson<string[]>(DISABLED_TOOLS_KEY, [])
    if (!Array.isArray(stored)) {
      return new Set()
    }
    return new Set(
      stored.filter((name): name is string => typeof name === 'string' && registeredNames.has(name)),
    )
  }

  private saveDisabledToolNames(disabled: Set<string>): void {
    const registeredNames = new Set(listBuiltinToolDefinitions().map((tool) => tool.name))
    const names = [...disabled].filter((name) => registeredNames.has(name)).sort()
    this.settings.setJson(DISABLED_TOOLS_KEY, names)
  }
}

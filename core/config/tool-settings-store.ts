import type { DesktopSettingsConfig } from '@shared/types/settings'
import type { ConfigStore } from './store'

export class ConfigToolSettingsStore {
  constructor(
    private readonly configStore: ConfigStore,
    private readonly onSaved?: (config: DesktopSettingsConfig) => void,
  ) {}

  getToolsEnabledByName(): DesktopSettingsConfig['tools']['enabledByName'] {
    return this.configStore.get().tools.enabledByName
  }

  updateToolsEnabledByName(enabledByName: DesktopSettingsConfig['tools']['enabledByName']): void {
    const config = this.configStore.get()
    config.tools.enabledByName = { ...enabledByName }
    const saved = this.configStore.save(config)
    this.onSaved?.(saved)
  }
}

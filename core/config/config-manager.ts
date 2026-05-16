import type { DesktopSettingsConfig } from '@shared/types/settings'
import { cloneConfig, cloneDefaultConfig, normalizeConfig } from './schema'

export class ConfigManager {
  private config: DesktopSettingsConfig = cloneDefaultConfig()

  get(): DesktopSettingsConfig {
    return cloneConfig(this.config)
  }

  update(nextConfig: Partial<DesktopSettingsConfig>): DesktopSettingsConfig {
    const { config } = normalizeConfig({
      ...this.config,
      ...nextConfig,
    })
    this.config = config
    return this.get()
  }
}

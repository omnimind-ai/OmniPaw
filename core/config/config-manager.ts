import { defaultConfig, type AppConfig } from './schema'

export class ConfigManager {
  private config: AppConfig = defaultConfig

  get(): AppConfig {
    return this.config
  }

  update(nextConfig: Partial<AppConfig>): AppConfig {
    this.config = {
      ...this.config,
      ...nextConfig,
    }

    return this.config
  }
}

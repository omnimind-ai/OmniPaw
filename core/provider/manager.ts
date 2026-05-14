import type { ProviderConfig } from '@shared/types/provider'

export class ProviderManager {
  private readonly providers: ProviderConfig[] = [
    {
      id: 'omniinfer-local',
      name: 'OmniInfer Local',
      type: 'omniinfer',
      baseUrl: 'http://localhost:11434/v1',
      enabled: true,
      models: [
        {
          id: 'local-small-model',
          name: 'Local Small Model',
          contextWindow: 8192,
        },
      ],
    },
    {
      id: 'openai-compatible',
      name: 'OpenAI Compatible',
      type: 'openai-compatible',
      baseUrl: 'https://api.openai.com/v1',
      enabled: false,
      models: [],
    },
  ]

  list(): ProviderConfig[] {
    return this.providers
  }
}

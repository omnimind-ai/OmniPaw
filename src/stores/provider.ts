import { defineStore } from 'pinia'
import { ref } from 'vue'

import { appBridge } from '@/bridge/app'
import type { ProviderConfig } from '@shared/types/provider'

export const useProviderStore = defineStore('provider', () => {
  const providers = ref<ProviderConfig[]>([])

  async function loadProviders(): Promise<void> {
    providers.value = await appBridge.provider.list()
  }

  return {
    providers,
    loadProviders,
  }
})

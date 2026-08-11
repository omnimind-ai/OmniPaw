import assert from 'node:assert/strict'

import type { SaveWebSearchSettingsRequest, WebSearchSettings } from '@shared/types/web-search'
import { createPinia, setActivePinia } from 'pinia'

const initialSettings: WebSearchSettings = {
  enabled: false,
  provider: 'tavily',
  maxResults: 5,
  searchDepth: 'basic',
  configuredProviders: {
    tavily: false,
    bocha: false,
    brave: false,
    firecrawl: false,
    baidu: false,
    exa: false,
  },
}

const saveRequests: SaveWebSearchSettingsRequest[] = []
let resolveSave: ((settings: WebSearchSettings) => void) | undefined

Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: {
    omniPaw: {
      webSearch: {
        getSettings: async () => initialSettings,
        saveSettings: (request: SaveWebSearchSettingsRequest) => {
          saveRequests.push(request)
          return new Promise<WebSearchSettings>((resolve) => {
            resolveSave = resolve
          })
        },
        test: async () => ({ ok: true, provider: 'tavily', resultCount: 1 }),
      },
    },
  },
})

async function runSmoke(): Promise<void> {
  setActivePinia(createPinia())
  const { useWebSearchStore } = await import('../../src/stores/web-search')
  const store = useWebSearchStore()

  await store.load()
  assert.equal(store.draft?.provider, 'tavily')

  store.updateDraft((draft) => {
    draft.provider = 'brave'
  })
  assert.equal(store.draft?.provider, 'brave')

  store.updateDraft((draft) => {
    draft.provider = 'exa'
  })
  assert.equal(store.draft?.provider, 'exa')
  assert.equal(store.settings?.provider, 'tavily')

  store.updateDraft((draft) => {
    draft.provider = 'tavily'
    draft.maxResults = 6
  })
  store.apiKey = 'first-key'
  const savePromise = store.save()
  await Promise.resolve()

  assert.equal(saveRequests.length, 1)
  assert.equal(saveRequests[0]?.maxResults, 6)
  assert.equal(saveRequests[0]?.apiKey, 'first-key')

  store.updateDraft((draft) => {
    draft.maxResults = 7
  })
  store.apiKey = 'replacement-key'
  resolveSave?.({
    ...initialSettings,
    maxResults: 6,
    configuredProviders: {
      ...initialSettings.configuredProviders,
      tavily: true,
    },
    updatedAt: 1,
  })
  await savePromise

  assert.equal(store.settings?.maxResults, 6)
  assert.equal(store.draft?.maxResults, 7)
  assert.equal(store.draft?.configuredProviders.tavily, true)
  assert.equal(store.apiKey, 'replacement-key')

  console.log('Web search store smoke check passed')
}

void runSmoke()

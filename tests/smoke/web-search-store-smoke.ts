import assert from 'node:assert/strict'

import { createPinia, setActivePinia } from 'pinia'

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

  console.log('Web search store smoke check passed')
}

void runSmoke()

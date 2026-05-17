import { onBeforeUnmount, type ComputedRef, type Ref } from 'vue'

export function useProviderAutosave(options: {
  canAutosave: ComputedRef<boolean>
  loadingDraft: Ref<boolean>
  saving: Ref<boolean>
  save: (options: { silent?: boolean }) => Promise<boolean>
}) {
  let autosaveTimer: ReturnType<typeof window.setTimeout> | undefined
  let autosavePromise: Promise<boolean> | undefined
  let autosaveQueued = false

  onBeforeUnmount(() => {
    void flushAutosave()
  })

  function queueAutosave() {
    if (options.loadingDraft.value || !options.canAutosave.value) {
      return
    }

    if (options.saving.value) {
      autosaveQueued = true
      return
    }

    scheduleAutosave()
  }

  function scheduleAutosave() {
    clearAutosaveTimer()

    autosaveTimer = window.setTimeout(() => {
      autosaveTimer = undefined
      autosavePromise = options.save({ silent: true }).finally(() => {
        autosavePromise = undefined
      })
    }, 500)
  }

  function clearAutosaveTimer() {
    if (!autosaveTimer) return
    window.clearTimeout(autosaveTimer)
    autosaveTimer = undefined
  }

  async function flushAutosave(): Promise<boolean> {
    clearAutosaveTimer()

    if (autosavePromise) {
      const saved = await autosavePromise
      clearAutosaveTimer()
      if (!saved) return false
    }

    if (!options.canAutosave.value || options.loadingDraft.value) {
      return true
    }

    return options.save({ silent: true })
  }

  function handleSaveSettled() {
    if (!autosaveQueued) return
    autosaveQueued = false
    scheduleAutosave()
  }

  return {
    clearAutosaveTimer,
    flushAutosave,
    handleSaveSettled,
    queueAutosave,
  }
}

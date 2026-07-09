<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import CompanionRoleSettingsForm from '@/components/settings/CompanionRoleSettingsForm.vue'
import { Skeleton } from '@/components/ui/skeleton'
import { useDelayedFlag } from '@/composables/useDelayedFlag'
import { useProviderStore } from '@/stores/provider'
import { useSettingsStore } from '@/stores/settings'
import { errorToText, useToast } from '@/utils/toast'

const settingsStore = useSettingsStore()
const providerStore = useProviderStore()
const toast = useToast()
const { t } = useI18n()

const { draft, config, loading, saving, error, persistenceAvailable } = storeToRefs(settingsStore)

let autosaveTimer: ReturnType<typeof window.setTimeout> | undefined
let autosavePromise: Promise<void> | undefined
let saveQueued = false

const hasChanges = computed(() => JSON.stringify(draft.value) !== JSON.stringify(config.value))
const showInitialSkeleton = useDelayedFlag(() => loading.value && !draft.value)

onMounted(async () => {
  const results = await Promise.allSettled([settingsStore.load(), providerStore.loadProviders()])
  results.forEach((result) => {
    if (result.status === 'rejected') {
      toast.error(errorToText(result.reason, t('roles.errors.loadFailed')))
    }
  })
})

watch(error, (value) => {
  if (value) {
    toast.error(errorToText(value, t('roles.errors.saveFailed')))
  }
})

onBeforeUnmount(() => {
  void flushAutosave()
  settingsStore.stopSettingsSubscription()
})

watch(
  () => draft.value,
  () => {
    if (
      loading.value ||
      !draft.value ||
      !config.value ||
      !hasChanges.value ||
      !persistenceAvailable.value
    ) {
      return
    }

    scheduleAutosave()
  },
  { deep: true }
)

function scheduleAutosave(): void {
  clearAutosaveTimer()

  autosaveTimer = window.setTimeout(() => {
    autosaveTimer = undefined
    autosavePromise = autosave().finally(() => {
      autosavePromise = undefined
    })
  }, 300)
}

function clearAutosaveTimer(): void {
  if (!autosaveTimer) return
  window.clearTimeout(autosaveTimer)
  autosaveTimer = undefined
}

async function flushAutosave(): Promise<void> {
  clearAutosaveTimer()

  if (autosavePromise) {
    await autosavePromise
    clearAutosaveTimer()
  }

  if (!draft.value || !config.value || !hasChanges.value || !persistenceAvailable.value) {
    return
  }

  autosavePromise = autosave().finally(() => {
    autosavePromise = undefined
  })
  await autosavePromise
}

async function autosave(): Promise<void> {
  if (!draft.value || !config.value || !hasChanges.value || !persistenceAvailable.value) {
    return
  }

  if (saving.value) {
    saveQueued = true
    return
  }

  saveQueued = false
  try {
    await settingsStore.save()
  } catch (err) {
    toast.error(errorToText(err, t('roles.errors.saveFailed')))
    return
  } finally {
    if (saveQueued || hasChanges.value) {
      scheduleAutosave()
    }
  }
}
</script>

<template>
  <main class="relative flex h-full min-h-0 flex-1 flex-col bg-muted/40">
    <div
      v-if="loading && !draft"
      class="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4 md:px-6 md:py-6"
    >
      <template v-if="showInitialSkeleton">
        <Skeleton class="h-32 w-full" />
        <Skeleton class="h-48 w-full" />
        <Skeleton class="h-24 w-full" />
      </template>
    </div>

    <div
      v-else-if="!draft"
      class="mx-auto mt-6 w-full max-w-6xl rounded-lg border bg-card px-4 py-6 text-sm text-muted-foreground"
    >
      {{ t('roles.notLoaded') }}
    </div>

    <CompanionRoleSettingsForm
      v-else
      :draft="draft"
      class="h-full min-h-0 flex-1"
    />
  </main>
</template>

<script setup lang="ts">
import { ImageIcon, PackagePlusIcon } from '@lucide/vue'
import type {
  CatAppearanceListResponse,
  CatAppearancePackSummary,
  CatAppearanceResolvedPack,
} from '@shared/types/cat-appearance'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  appBridge,
  type BridgeUnsubscribe,
  ensureElectronBridge,
  isFallbackBridge,
} from '@/bridge/app'
import SettingsSection from '@/components/settings/common/SettingsSection.vue'
import CompanionRoleAppearanceDetailPreview from '@/components/settings/companion-role-settings/CompanionRoleAppearanceDetailPreview.vue'
import { Button } from '@/components/ui/button'
import { errorToText, useToast } from '@/utils/toast'

const props = defineProps<{
  appearancePackId?: string
}>()

const emit = defineEmits<{
  'update:appearance-pack-id': [appearancePackId: string]
}>()

const { t } = useI18n()
const toast = useToast()
const response = shallowRef<CatAppearanceListResponse>()
const loading = ref(false)
const importing = ref(false)
const currentDetailLoading = ref(false)
const currentDetailError = ref<string>()
const currentDetail = shallowRef<CatAppearanceResolvedPack>()
let unsubscribe: BridgeUnsubscribe | undefined
let detailRequestId = 0

const packs = computed(() => response.value?.packs ?? [])
const importDisabled = computed(() => importing.value || loading.value || isFallbackBridge)
const importButtonLabel = computed(() =>
  importing.value ? t('settings.catAppearance.importing') : t('settings.catAppearance.importButton')
)
const activeRoleAppearancePackId = computed(() => props.appearancePackId || 'builtin')
const currentPack = computed<CatAppearancePackSummary | undefined>(() => {
  const packId = activeRoleAppearancePackId.value
  const summary = packs.value.find((pack) => pack.id === packId)
  if (summary) return summary
  if (currentDetail.value?.id === packId) return currentDetail.value
  if (packId === 'builtin') {
    return {
      id: 'builtin',
      name: 'OmniPaw Cat',
      source: 'builtin',
      status: 'available',
      active: true,
      updatedAt: response.value?.updatedAt,
    }
  }
  return {
    id: packId,
    name: packId,
    source: 'local',
    status: 'missing',
    active: false,
    error: t('settings.catAppearance.detail.unavailable'),
  }
})
onMounted(async () => {
  unsubscribe = appBridge.catAppearance.onChanged((event) => {
    response.value = event
    void loadCurrentDetail()
  })
  await loadPacks()
})

onBeforeUnmount(() => {
  unsubscribe?.()
  unsubscribe = undefined
})

watch(activeRoleAppearancePackId, () => {
  void loadCurrentDetail()
})

async function loadPacks(): Promise<void> {
  loading.value = true
  try {
    response.value = await appBridge.catAppearance.list()
    await loadCurrentDetail()
  } catch (error) {
    toast.error(errorToText(error, t('settings.catAppearance.toasts.loadFailed')))
  } finally {
    loading.value = false
  }
}

async function importPack(): Promise<void> {
  if (importing.value) return

  try {
    ensureElectronBridge(t('settings.catAppearance.importButton'))
  } catch (error) {
    toast.error(errorToText(error, t('settings.catAppearance.bridgeNotReady')))
    return
  }

  importing.value = true
  try {
    const result = await appBridge.catAppearance.importPack()
    response.value = result
    if (result.canceled) {
      return
    }

    if (result.importedPackId) {
      emit('update:appearance-pack-id', result.importedPackId)
    }
    await loadCurrentDetail(result.importedPackId)
    const importedPack = result.packs.find((pack) => pack.id === result.importedPackId)
    toast.success(t('settings.catAppearance.toasts.imported'), {
      description: importedPack?.name,
    })
  } catch (error) {
    toast.error(errorToText(error, t('settings.catAppearance.toasts.importFailed')))
  } finally {
    importing.value = false
  }
}

async function loadCurrentDetail(packId = activeRoleAppearancePackId.value): Promise<void> {
  const requestId = detailRequestId + 1
  detailRequestId = requestId
  currentDetailLoading.value = true
  currentDetailError.value = undefined
  try {
    const resolvedPack = await appBridge.catAppearance.getPack({
      packId,
    })
    if (detailRequestId !== requestId) return
    currentDetail.value = resolvedPack
  } catch (error) {
    if (detailRequestId !== requestId) return
    currentDetail.value = undefined
    currentDetailError.value = errorToText(error, t('settings.catAppearance.detail.loadFailed'))
  } finally {
    if (detailRequestId === requestId) {
      currentDetailLoading.value = false
    }
  }
}
</script>

<template>
  <SettingsSection
    :title="t('settings.catAppearance.role.sections.appearance.title')"
    :icon="ImageIcon"
    content-class="p-4 sm:p-5"
  >
    <div class="flex flex-col gap-4">
      <div class="flex min-w-0 flex-col gap-3 border-b pb-4 md:flex-row md:items-start md:justify-between">
        <div class="flex min-w-0 flex-col gap-1">
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <h3 class="truncate text-lg font-semibold leading-7">
              {{ currentPack?.name || activeRoleAppearancePackId }}
            </h3>
          </div>
          <p
            v-if="currentPack?.error || currentDetailError"
            class="line-clamp-2 text-sm text-destructive"
          >
            {{ currentPack?.error || currentDetailError }}
          </p>
        </div>

        <Button
          type="button"
          class="w-fit shrink-0"
          :disabled="importDisabled"
          @click="importPack"
        >
          <PackagePlusIcon data-icon="inline-start" />
          {{ importButtonLabel }}
        </Button>
      </div>

      <CompanionRoleAppearanceDetailPreview
        :pack="currentPack"
        :detail="currentDetail"
        :loading="loading || currentDetailLoading"
        :error="currentDetailError"
      />
    </div>
  </SettingsSection>
</template>

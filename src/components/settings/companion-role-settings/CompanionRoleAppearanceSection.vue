<script setup lang="ts">
import type {
  CatAppearanceListResponse,
  CatAppearancePackSource,
  CatAppearancePackSummary,
  CatAppearanceResolvedPack,
} from '@shared/types/cat-appearance'
import { ImageIcon, PackagePlusIcon } from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  appBridge,
  type BridgeUnsubscribe,
  ensureElectronBridge,
  isFallbackBridge,
} from '@/bridge/app'
import SettingEntry from '@/components/settings/common/SettingEntry.vue'
import SettingsSection from '@/components/settings/common/SettingsSection.vue'
import CompanionRoleAppearanceDetailPreview from '@/components/settings/companion-role-settings/CompanionRoleAppearanceDetailPreview.vue'
import { Badge, type BadgeVariants } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FieldGroup } from '@/components/ui/field'
import { errorToText, useToast } from '@/utils/toast'

type BadgeVariant = NonNullable<BadgeVariants['variant']>

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
const currentSourceLabel = computed(() => sourceLabel(currentPack.value?.source ?? 'builtin'))
const currentStatusLabel = computed(() =>
  t(`settings.catAppearance.status.${currentPack.value?.status ?? 'available'}`)
)
const currentUpdatedLabel = computed(() =>
  t('settings.catAppearance.meta.updatedAt', {
    time: formatUpdatedAt(currentPack.value?.updatedAt ?? currentDetail.value?.updatedAt),
  })
)

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
    await loadCurrentDetail()
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

async function loadCurrentDetail(): Promise<void> {
  const requestId = detailRequestId + 1
  detailRequestId = requestId
  currentDetailLoading.value = true
  currentDetailError.value = undefined
  try {
    const resolvedPack = await appBridge.catAppearance.getPack({
      packId: activeRoleAppearancePackId.value,
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

function statusVariant(pack: CatAppearancePackSummary): BadgeVariant {
  if (pack.status === 'invalid' || pack.status === 'missing') return 'destructive'
  return 'secondary'
}

function sourceLabel(source: CatAppearancePackSource): string {
  return t(`settings.catAppearance.source.${source}`)
}

function sourceVariant(source: CatAppearancePackSource): BadgeVariant {
  return source === 'builtin' ? 'secondary' : 'outline'
}

function formatUpdatedAt(value?: number): string {
  if (!value) return t('settings.catAppearance.neverUpdated')
  return new Date(value).toLocaleString()
}
</script>

<template>
  <SettingsSection
    :title="t('settings.catAppearance.role.sections.appearance.title')"
    :description="t('settings.catAppearance.role.sections.appearance.description')"
    :icon="ImageIcon"
  >
    <FieldGroup class="gap-0">
      <SettingEntry
        control-id="settings-companion-role-appearance-current"
        :title="t('settings.catAppearance.role.fields.appearance.title')"
        :description="t('settings.catAppearance.role.fields.appearance.description')"
      >
        <div class="flex w-full min-w-0 flex-col gap-3 md:w-[32rem]">
          <div class="flex min-w-0 items-start gap-3 rounded-md border bg-background/60 p-3">
            <div class="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <ImageIcon />
            </div>
            <div class="flex min-w-0 flex-1 flex-col gap-1">
              <div class="flex min-w-0 flex-wrap items-center gap-2">
                <p class="truncate text-sm font-medium">
                  {{ currentPack?.name || activeRoleAppearancePackId }}
                </p>
                <Badge
                  v-if="currentPack"
                  :variant="statusVariant(currentPack)"
                >
                  {{ currentStatusLabel }}
                </Badge>
                <Badge
                  v-if="currentPack"
                  :variant="sourceVariant(currentPack.source)"
                >
                  {{ currentSourceLabel }}
                </Badge>
              </div>
              <p class="text-sm text-muted-foreground">
                {{ currentUpdatedLabel }}
              </p>
              <p
                v-if="currentPack?.error || currentDetailError"
                class="line-clamp-2 text-sm text-destructive"
              >
                {{ currentPack?.error || currentDetailError }}
              </p>
            </div>
          </div>

          <Button
            type="button"
            class="w-fit"
            :disabled="importDisabled"
            @click="importPack"
          >
            <PackagePlusIcon data-icon="inline-start" />
            {{ importButtonLabel }}
          </Button>
        </div>
      </SettingEntry>
    </FieldGroup>
  </SettingsSection>

  <CompanionRoleAppearanceDetailPreview
    :pack="currentPack"
    :detail="currentDetail"
    :loading="loading || currentDetailLoading"
    :error="currentDetailError"
  />
</template>

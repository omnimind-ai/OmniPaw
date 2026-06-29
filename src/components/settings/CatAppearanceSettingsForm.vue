<script setup lang="ts">
import type {
  CatAppearanceListResponse,
  CatAppearancePackSource,
  CatAppearancePackSummary,
} from '@shared/types/cat-appearance'
import {
  CatIcon,
  CheckIcon,
  CircleAlertIcon,
  ImageIcon,
  PackagePlusIcon,
  RefreshCwIcon,
  SearchIcon,
  XIcon,
} from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  appBridge,
  type BridgeUnsubscribe,
  ensureElectronBridge,
  isFallbackBridge,
} from '@/bridge/app'
import SettingsPanelHeader from '@/components/settings/common/SettingsPanelHeader.vue'
import SettingsPanelItem from '@/components/settings/common/SettingsPanelItem.vue'
import SettingsSearchBar from '@/components/settings/common/SettingsSearchBar.vue'
import { Badge, type BadgeVariants } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useDelayedFlag } from '@/composables/useDelayedFlag'
import { errorToText, useToast } from '@/utils/toast'

type BadgeVariant = NonNullable<BadgeVariants['variant']>

const { t } = useI18n()
const toast = useToast()

const response = shallowRef<CatAppearanceListResponse>()
const searchQuery = ref('')
const loading = ref(false)
const refreshing = ref(false)
const importing = ref(false)
const selectingPackId = ref<string>()
const showSkeleton = useDelayedFlag(() => loading.value)
let unsubscribe: BridgeUnsubscribe | undefined

const packs = computed(() => response.value?.packs ?? [])
const availableCount = computed(
  () => packs.value.filter((pack) => pack.status === 'available').length
)
const localCount = computed(() => packs.value.filter((pack) => pack.source === 'local').length)
const filteredPacks = computed(() => {
  const query = normalizeSearchText(searchQuery.value)
  if (!query) return packs.value
  return packs.value.filter((pack) =>
    normalizeSearchText(
      [
        pack.id,
        pack.name,
        pack.description,
        pack.rootName,
        pack.relativePath,
        pack.error,
        sourceLabel(pack.source),
        statusLabel(pack),
      ]
        .filter(Boolean)
        .join(' ')
    ).includes(query)
  )
})
const searchEmpty = computed(() => packs.value.length > 0 && filteredPacks.value.length === 0)
const importDisabled = computed(() => importing.value || loading.value || isFallbackBridge)
const refreshButtonLabel = computed(() =>
  refreshing.value
    ? t('settings.catAppearance.refreshing')
    : t('settings.catAppearance.refreshButton')
)
const importButtonLabel = computed(() =>
  importing.value ? t('settings.catAppearance.importing') : t('settings.catAppearance.importButton')
)

onMounted(async () => {
  unsubscribe = appBridge.catAppearance.onChanged((event) => {
    response.value = event
  })
  await loadPacks()
})

onBeforeUnmount(() => {
  unsubscribe?.()
  unsubscribe = undefined
})

async function loadPacks(): Promise<void> {
  loading.value = true
  try {
    response.value = await appBridge.catAppearance.list()
  } catch (error) {
    toast.error(errorToText(error, t('settings.catAppearance.toasts.loadFailed')))
  } finally {
    loading.value = false
  }
}

async function refreshPacks(): Promise<void> {
  refreshing.value = true
  try {
    response.value = await appBridge.catAppearance.refresh()
    toast.success(t('settings.catAppearance.toasts.refreshed'))
  } catch (error) {
    toast.error(errorToText(error, t('settings.catAppearance.toasts.refreshFailed')))
  } finally {
    refreshing.value = false
  }
}

async function importPack(): Promise<void> {
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

async function selectPack(pack: CatAppearancePackSummary): Promise<void> {
  if (pack.active || pack.status !== 'available') {
    return
  }

  selectingPackId.value = pack.id
  try {
    await appBridge.catAppearance.setActive({ packId: pack.id })
    response.value = await appBridge.catAppearance.list()
    toast.success(t('settings.catAppearance.toasts.selected'), {
      description: pack.name,
    })
  } catch (error) {
    toast.error(errorToText(error, t('settings.catAppearance.toasts.selectFailed')))
  } finally {
    selectingPackId.value = undefined
  }
}

function normalizeSearchText(value: string): string {
  return value.trim().toLocaleLowerCase()
}

function clearSearch(): void {
  searchQuery.value = ''
}

function statusLabel(pack: CatAppearancePackSummary): string {
  if (pack.active) return t('settings.catAppearance.status.active')
  return t(`settings.catAppearance.status.${pack.status}`)
}

function statusVariant(pack: CatAppearancePackSummary): BadgeVariant {
  if (pack.active) return 'default'
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

function packMeta(pack: CatAppearancePackSummary): string {
  const parts = [
    t('settings.catAppearance.meta.id', { id: pack.id }),
    pack.rootName ? t('settings.catAppearance.meta.directory', { directory: pack.rootName }) : '',
    t('settings.catAppearance.meta.updatedAt', { time: formatUpdatedAt(pack.updatedAt) }),
  ].filter(Boolean)
  return parts.join(' · ')
}

function selectButtonLabel(pack: CatAppearancePackSummary): string {
  return selectingPackId.value === pack.id
    ? t('settings.catAppearance.selecting')
    : t('settings.catAppearance.selectButton')
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
    <Card class="grid h-full min-h-0 flex-1 grid-rows-[auto_auto_minmax(0,1fr)] gap-0 rounded-md border border-border py-0 ring-0">
      <SettingsPanelHeader
        :title="t('settings.catAppearance.title')"
        :description="t('settings.catAppearance.description')"
        :icon="CatIcon"
      />

      <SettingsSearchBar
        v-model="searchQuery"
        class="border-b-0"
        :label="t('settings.catAppearance.searchLabel')"
        :placeholder="t('settings.catAppearance.searchPlaceholder')"
        :clear-label="t('settings.catAppearance.clearSearchLabel')"
        :disabled="loading"
        @clear="clearSearch"
      >
        <template #summary>
          <Badge variant="secondary">
            {{ t('settings.catAppearance.packCount', { count: packs.length }) }}
          </Badge>
        </template>

        <template #actions>
          <Button
            type="button"
            variant="outline"
            :disabled="refreshing || loading"
            @click="refreshPacks"
          >
            <RefreshCwIcon data-icon="inline-start" />
            {{ refreshButtonLabel }}
          </Button>
          <Button
            type="button"
            :disabled="importDisabled"
            @click="importPack"
          >
            <PackagePlusIcon data-icon="inline-start" />
            {{ importButtonLabel }}
          </Button>
        </template>
      </SettingsSearchBar>

      <CardContent class="flex min-h-0 flex-1 flex-col overflow-y-auto p-0">
        <div class="flex min-h-full flex-1 flex-col">
          <div
            v-if="loading"
            class="flex shrink-0 flex-col gap-3 px-4 py-4 sm:px-5"
          >
            <template v-if="showSkeleton">
              <Skeleton class="h-24 w-full" />
              <Skeleton class="h-24 w-full" />
            </template>
          </div>

          <div
            v-else-if="!packs.length"
            class="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-10 text-center text-sm text-muted-foreground sm:px-5"
          >
            <ImageIcon class="size-8 opacity-50" />
            <div class="flex flex-col gap-1">
              <p class="font-medium text-foreground">{{ t('settings.catAppearance.emptyTitle') }}</p>
              <p>{{ t('settings.catAppearance.emptyHint') }}</p>
            </div>
            <Button
              type="button"
              :disabled="importDisabled"
              @click="importPack"
            >
              <PackagePlusIcon data-icon="inline-start" />
              {{ t('settings.catAppearance.importButton') }}
            </Button>
          </div>

          <div
            v-else-if="searchEmpty"
            class="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-10 text-center text-sm text-muted-foreground sm:px-5"
          >
            <SearchIcon class="size-8 opacity-50" />
            <div class="flex flex-col gap-1">
              <p class="font-medium text-foreground">{{ t('settings.catAppearance.noMatch') }}</p>
              <p>{{ t('settings.catAppearance.noMatchHint') }}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              @click="clearSearch"
            >
              <XIcon data-icon="inline-start" />
              {{ t('settings.catAppearance.clearSearch') }}
            </Button>
          </div>

          <div
            v-else
            class="flex flex-col gap-3 px-4 py-4 sm:px-5"
          >
            <SettingsPanelItem
              v-for="pack in filteredPacks"
              :key="pack.id"
              :title="pack.name"
              :description="pack.description"
              :icon="ImageIcon"
              :pending="selectingPackId === pack.id"
            >
              <template #badges>
                <Badge :variant="statusVariant(pack)">
                  {{ statusLabel(pack) }}
                </Badge>
                <Badge :variant="sourceVariant(pack.source)">
                  {{ sourceLabel(pack.source) }}
                </Badge>
              </template>

              <template #meta>
                <p class="text-sm text-muted-foreground">
                  {{ packMeta(pack) }}
                </p>
                <p
                  v-if="pack.error"
                  class="line-clamp-2 text-sm text-destructive"
                >
                  {{ pack.error }}
                </p>
              </template>

              <template #actions>
                <Button
                  v-if="pack.status !== 'available'"
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled
                >
                  <CircleAlertIcon data-icon="inline-start" />
                  {{ t('settings.catAppearance.unavailable') }}
                </Button>
                <Button
                  v-else-if="pack.active"
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled
                >
                  <CheckIcon data-icon="inline-start" />
                  {{ t('settings.catAppearance.currentPack') }}
                </Button>
                <Button
                  v-else
                  type="button"
                  variant="outline"
                  size="sm"
                  :disabled="selectingPackId === pack.id"
                  @click="selectPack(pack)"
                >
                  <CheckIcon data-icon="inline-start" />
                  {{ selectButtonLabel(pack) }}
                </Button>
              </template>
            </SettingsPanelItem>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
import type {
  CatAppearanceListResponse,
  CatAppearancePackSource,
  CatAppearancePackSummary,
  CatAppearanceResolvedPack,
} from '@shared/types/cat-appearance'
import {
  ArrowLeftIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleAlertIcon,
  ImageIcon,
  InfoIcon,
  PackagePlusIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  Trash2Icon,
  UserRoundIcon,
  XIcon,
} from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import type { BridgeDesktopSettingsConfig } from '@/bridge/app'
import {
  appBridge,
  type BridgeUnsubscribe,
  ensureElectronBridge,
  isFallbackBridge,
} from '@/bridge/app'
import CatAppearanceDeleteModal from '@/components/settings/cat-appearance-settings/CatAppearanceDeleteModal.vue'
import CatAppearanceDetailModal from '@/components/settings/cat-appearance-settings/CatAppearanceDetailModal.vue'
import SettingsPanelHeader from '@/components/settings/common/SettingsPanelHeader.vue'
import SettingsPanelItem from '@/components/settings/common/SettingsPanelItem.vue'
import SettingsSearchBar from '@/components/settings/common/SettingsSearchBar.vue'
import CompanionRoleEditor from '@/components/settings/companion-role-settings/CompanionRoleEditor.vue'
import { Badge, type BadgeVariants } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { Skeleton } from '@/components/ui/skeleton'
import { useDelayedFlag } from '@/composables/useDelayedFlag'
import { errorToText, useToast } from '@/utils/toast'

type BadgeVariant = NonNullable<BadgeVariants['variant']>
type CompanionRole = BridgeDesktopSettingsConfig['app']['companionRoles'][number]
type RoleWorkspacePane = 'appearance' | 'role'

const props = defineProps<{
  draft: BridgeDesktopSettingsConfig
}>()

const { t } = useI18n()
const router = useRouter()
const toast = useToast()

const response = shallowRef<CatAppearanceListResponse>()
const activePane = ref<RoleWorkspacePane>('role')
const rolesOpen = ref(true)
const searchQuery = ref('')
const loading = ref(false)
const refreshing = ref(false)
const importing = ref(false)
const selectingPackId = ref<string>()
const deletingPackId = ref<string>()
const deleteOpen = ref(false)
const deleteTarget = shallowRef<CatAppearancePackSummary>()
const detailOpen = ref(false)
const detailLoading = ref(false)
const detailError = ref<string>()
const detailSummary = shallowRef<CatAppearancePackSummary>()
const detailPack = shallowRef<CatAppearanceResolvedPack>()
const showSkeleton = useDelayedFlag(() => loading.value)
let unsubscribe: BridgeUnsubscribe | undefined
let detailRequestId = 0

const roles = computed(() => props.draft.app.companionRoles)
const activeRoleId = computed(() => props.draft.app.activeCompanionRoleId)
const activeRole = computed(
  () => roles.value.find((role) => role.id === activeRoleId.value) ?? roles.value[0]
)
const canDeleteRole = computed(() => roles.value.length > 1)
const packs = computed(() => response.value?.packs ?? [])
const filteredPacks = computed(() => {
  const query = normalizeSearchText(searchQuery.value)
  if (!query) return packs.value
  return packs.value.filter((pack) =>
    normalizeSearchText(
      [pack.name, pack.description, pack.error, sourceLabel(pack.source), statusLabel(pack)]
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
const activeRoleAppearancePackId = computed(() => activeRole.value?.appearancePackId || 'builtin')

onMounted(async () => {
  unsubscribe = appBridge.catAppearance.onChanged((event) => {
    response.value = event
    if (!detailSummary.value) return
    detailSummary.value =
      event.packs.find((pack) => pack.id === detailSummary.value?.id) ?? detailSummary.value
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
  if (pack.id === activeRoleAppearancePackId.value || pack.status !== 'available') {
    return
  }

  selectingPackId.value = pack.id
  try {
    if (activeRole.value) {
      activeRole.value.appearancePackId = pack.id
    }
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

async function openDetail(pack: CatAppearancePackSummary): Promise<void> {
  const requestId = detailRequestId + 1
  detailRequestId = requestId
  detailSummary.value = pack
  detailPack.value = undefined
  detailError.value = undefined
  detailLoading.value = false
  detailOpen.value = true

  if (pack.status !== 'available') {
    detailError.value = pack.error || t('settings.catAppearance.detail.unavailable')
    return
  }

  detailLoading.value = true
  try {
    const resolvedPack = await appBridge.catAppearance.getPack({ packId: pack.id })
    if (detailRequestId !== requestId) return
    detailPack.value = resolvedPack
  } catch (error) {
    if (detailRequestId !== requestId) return
    detailError.value = errorToText(error, t('settings.catAppearance.detail.loadFailed'))
  } finally {
    if (detailRequestId === requestId) {
      detailLoading.value = false
    }
  }
}

function selectAppearanceLibrary(): void {
  activePane.value = 'appearance'
}

function selectRole(target: CompanionRole): void {
  props.draft.app.activeCompanionRoleId = target.id
  activePane.value = 'role'
  rolesOpen.value = true
}

function createRole(): void {
  const nextRole = createCompanionRole()
  roles.value.push(nextRole)
  props.draft.app.activeCompanionRoleId = nextRole.id
  activePane.value = 'role'
  rolesOpen.value = true
}

function duplicateActiveRole(): void {
  if (!activeRole.value) return
  const nextRole: CompanionRole = {
    ...activeRole.value,
    id: createRoleId(),
    name: t('settings.catAppearance.role.copyName', {
      name: activeRole.value.name || defaultRoleName(),
    }),
    advanced: { ...activeRole.value.advanced },
  }
  roles.value.push(nextRole)
  props.draft.app.activeCompanionRoleId = nextRole.id
  activePane.value = 'role'
}

function deleteRole(target: CompanionRole): void {
  if (!canDeleteRole.value) return
  const index = roles.value.findIndex((item) => item.id === target.id)
  if (index < 0) return
  roles.value.splice(index, 1)
  if (props.draft.app.activeCompanionRoleId === target.id) {
    props.draft.app.activeCompanionRoleId =
      roles.value[Math.max(0, index - 1)]?.id ?? roles.value[0]?.id ?? ''
  }
}

function createCompanionRole(): CompanionRole {
  return {
    id: createRoleId(),
    enabled: true,
    name: defaultRoleName(),
    appearancePackId: 'builtin',
    userNickname: '',
    personality: '',
    speechStyle: '',
    relationship: '',
    background: '',
    greeting: '',
    proactiveStyle: '',
    interactionMode: 'companion',
    advanced: {
      enabled: false,
      systemPrompt: '',
      knowledge: '',
      exampleDialogue: '',
      finalInstructions: '',
    },
    defaultProviderId: undefined,
    defaultModelId: undefined,
  }
}

function createRoleId(): string {
  return `role-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function defaultRoleName(): string {
  return t('settings.catAppearance.role.newRoleName')
}

function normalizeSearchText(value: string): string {
  return value.trim().toLocaleLowerCase()
}

function clearSearch(): void {
  searchQuery.value = ''
}

function statusLabel(pack: CatAppearancePackSummary): string {
  if (pack.id === activeRoleAppearancePackId.value) return t('settings.catAppearance.status.active')
  return t(`settings.catAppearance.status.${pack.status}`)
}

function statusVariant(pack: CatAppearancePackSummary): BadgeVariant {
  if (pack.id === activeRoleAppearancePackId.value) return 'default'
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
  return t('settings.catAppearance.meta.updatedAt', { time: formatUpdatedAt(pack.updatedAt) })
}

function selectButtonLabel(pack: CatAppearancePackSummary): string {
  return selectingPackId.value === pack.id
    ? t('settings.catAppearance.selecting')
    : t('settings.catAppearance.selectButton')
}

function deleteButtonLabel(pack: CatAppearancePackSummary): string {
  return deletingPackId.value === pack.id
    ? t('settings.catAppearance.deleting')
    : t('settings.catAppearance.deleteButton')
}

function openDeletePack(pack: CatAppearancePackSummary): void {
  if (pack.source !== 'local') {
    return
  }
  deleteTarget.value = pack
  deleteOpen.value = true
}

async function confirmDeletePack(): Promise<void> {
  const pack = deleteTarget.value
  if (!pack || pack.source !== 'local') {
    return
  }

  try {
    ensureElectronBridge(t('settings.catAppearance.deleteButton'))
  } catch (error) {
    toast.error(errorToText(error, t('settings.catAppearance.bridgeNotReady')))
    return
  }

  deletingPackId.value = pack.id
  try {
    const result = await appBridge.catAppearance.deletePack({
      packId: pack.id,
      rootName: pack.rootName,
    })
    response.value = result
    deleteOpen.value = false
    deleteTarget.value = undefined
    if (detailSummary.value?.id === pack.id) {
      detailOpen.value = false
      detailSummary.value = undefined
      detailPack.value = undefined
      detailError.value = undefined
    }
    toast.success(t('settings.catAppearance.toasts.deleted'), {
      description: pack.name,
    })
  } catch (error) {
    toast.error(errorToText(error, t('settings.catAppearance.toasts.deleteFailed')))
  } finally {
    deletingPackId.value = undefined
  }
}
</script>

<template>
  <SidebarProvider class="h-full min-h-0 w-full">
    <Sidebar
      collapsible="offcanvas"
      class="border-r"
    >
      <SidebarHeader>
        <div class="flex items-center gap-2">
          <SidebarTrigger class="md:hidden" />
          <Button
            variant="ghost"
            size="icon-sm"
            :aria-label="t('settings.sidebar.backToChat')"
            @click="router.push('/')"
          >
            <ArrowLeftIcon />
          </Button>
          <span class="truncate text-sm font-medium">{{ t('settings.catAppearance.title') }}</span>
        </div>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  :is-active="activePane === 'appearance'"
                  :tooltip="t('settings.catAppearance.library.title')"
                  @click="selectAppearanceLibrary"
                >
                  <ImageIcon />
                  <span>{{ t('settings.catAppearance.library.title') }}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <Collapsible v-model:open="rolesOpen">
          <SidebarGroup>
            <div class="flex items-center justify-between gap-2 px-2">
              <button
                type="button"
                class="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium text-sidebar-foreground outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2"
                @click="rolesOpen = !rolesOpen"
              >
                <ChevronDownIcon
                  class="transition-transform"
                  :class="rolesOpen ? '' : '-rotate-90'"
                />
                <span class="truncate">{{ t('settings.catAppearance.role.listTitle') }}</span>
                <Badge
                  variant="outline"
                  class="ml-auto"
                >
                  {{ roles.length }}
                </Badge>
              </button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                :aria-label="t('settings.catAppearance.role.actions.add')"
                @click="createRole"
              >
                <PlusIcon />
              </Button>
            </div>

            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem
                    v-for="item in roles"
                    :key="item.id"
                  >
                    <SidebarMenuButton
                      size="lg"
                      :is-active="activePane === 'role' && item.id === activeRoleId"
                      :tooltip="item.name || t('settings.catAppearance.role.unnamed')"
                      @click="selectRole(item)"
                    >
                      <UserRoundIcon />
                      <span>
                        {{ item.name || t('settings.catAppearance.role.unnamed') }}
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </SidebarGroup>
        </Collapsible>
      </SidebarContent>
    </Sidebar>

    <SidebarInset class="h-full overflow-hidden">
      <main class="relative flex h-full min-h-0 flex-1 flex-col bg-muted/40">
        <SidebarTrigger class="absolute left-3 top-3 md:hidden" />

        <div class="mx-auto flex h-full min-h-0 w-full max-w-6xl flex-1 flex-col overflow-hidden px-4 py-4 md:px-6 md:py-6">
          <Card
            v-if="activePane === 'appearance'"
            class="grid h-full min-h-0 flex-1 grid-rows-[auto_auto_minmax(0,1fr)] gap-0 rounded-md border border-border py-0 ring-0"
          >
            <SettingsPanelHeader
              :title="t('settings.catAppearance.library.title')"
              :description="t('settings.catAppearance.library.description')"
              :icon="ImageIcon"
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
                        type="button"
                        variant="outline"
                        size="sm"
                        @click="openDetail(pack)"
                      >
                        <InfoIcon data-icon="inline-start" />
                        {{ t('settings.catAppearance.detailButton') }}
                      </Button>
                      <Button
                        v-if="pack.source === 'local'"
                        type="button"
                        variant="outline"
                        size="sm"
                        :disabled="deletingPackId === pack.id"
                        @click="openDeletePack(pack)"
                      >
                        <Trash2Icon data-icon="inline-start" />
                        {{ deleteButtonLabel(pack) }}
                      </Button>
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
                        v-else-if="pack.id === activeRoleAppearancePackId"
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

          <CompanionRoleEditor
            v-else-if="activeRole"
            :role="activeRole"
            :can-delete-role="canDeleteRole"
            :appearance-packs="packs"
            :appearance-loading="loading"
            @duplicate-role="duplicateActiveRole"
            @delete-role="deleteRole"
            @import-appearance="importPack"
          />
        </div>
      </main>
    </SidebarInset>

    <CatAppearanceDetailModal
      v-model:open="detailOpen"
      :pack="detailSummary"
      :detail="detailPack"
      :loading="detailLoading"
      :error="detailError"
    />

    <CatAppearanceDeleteModal
      v-model:open="deleteOpen"
      :pack="deleteTarget"
      :pending="Boolean(deletingPackId)"
      @delete="confirmDeletePack"
    />
  </SidebarProvider>
</template>

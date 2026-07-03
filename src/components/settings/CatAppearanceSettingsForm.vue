<script setup lang="ts">
import type { CatAppearanceListResponse } from '@shared/types/cat-appearance'
import { ArrowLeftIcon, ChevronDownIcon, PlusIcon, UserRoundIcon } from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import type { BridgeDesktopSettingsConfig } from '@/bridge/app'
import { appBridge, type BridgeUnsubscribe, ensureElectronBridge } from '@/bridge/app'
import CompanionRoleEditor from '@/components/settings/companion-role-settings/CompanionRoleEditor.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { errorToText, useToast } from '@/utils/toast'

type CompanionRole = BridgeDesktopSettingsConfig['app']['companionRoles'][number]

const props = defineProps<{
  draft: BridgeDesktopSettingsConfig
}>()

const { t } = useI18n()
const router = useRouter()
const toast = useToast()

const response = shallowRef<CatAppearanceListResponse>()
const rolesOpen = ref(true)
const loading = ref(false)
const importing = ref(false)
let unsubscribe: BridgeUnsubscribe | undefined

const roles = computed(() => props.draft.app.companionRoles)
const activeRoleId = computed(() => props.draft.app.activeCompanionRoleId)
const activeRole = computed(
  () => roles.value.find((role) => role.id === activeRoleId.value) ?? roles.value[0]
)
const canDeleteRole = computed(() => roles.value.length > 1)
const packs = computed(() => response.value?.packs ?? [])

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

function selectRole(target: CompanionRole): void {
  props.draft.app.activeCompanionRoleId = target.id
  rolesOpen.value = true
}

function createRole(): void {
  const nextRole = createCompanionRole()
  roles.value.push(nextRole)
  props.draft.app.activeCompanionRoleId = nextRole.id
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
                      :is-active="item.id === activeRoleId"
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
          <CompanionRoleEditor
            v-if="activeRole"
            :role="activeRole"
            :can-delete-role="canDeleteRole"
            :appearance-packs="packs"
            :appearance-loading="loading || importing"
            @duplicate-role="duplicateActiveRole"
            @delete-role="deleteRole"
            @import-appearance="importPack"
          />
        </div>
      </main>
    </SidebarInset>
  </SidebarProvider>
</template>

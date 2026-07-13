<script setup lang="ts">
import { CloudIcon, PlusIcon, SearchIcon, Trash2Icon } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { BridgeProviderPreset } from '@/bridge/app'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { cn } from '@/lib/utils'
import type { ProviderSidebarItem } from './types'

const { t } = useI18n()

const props = defineProps<{
  activeProviderId: string
  loading: boolean
  persistenceAvailable: boolean
  saving: boolean
  presetsLoading: boolean
  providerPresets: BridgeProviderPreset[]
  providerSidebarList: ProviderSidebarItem[]
  searchQuery: string
}>()

const emit = defineEmits<{
  'update:searchQuery': [value: string]
  'create-from-preset': [preset: BridgeProviderPreset]
  'delete-provider': [provider: ProviderSidebarItem]
  'select-provider': [provider: ProviderSidebarItem]
}>()

const localSearchQuery = computed({
  get: () => props.searchQuery,
  set: (value: string) => emit('update:searchQuery', value),
})

const hasSearchQuery = computed(() => Boolean(localSearchQuery.value.trim()))
</script>

<template>
  <aside
    data-sidebar="sidebar"
    data-slot="sidebar-inner"
    class="flex min-h-0 w-full shrink-0 flex-col overflow-hidden rounded-md border bg-sidebar text-sidebar-foreground lg:sticky lg:top-6 lg:h-[calc(100svh-var(--app-topbar-height)-3rem)] lg:w-80"
  >
    <div class="flex items-center gap-2 border-b p-3">
      <InputGroup class="min-w-0 flex-1">
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          v-model="localSearchQuery"
          :aria-label="t('settings.provider.search.placeholder')"
          :placeholder="t('settings.provider.search.placeholder')"
        />
      </InputGroup>

      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button
            variant="outline"
            size="icon"
            :aria-label="t('settings.provider.createNew')"
            :disabled="saving || presetsLoading"
          >
            <PlusIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          class="w-64"
        >
          <DropdownMenuGroup>
            <DropdownMenuItem
              v-if="presetsLoading"
              disabled
            >
              {{ t('settings.provider.presetsLoading') }}
            </DropdownMenuItem>
            <DropdownMenuItem
              v-else-if="!providerPresets.length"
              disabled
            >
              {{ t('settings.provider.noPresets') }}
            </DropdownMenuItem>
            <template v-else>
              <DropdownMenuItem
                v-for="preset in providerPresets"
                :key="preset.id"
                class="items-start gap-2"
                @select="emit('create-from-preset', preset)"
              >
                <CloudIcon class="mt-0.5" />
                <span class="min-w-0 flex-1">
                  <span class="block truncate font-medium">{{ preset.name }}</span>
                  <span class="block truncate text-xs text-muted-foreground">{{ preset.baseUrl }}</span>
                </span>
              </DropdownMenuItem>
            </template>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto p-2">
      <div
        v-if="loading"
        class="rounded-lg border px-3 py-2 text-sm text-muted-foreground"
      >
        {{ t('settings.provider.loading') }}
      </div>

      <div
        v-else-if="!providerSidebarList.length"
        class="rounded-lg border px-3 py-2 text-sm text-muted-foreground"
      >
        {{ hasSearchQuery ? t('settings.provider.search.noResults') : t('settings.provider.search.empty') }}
      </div>

      <div
        v-else
        class="flex flex-col gap-1"
      >
        <div
          v-for="provider in providerSidebarList"
          :key="provider.unsaved ? `draft-${provider.id}` : provider.id"
          :class="cn(
            'group flex h-11 w-full items-center gap-1 rounded-lg text-sm transition-colors',
            provider.id === activeProviderId
              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
              : 'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
          )"
        >
          <button
            type="button"
            class="flex min-w-0 flex-1 items-center gap-3 self-stretch rounded-l-lg px-3 text-left"
            @click="emit('select-provider', provider)"
          >
            <CloudIcon />
            <span class="min-w-0 flex-1 truncate font-medium">
              {{ provider.name }}
            </span>
            <Badge
              v-if="provider.unsaved"
              variant="secondary"
            >
              {{ t('settings.provider.createNew') }}
            </Badge>
            <Badge
              v-else-if="provider.enabled === false"
              variant="outline"
            >
              {{ t('settings.provider.models.item.disabled') }}
            </Badge>
          </button>

          <Button
            v-if="!provider.unsaved"
            type="button"
            variant="ghost"
            size="icon-sm"
            class="mr-2 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            :aria-label="t('settings.provider.delete.title')"
            :disabled="saving || !persistenceAvailable"
            @click.stop="emit('delete-provider', provider)"
          >
            <Trash2Icon />
          </Button>
        </div>
      </div>
    </div>
  </aside>
</template>

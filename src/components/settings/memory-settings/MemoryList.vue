<script setup lang="ts">
import {
  ArchiveIcon,
  BrainIcon,
  FileTextIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  Trash2Icon,
  XIcon,
} from '@lucide/vue'
import type { CompanionMemoryItem } from '@shared/types/memory'
import type { HTMLAttributes } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsPanelHeader from '@/components/settings/common/SettingsPanelHeader.vue'
import SettingsPanelItem from '@/components/settings/common/SettingsPanelItem.vue'
import SettingsSearchBar from '@/components/settings/common/SettingsSearchBar.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { formatMemoryTime, memoryKindLabel } from './format'

const { t } = useI18n()

const searchQuery = defineModel<string>('searchQuery', { required: true })

const props = defineProps<{
  items: CompanionMemoryItem[]
  total: number
  loading: boolean
  saving: boolean
  showSkeleton: boolean
  includeInactive: boolean
  confirmDeleteMemoryId?: string
  title?: string
  showPolicy?: boolean
  emptyTitle?: string
  emptyHint?: string
  class?: HTMLAttributes['class']
}>()

const emit = defineEmits<{
  policy: []
  create: []
  detail: [memory: CompanionMemoryItem]
  refresh: []
  clearSearch: []
  toggleInactive: []
  enable: [memory: CompanionMemoryItem, enabled: boolean]
  archive: [memory: CompanionMemoryItem]
  delete: [memory: CompanionMemoryItem]
}>()
</script>

<template>
  <Card :class="cn('grid h-full min-h-0 flex-1 grid-rows-[auto_auto_minmax(0,1fr)] gap-0 rounded-md border border-border py-0 ring-0', props.class)">
    <SettingsPanelHeader
      :title="props.title ?? t('settings.memory.panelTitle')"
      :icon="BrainIcon"
    />

    <SettingsSearchBar
      v-model="searchQuery"
      class="border-b-0"
      :label="t('settings.memory.searchLabel')"
      :placeholder="t('settings.memory.searchPlaceholder')"
      :clear-label="t('settings.memory.clearSearchLabel')"
      :disabled="loading"
      @clear="emit('clearSearch')"
      @keyup.enter="emit('refresh')"
    >
      <template #summary>
        <Badge variant="secondary">
          {{ t('settings.memory.totalBadge', { count: total }) }}
        </Badge>
      </template>

      <template #actions>
        <Button
          v-if="props.showPolicy !== false"
          type="button"
          variant="outline"
          @click="emit('policy')"
        >
          <SlidersHorizontalIcon data-icon="inline-start" />
          {{ t('settings.memory.policyButton') }}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          :aria-label="t('settings.memory.refreshAriaLabel')"
          :disabled="loading"
          @click="emit('refresh')"
        >
          <RefreshCwIcon />
        </Button>
        <Button
          type="button"
          :disabled="saving"
          @click="emit('create')"
        >
          <PlusIcon data-icon="inline-start" />
          {{ t('settings.memory.list.createButton') }}
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
            <Skeleton class="h-24 w-full" />
          </template>
        </div>

        <div
          v-else-if="!items.length && searchQuery.trim()"
          class="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-10 text-center text-sm text-muted-foreground sm:px-5"
        >
          <SearchIcon class="size-8 opacity-50" />
          <div class="flex flex-col gap-1">
            <p class="font-medium text-foreground">{{ t('settings.memory.list.noMatch') }}</p>
            <p>{{ t('settings.memory.list.noMatchHint') }}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            @click="searchQuery = ''; emit('clearSearch')"
          >
            <XIcon data-icon="inline-start" />
            {{ t('settings.memory.list.clearSearchButton') }}
          </Button>
        </div>

        <div
          v-else-if="!items.length"
          class="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-10 text-center text-sm text-muted-foreground sm:px-5"
        >
          <BrainIcon class="size-8 opacity-50" />
          <div class="flex flex-col gap-1">
            <p class="font-medium text-foreground">{{ props.emptyTitle ?? t('settings.memory.list.emptyTitle') }}</p>
            <p>{{ props.emptyHint ?? t('settings.memory.list.emptyHint') }}</p>
          </div>
          <Button
            type="button"
            :disabled="saving"
            @click="emit('create')"
          >
            <PlusIcon data-icon="inline-start" />
            {{ t('settings.memory.list.createButton') }}
          </Button>
        </div>

        <div
          v-else
          class="flex flex-1 flex-col gap-3 px-4 py-4 sm:px-5"
        >
          <SettingsPanelItem
            v-for="memory in items"
            :key="memory.id"
            :title="memoryKindLabel(memory.kind)"
            :description="memory.content"
            :icon="FileTextIcon"
            :pending="saving"
            interactive
            :activation-label="t('settings.memory.list.detailAriaLabel')"
            class="cursor-pointer"
            @activate="emit('detail', memory)"
          >
            <template #meta>
              <p class="text-sm text-muted-foreground">
                {{ t('settings.memory.list.updatedAt', { time: formatMemoryTime(memory.updatedAt) }) }}
              </p>
            </template>

            <template #actions>
              <Switch
                :id="`memory-enabled-${memory.id}`"
                size="sm"
                :model-value="memory.status === 'active'"
                :disabled="saving || memory.status === 'archived' || memory.status === 'deleted'"
                :aria-label="t('settings.memory.list.toggleAriaLabel', { action: memory.status === 'active' ? t('settings.memory.list.disable') : t('settings.memory.list.enable') })"
                @click.stop
                @update:model-value="emit('enable', memory, $event)"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                :aria-label="t('settings.memory.list.archiveAriaLabel')"
                :title="t('settings.memory.list.archiveAriaLabel')"
                :disabled="saving || memory.status !== 'active'"
                @click.stop="emit('archive', memory)"
              >
                <ArchiveIcon />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                :variant="confirmDeleteMemoryId === memory.id ? 'destructive' : 'outline'"
                :aria-label="confirmDeleteMemoryId === memory.id ? t('settings.memory.list.confirmDeleteButton') : t('settings.memory.list.deleteButton')"
                :title="confirmDeleteMemoryId === memory.id ? t('settings.memory.list.confirmDeleteButton') : t('settings.memory.list.deleteButton')"
                :disabled="saving"
                @click.stop="emit('delete', memory)"
              >
                <Trash2Icon />
              </Button>
            </template>
          </SettingsPanelItem>
        </div>
      </div>
    </CardContent>
  </Card>
</template>

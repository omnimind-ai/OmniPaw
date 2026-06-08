<script setup lang="ts">
import type { CompanionMemoryItem } from '@shared/types/memory'
import {
  ArchiveIcon,
  BrainIcon,
  FileTextIcon,
  InfoIcon,
  MinusIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-vue-next'
import type { HTMLAttributes } from 'vue'
import SettingsPanelHeader from '@/components/settings/common/SettingsPanelHeader.vue'
import SettingsPanelItem from '@/components/settings/common/SettingsPanelItem.vue'
import SettingsSearchBar from '@/components/settings/common/SettingsSearchBar.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import {
  formatMemoryTime,
  memoryKindLabel,
  memoryScopeLabel,
  memoryStatusLabel,
  memoryStatusVariant,
  percentLabel,
} from './format'

const searchQuery = defineModel<string>('searchQuery', { required: true })

const props = defineProps<{
  items: CompanionMemoryItem[]
  total: number
  loading: boolean
  saving: boolean
  showSkeleton: boolean
  includeInactive: boolean
  confirmDeleteMemoryId?: string
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
  importance: [memory: CompanionMemoryItem, delta: number]
  delete: [memory: CompanionMemoryItem]
}>()
</script>

<template>
  <Card :class="cn('grid h-full min-h-0 flex-1 grid-rows-[auto_auto_minmax(0,1fr)] gap-0 rounded-md border border-border py-0 ring-0', props.class)">
    <SettingsPanelHeader
      title="伙伴记忆"
      description="管理普通聊天和桌面伙伴会话使用的长期记忆。酒馆、主动视觉和计划任务不会参与这条记忆流水线。"
      :icon="BrainIcon"
    />

    <SettingsSearchBar
      v-model="searchQuery"
      class="border-b-0"
      label="搜索记忆"
      placeholder="搜索记忆内容"
      clear-label="清除记忆搜索"
      :disabled="loading"
      @clear="emit('clearSearch')"
      @keyup.enter="emit('refresh')"
    >
      <template #summary>
        <Badge variant="secondary">
          {{ total }} 条记忆
        </Badge>
      </template>

      <template #actions>
        <Button
          type="button"
          variant="outline"
          @click="emit('policy')"
        >
          <SlidersHorizontalIcon data-icon="inline-start" />
          策略设置
        </Button>
        <Button
          type="button"
          variant="outline"
          @click="emit('toggleInactive')"
        >
          {{ includeInactive ? '仅活跃' : '含归档' }}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label="刷新记忆"
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
          新建
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
            <p class="font-medium text-foreground">没有匹配的记忆</p>
            <p>换一个关键词，或清空搜索后查看全部记忆。</p>
          </div>
          <Button
            type="button"
            variant="outline"
            @click="searchQuery = ''; emit('clearSearch')"
          >
            <XIcon data-icon="inline-start" />
            清空搜索
          </Button>
        </div>

        <div
          v-else-if="!items.length"
          class="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-10 text-center text-sm text-muted-foreground sm:px-5"
        >
          <BrainIcon class="size-8 opacity-50" />
          <div class="flex flex-col gap-1">
            <p class="font-medium text-foreground">暂无记忆</p>
            <p>新建记忆后，可以在这里启停、查看、归档和删除。</p>
          </div>
          <Button
            type="button"
            :disabled="saving"
            @click="emit('create')"
          >
            <PlusIcon data-icon="inline-start" />
            新建
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
          >
            <template #badges>
              <Badge :variant="memoryStatusVariant(memory.status)">
                {{ memoryStatusLabel(memory.status) }}
              </Badge>
              <Badge variant="outline">{{ memoryScopeLabel(memory.scope) }}</Badge>
              <Badge variant="outline">重要度 {{ memory.importance }}</Badge>
              <Badge variant="outline">{{ percentLabel(memory.confidence) }}</Badge>
            </template>

            <template #meta>
              <p class="text-sm text-muted-foreground">
                更新于 {{ formatMemoryTime(memory.updatedAt) }}
              </p>
            </template>

            <template #actions>
              <Switch
                :id="`memory-enabled-${memory.id}`"
                size="sm"
                :model-value="memory.status === 'active'"
                :disabled="saving || memory.status === 'archived' || memory.status === 'deleted'"
                :aria-label="`${memory.status === 'active' ? '停用' : '启用'}记忆`"
                @update:model-value="emit('enable', memory, $event)"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="降低重要度"
                :disabled="saving || memory.importance <= 1"
                @click="emit('importance', memory, -1)"
              >
                <MinusIcon />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="提高重要度"
                :disabled="saving || memory.importance >= 5"
                @click="emit('importance', memory, 1)"
              >
                <PlusIcon />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="查看记忆详情"
                :disabled="saving"
                @click="emit('detail', memory)"
              >
                <InfoIcon />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="归档记忆"
                :disabled="saving || memory.status !== 'active'"
                @click="emit('archive', memory)"
              >
                <ArchiveIcon />
              </Button>
              <Button
                type="button"
                size="sm"
                :variant="confirmDeleteMemoryId === memory.id ? 'destructive' : 'outline'"
                :disabled="saving"
                @click="emit('delete', memory)"
              >
                <Trash2Icon data-icon="inline-start" />
                {{ confirmDeleteMemoryId === memory.id ? '确认删除' : '删除' }}
              </Button>
            </template>
          </SettingsPanelItem>
        </div>
      </div>
    </CardContent>
  </Card>
</template>

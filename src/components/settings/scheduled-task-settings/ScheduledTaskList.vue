<script setup lang="ts">
import type { CronTask } from '@shared/types/cron'
import {
  ClipboardListIcon,
  HistoryIcon,
  InfoIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-vue-next'
import { computed, ref } from 'vue'
import SettingsPanelHeader from '@/components/settings/common/SettingsPanelHeader.vue'
import SettingsPanelItem from '@/components/settings/common/SettingsPanelItem.vue'
import SettingsSearchBar from '@/components/settings/common/SettingsSearchBar.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { formatTime, scheduleSummary, statusLabel, statusVariant, taskSessionLabel } from './format'

const props = defineProps<{
  tasks: CronTask[]
  loading: boolean
  saving: boolean
  showSkeleton: boolean
  confirmDeleteTaskId?: string
}>()

const emit = defineEmits<{
  policy: []
  create: []
  detail: [task: CronTask]
  audit: [task: CronTask]
  run: [task: CronTask]
  edit: [task: CronTask]
  enable: [task: CronTask, enabled: boolean]
  delete: [task: CronTask]
}>()

const searchQuery = ref('')
const enabledCount = computed(() => props.tasks.filter((task) => task.enabled).length)
const runningCount = computed(() => props.tasks.filter((task) => task.state === 'running').length)
const filteredTasks = computed(() => {
  const query = normalizeSearchText(searchQuery.value)
  if (!query) return props.tasks
  return props.tasks.filter((task) => {
    const searchable = [
      task.name,
      task.note,
      taskSessionLabel(task),
      scheduleSummary(task.schedule),
      statusLabel(task),
    ]
      .filter(Boolean)
      .join(' ')
    return normalizeSearchText(searchable).includes(query)
  })
})
const searchEmpty = computed(() => props.tasks.length > 0 && filteredTasks.value.length === 0)

function normalizeSearchText(value: string) {
  return value.trim().toLocaleLowerCase()
}

function clearSearch() {
  searchQuery.value = ''
}
</script>

<template>
  <Card class="grid h-full min-h-0 flex-1 grid-rows-[auto_auto_minmax(0,1fr)] gap-0 rounded-md border border-border py-0 ring-0">
    <SettingsPanelHeader
      title="计划任务"
      description="计划任务会使用独立的任务会话保存上下文和执行结果。"
      :icon="ClipboardListIcon"
    />

    <SettingsSearchBar
      v-model="searchQuery"
      class="border-b-0"
      label="搜索任务"
      placeholder="搜索任务名称、备注或会话"
      clear-label="清除任务搜索"
      :disabled="loading"
      @clear="clearSearch"
    >
      <template #summary>
        <Badge variant="secondary">
          {{ tasks.length }} 个任务
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
          </template>
        </div>

        <div
          v-else-if="!tasks.length"
          class="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-10 text-center text-sm text-muted-foreground sm:px-5"
        >
          <ClipboardListIcon class="size-8 opacity-50" />
          <div class="flex flex-col gap-1">
            <p class="font-medium text-foreground">暂无计划任务</p>
            <p>新建任务后，可以在这里查看任务状态、手动运行和打开审计记录。</p>
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
          v-else-if="searchEmpty"
          class="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-10 text-center text-sm text-muted-foreground sm:px-5"
        >
          <SearchIcon class="size-8 opacity-50" />
          <div class="flex flex-col gap-1">
            <p class="font-medium text-foreground">没有匹配的任务</p>
            <p>换一个关键词，或清空搜索后查看全部任务。</p>
          </div>
          <Button
            type="button"
            variant="outline"
            @click="clearSearch"
          >
            <XIcon data-icon="inline-start" />
            清空搜索
          </Button>
        </div>

        <div
          v-else
          class="flex flex-col gap-3 px-4 py-4 sm:px-5"
        >
          <SettingsPanelItem
            v-for="task in filteredTasks"
            :key="task.id"
            :title="task.name"
            :icon="ClipboardListIcon"
          >
            <template #badges>
              <Badge :variant="statusVariant(task)">
                {{ statusLabel(task) }}
              </Badge>
              <Badge
                v-if="task.schedule.kind === 'cron'"
                variant="outline"
              >
                重复
              </Badge>
            </template>

            <template #meta>
              <p class="text-sm text-muted-foreground">
                {{ scheduleSummary(task.schedule) }} · {{ taskSessionLabel(task) }} · 下次
                {{ formatTime(task.nextRunAt) }}
              </p>
              <p
                v-if="task.note"
                class="line-clamp-2 text-sm text-muted-foreground"
              >
                {{ task.note }}
              </p>
            </template>

            <template #actions>
              <Switch
                :id="`cron-task-enabled-${task.id}`"
                size="sm"
                :model-value="task.enabled"
                :disabled="saving"
                :aria-label="`${task.enabled ? '停用' : '启用'} ${task.name}`"
                @update:model-value="emit('enable', task, $event)"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                :disabled="saving"
                aria-label="查看详情"
                @click="emit('detail', task)"
              >
                <InfoIcon />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                :disabled="saving"
                aria-label="查看审计"
                @click="emit('audit', task)"
              >
                <HistoryIcon />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                :disabled="saving"
                aria-label="立即运行"
                @click="emit('run', task)"
              >
                <PlayIcon />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                :disabled="saving"
                aria-label="编辑任务"
                @click="emit('edit', task)"
              >
                <PencilIcon />
              </Button>
              <Button
                type="button"
                size="sm"
                :variant="confirmDeleteTaskId === task.id ? 'destructive' : 'outline'"
                :disabled="saving"
                @click="emit('delete', task)"
              >
                <Trash2Icon data-icon="inline-start" />
                {{ confirmDeleteTaskId === task.id ? '确认删除' : '删除' }}
              </Button>
            </template>
          </SettingsPanelItem>
        </div>
      </div>
    </CardContent>
  </Card>
</template>

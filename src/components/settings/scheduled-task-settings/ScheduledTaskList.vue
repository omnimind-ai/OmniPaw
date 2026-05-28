<script setup lang="ts">
import type { CronTask } from '@shared/types/cron'
import {
  ClipboardListIcon,
  HistoryIcon,
  InfoIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-vue-next'
import SettingsListIconButton from '@/components/settings/SettingsListIconButton.vue'
import SettingsListItem from '@/components/settings/SettingsListItem.vue'
import SettingsListSection from '@/components/settings/SettingsListSection.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { formatTime, scheduleSummary, statusLabel, statusVariant, taskSessionLabel } from './format'

defineProps<{
  tasks: CronTask[]
  loading: boolean
  saving: boolean
  showSkeleton: boolean
  confirmDeleteTaskId?: string
}>()

const emit = defineEmits<{
  create: []
  detail: [task: CronTask]
  audit: [task: CronTask]
  run: [task: CronTask]
  edit: [task: CronTask]
  enable: [task: CronTask, enabled: boolean]
  delete: [task: CronTask]
}>()
</script>

<template>
  <SettingsListSection
    title="任务列表"
    :description="`${tasks.length} 个任务`"
    lead="计划任务会使用独立的任务会话保存上下文和执行结果。"
    :loading="loading"
    :show-skeleton="showSkeleton"
    :empty="!tasks.length"
    empty-title="暂无计划任务"
    empty-description="新建任务后，可以在这里查看任务状态、手动运行和打开审计记录。"
    :empty-icon="ClipboardListIcon"
  >
    <template #actions>
      <Button
        size="sm"
        :disabled="saving"
        @click="emit('create')"
      >
        <PlusIcon data-icon="inline-start" />
        新建
      </Button>
    </template>

    <template #summary>
      <Badge variant="secondary">
        {{ tasks.length }} 个任务
      </Badge>
      <Badge variant="outline">
        {{ tasks.filter((task) => task.enabled).length }} 个已启用
      </Badge>
      <Badge variant="outline">
        {{ tasks.filter((task) => task.state === 'running').length }} 个运行中
      </Badge>
    </template>

    <template #empty-actions>
      <Button
        size="sm"
        :disabled="saving"
        @click="emit('create')"
      >
        <PlusIcon data-icon="inline-start" />
        新建
      </Button>
    </template>

    <SettingsListItem
      v-for="task in tasks"
      :key="task.id"
    >
      <template #title>
        {{ task.name }}
      </template>

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
        <SettingsListIconButton
          label="查看详情"
          :icon="InfoIcon"
          :disabled="saving"
          @click="emit('detail', task)"
        />
        <SettingsListIconButton
          label="查看审计"
          :icon="HistoryIcon"
          :disabled="saving"
          @click="emit('audit', task)"
        />
        <SettingsListIconButton
          label="立即运行"
          :icon="PlayIcon"
          :disabled="saving"
          @click="emit('run', task)"
        />
        <SettingsListIconButton
          label="编辑任务"
          :icon="PencilIcon"
          :disabled="saving"
          @click="emit('edit', task)"
        />
        <Button
          size="sm"
          variant="outline"
          :disabled="saving"
          @click="emit('delete', task)"
        >
          <Trash2Icon data-icon="inline-start" />
          {{ confirmDeleteTaskId === task.id ? '确认删除' : '删除' }}
        </Button>
      </template>
    </SettingsListItem>
  </SettingsListSection>
</template>

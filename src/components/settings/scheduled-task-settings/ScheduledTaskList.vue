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
import SettingsSection from '@/components/settings/SettingsSection.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatTime, scheduleSummary, statusLabel, taskSessionLabel } from './format'

defineProps<{
  tasks: CronTask[]
  loading: boolean
  saving: boolean
  confirmDeleteTaskId?: string
}>()

const emit = defineEmits<{
  create: []
  detail: [task: CronTask]
  audit: [task: CronTask]
  run: [task: CronTask]
  edit: [task: CronTask]
  delete: [task: CronTask]
}>()
</script>

<template>
  <SettingsSection
    title="任务列表"
    :description="loading ? '正在加载计划任务。' : `${tasks.length} 个任务`"
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

    <div class="flex flex-col">
      <div
        v-if="!tasks.length"
        class="flex flex-col gap-2 px-4 py-6 text-sm text-muted-foreground"
      >
        <ClipboardListIcon />
        暂无计划任务。
      </div>

      <template v-else>
        <div
          v-for="task in tasks"
          :key="task.id"
          class="flex flex-col gap-3 border-b px-4 py-3 last:border-b-0 xl:flex-row xl:items-center xl:justify-between"
        >
          <div class="flex min-w-0 flex-1 flex-col gap-1">
            <span class="flex flex-wrap items-center gap-2">
              <span class="font-medium">{{ task.name }}</span>
              <Badge variant="secondary">{{ statusLabel(task) }}</Badge>
            </span>
            <span class="text-sm text-muted-foreground">
              {{ scheduleSummary(task.schedule) }} · {{ taskSessionLabel(task) }} · 下次
              {{ formatTime(task.nextRunAt) }}
            </span>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              @click="emit('detail', task)"
            >
              <InfoIcon data-icon="inline-start" />
              详情
            </Button>
            <Button
              size="sm"
              variant="outline"
              @click="emit('audit', task)"
            >
              <HistoryIcon data-icon="inline-start" />
              审计
            </Button>
            <Button
              size="sm"
              variant="outline"
              :disabled="saving"
              @click="emit('run', task)"
            >
              <PlayIcon data-icon="inline-start" />
              运行
            </Button>
            <Button
              size="sm"
              variant="outline"
              :disabled="saving"
              @click="emit('edit', task)"
            >
              <PencilIcon data-icon="inline-start" />
              编辑
            </Button>
            <Button
              size="sm"
              variant="outline"
              :disabled="saving"
              @click="emit('delete', task)"
            >
              <Trash2Icon data-icon="inline-start" />
              {{ confirmDeleteTaskId === task.id ? '确认删除' : '删除' }}
            </Button>
          </div>
        </div>
      </template>
    </div>
  </SettingsSection>
</template>

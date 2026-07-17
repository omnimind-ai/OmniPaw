<script setup lang="ts">
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
} from '@lucide/vue'
import type { CronTask } from '@shared/types/cron'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsPanelHeader from '@/components/settings/common/SettingsPanelHeader.vue'
import SettingsPanelItem from '@/components/settings/common/SettingsPanelItem.vue'
import SettingsSearchBar from '@/components/settings/common/SettingsSearchBar.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { formatTime, scheduleSummary, statusLabel, taskSessionLabel } from './format'

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

const { t } = useI18n()
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
      :title="t('settings.scheduledTask.title')"
      :icon="ClipboardListIcon"
    />

    <SettingsSearchBar
      v-model="searchQuery"
      class="border-b-0"
      :label="t('settings.scheduledTask.searchLabel')"
      :placeholder="t('settings.scheduledTask.searchPlaceholder')"
      :clear-label="t('settings.scheduledTask.clearSearchLabel')"
      :disabled="loading"
      @clear="clearSearch"
    >
      <template #summary>
        <Badge variant="secondary">
          {{ t('settings.scheduledTask.taskCount', { count: tasks.length }) }}
        </Badge>
      </template>

      <template #actions>
        <Button
          type="button"
          variant="outline"
          @click="emit('policy')"
        >
          <SlidersHorizontalIcon data-icon="inline-start" />
          {{ t('settings.scheduledTask.policySettings') }}
        </Button>
        <Button
          type="button"
          :disabled="saving"
          @click="emit('create')"
        >
          <PlusIcon data-icon="inline-start" />
          {{ t('settings.scheduledTask.createNew') }}
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
            <p class="font-medium text-foreground">{{ t('settings.scheduledTask.noTasks') }}</p>
            <p>{{ t('settings.scheduledTask.noTasksHint') }}</p>
          </div>
          <Button
            type="button"
            :disabled="saving"
            @click="emit('create')"
          >
            <PlusIcon data-icon="inline-start" />
            {{ t('settings.scheduledTask.createNew') }}
          </Button>
        </div>

        <div
          v-else-if="searchEmpty"
          class="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-10 text-center text-sm text-muted-foreground sm:px-5"
        >
          <SearchIcon class="size-8 opacity-50" />
          <div class="flex flex-col gap-1">
            <p class="font-medium text-foreground">{{ t('settings.scheduledTask.noMatch') }}</p>
            <p>{{ t('settings.scheduledTask.noMatchHint') }}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            @click="clearSearch"
          >
            <XIcon data-icon="inline-start" />
            {{ t('settings.scheduledTask.clearSearch') }}
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
            <template #meta>
              <p class="text-sm text-muted-foreground">
                {{ scheduleSummary(task.schedule) }} · {{ taskSessionLabel(task) }} · {{ t('settings.scheduledTask.detailFields.nextRun') }}
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
                :aria-label="`${task.enabled ? t('settings.scheduledTask.listItem.toggleAction.disable') : t('settings.scheduledTask.listItem.toggleAction.enable')} ${task.name}`"
                @update:model-value="emit('enable', task, $event)"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                :disabled="saving"
                :aria-label="t('settings.scheduledTask.listItem.viewDetails')"
                :title="t('settings.scheduledTask.listItem.viewDetails')"
                @click="emit('detail', task)"
              >
                <InfoIcon />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                :disabled="saving"
                :aria-label="t('settings.scheduledTask.listItem.viewAudit')"
                :title="t('settings.scheduledTask.listItem.viewAudit')"
                @click="emit('audit', task)"
              >
                <HistoryIcon />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                :disabled="saving"
                :aria-label="t('settings.scheduledTask.listItem.runNow')"
                :title="t('settings.scheduledTask.listItem.runNow')"
                @click="emit('run', task)"
              >
                <PlayIcon />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                :disabled="saving"
                :aria-label="t('settings.scheduledTask.listItem.editTask')"
                :title="t('settings.scheduledTask.listItem.editTask')"
                @click="emit('edit', task)"
              >
                <PencilIcon />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                :variant="confirmDeleteTaskId === task.id ? 'destructive' : 'outline'"
                :aria-label="confirmDeleteTaskId === task.id ? t('settings.scheduledTask.listItem.confirmDelete') : t('settings.scheduledTask.listItem.deleteTask')"
                :title="confirmDeleteTaskId === task.id ? t('settings.scheduledTask.listItem.confirmDelete') : t('settings.scheduledTask.listItem.deleteTask')"
                :disabled="saving"
                @click="emit('delete', task)"
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

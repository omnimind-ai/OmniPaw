<script setup lang="ts">
import { SYSTEM_SESSION_IDS } from '@shared/constants'
import type {
  CreateCronTaskRequest,
  CronRun,
  CronSchedule,
  CronTask,
  UpdateCronTaskRequest,
} from '@shared/types/cron'
import {
  HistoryIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  SaveIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import type { BridgeDesktopSettingsConfig } from '@/bridge/app'
import SettingsSection from '@/components/settings/SettingsSection.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useCronStore } from '@/stores/cron'
import { errorToText, useToast } from '@/utils/toast'

const props = defineProps<{
  draft: BridgeDesktopSettingsConfig
}>()

type ScheduleMode = 'at' | 'cron'

const cronStore = useCronStore()
const toast = useToast()
const { tasks, runsByTaskId, loading, saving, persistenceAvailable } = storeToRefs(cronStore)
const selectedTaskId = ref<string | undefined>()
const editingTaskId = ref<string | undefined>()
const confirmDeleteTaskId = ref<string | undefined>()
const form = reactive({
  name: '',
  note: '',
  targetSessionId: undefined as string | undefined,
  scheduleMode: 'at' as ScheduleMode,
  runAtLocal: toDatetimeLocal(Date.now() + 60 * 60 * 1000),
  cronExpression: '0 9 * * *',
  enabled: true,
})

const selectedTask = computed(() => tasks.value.find((task) => task.id === selectedTaskId.value))
const selectedRuns = computed(() =>
  selectedTaskId.value ? (runsByTaskId.value[selectedTaskId.value] ?? []) : []
)
const misfireGraceMinutes = computed({
  get: () => Math.round(props.draft.scheduledTasks.misfireGraceMs / 60_000),
  set: (value: string | number) => {
    const minutes = Math.max(0, Math.round(Number(value) || 0))
    props.draft.scheduledTasks.misfireGraceMs = minutes * 60_000
  },
})
const misfireStartupLimit = computed({
  get: () => props.draft.scheduledTasks.misfireStartupLimit,
  set: (value: string | number) => {
    props.draft.scheduledTasks.misfireStartupLimit = Math.max(0, Math.round(Number(value) || 0))
  },
})
const formTitle = computed(() => (editingTaskId.value ? '编辑任务' : '新建任务'))

onMounted(async () => {
  try {
    await cronStore.loadTasks()
  } catch (error) {
    toast.error(errorToText(error, '计划任务加载失败。'))
  }
})

onBeforeUnmount(() => {
  cronStore.stopCronSubscription()
})

function startCreate(): void {
  editingTaskId.value = undefined
  resetForm()
}

function startEdit(task: CronTask): void {
  editingTaskId.value = task.id
  confirmDeleteTaskId.value = undefined
  form.name = task.name
  form.note = task.note
  form.targetSessionId = task.targetSessionId
  form.scheduleMode = task.schedule.kind
  form.runAtLocal =
    task.schedule.kind === 'at' ? toDatetimeLocal(task.schedule.runAt) : form.runAtLocal
  form.cronExpression =
    task.schedule.kind === 'cron' ? task.schedule.cronExpression : form.cronExpression
  form.enabled = task.enabled
}

function resetForm(): void {
  form.name = ''
  form.note = ''
  form.targetSessionId = undefined
  form.scheduleMode = 'at'
  form.runAtLocal = toDatetimeLocal(Date.now() + 60 * 60 * 1000)
  form.cronExpression = '0 9 * * *'
  form.enabled = true
}

function cancelEdit(): void {
  editingTaskId.value = undefined
  resetForm()
}

async function submitTask(): Promise<void> {
  try {
    const schedule = formSchedulePayload()
    if (editingTaskId.value) {
      const request: UpdateCronTaskRequest = {
        taskId: editingTaskId.value,
        name: form.name,
        note: form.note,
        enabled: form.enabled,
        ...schedule,
      }
      if (form.targetSessionId) {
        request.targetSessionId = form.targetSessionId
      }
      await cronStore.updateTask(request)
    } else {
      const request: CreateCronTaskRequest = {
        name: form.name,
        note: form.note,
        enabled: form.enabled,
        ...schedule,
      }
      await cronStore.createTask(request)
    }
    cancelEdit()
  } catch (error) {
    toast.error(errorToText(error, '计划任务保存失败。'))
  }
}

async function runTask(task: CronTask): Promise<void> {
  try {
    await cronStore.runNow({ taskId: task.id })
  } catch (error) {
    toast.error(errorToText(error, '计划任务运行失败。'))
  }
}

async function deleteTask(task: CronTask): Promise<void> {
  if (confirmDeleteTaskId.value !== task.id) {
    confirmDeleteTaskId.value = task.id
    return
  }
  try {
    await cronStore.deleteTask({ taskId: task.id })
    confirmDeleteTaskId.value = undefined
    if (selectedTaskId.value === task.id) {
      selectedTaskId.value = undefined
    }
  } catch (error) {
    toast.error(errorToText(error, '计划任务删除失败。'))
  }
}

async function selectTask(task: CronTask): Promise<void> {
  selectedTaskId.value = task.id
  try {
    await cronStore.loadRuns({ taskId: task.id })
  } catch (error) {
    toast.error(errorToText(error, '运行记录加载失败。'))
  }
}

function formSchedulePayload():
  | Pick<CreateCronTaskRequest, 'runAt'>
  | Pick<CreateCronTaskRequest, 'cronExpression'> {
  if (form.scheduleMode === 'at') {
    const runAt = Date.parse(form.runAtLocal)
    if (!Number.isFinite(runAt)) {
      throw new Error('请输入有效的运行时间。')
    }
    return { runAt }
  }
  return { cronExpression: form.cronExpression.trim() }
}

function scheduleSummary(schedule: CronSchedule): string {
  if (schedule.kind === 'at') {
    return formatTime(schedule.runAt)
  }
  return schedule.cronExpression
}

function taskSessionLabel(task: CronTask): string {
  if (task.targetSessionId === SYSTEM_SESSION_IDS.cron) {
    return '计划任务会话'
  }
  return `会话 ${task.targetSessionId.slice(0, 8)}`
}

function statusLabel(task: CronTask): string {
  if (!task.enabled) return '已停用'
  if (task.state === 'running') return '运行中'
  if (task.lastStatus === 'failed') return '失败'
  if (task.lastStatus === 'complete') return '已完成'
  if (task.nextRunAt) return '等待中'
  return '空闲'
}

function runStatusLabel(run: CronRun): string {
  const labels: Record<CronRun['status'], string> = {
    running: '运行中',
    complete: '完成',
    failed: '失败',
    interrupted: '中断',
    skipped: '跳过',
    missed: '错过',
  }
  return labels[run.status]
}

function reasonLabel(run: CronRun): string {
  const labels: Record<CronRun['reason'], string> = {
    scheduled: '计划',
    manual: '手动',
    misfire: '补跑',
  }
  return labels[run.reason]
}

function formatTime(value: number | undefined): string {
  return value ? new Date(value).toLocaleString() : '未安排'
}

function toDatetimeLocal(value: number): string {
  const date = new Date(value)
  const offsetMs = date.getTimezoneOffset() * 60_000
  return new Date(value - offsetMs).toISOString().slice(0, 16)
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <SettingsSection
      title="计划任务"
      description="管理本地计划任务运行、补跑策略和审计记录。"
    >
      <FieldGroup class="gap-0">
        <Field
          orientation="responsive"
          class="border-b px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="scheduled-enabled">启用计划任务</FieldLabel>
            <FieldDescription>关闭后不会自动运行或补跑，手动运行和管理仍可用。</FieldDescription>
          </FieldContent>
          <Switch
            id="scheduled-enabled"
            v-model="draft.scheduledTasks.enabled"
            aria-label="启用计划任务"
          />
        </Field>

        <Field
          orientation="responsive"
          class="border-b px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="scheduled-misfire-policy">补跑策略</FieldLabel>
            <FieldDescription>桌面端关闭期间错过的重复任务如何处理。</FieldDescription>
          </FieldContent>
          <Select
            v-model="draft.scheduledTasks.misfirePolicy"
            class="w-full md:w-48"
          >
            <SelectTrigger
              id="scheduled-misfire-policy"
              class="w-full md:w-48"
            >
              <SelectValue placeholder="选择补跑策略" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="run_once">最多补跑一次</SelectItem>
                <SelectItem value="skip">跳过错过任务</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>

        <Field
          orientation="responsive"
          class="border-b px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="scheduled-grace">单次任务宽限分钟</FieldLabel>
            <FieldDescription>超过宽限时间的单次任务会记录为错过。</FieldDescription>
          </FieldContent>
          <Input
            id="scheduled-grace"
            v-model="misfireGraceMinutes"
            class="w-full md:w-48"
            type="number"
            min="0"
            step="1"
          />
        </Field>

        <Field
          orientation="responsive"
          class="px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="scheduled-limit">启动补跑上限</FieldLabel>
            <FieldDescription>应用启动时最多补跑的任务数量。</FieldDescription>
          </FieldContent>
          <Input
            id="scheduled-limit"
            v-model="misfireStartupLimit"
            class="w-full md:w-48"
            type="number"
            min="0"
            step="1"
          />
        </Field>
      </FieldGroup>
    </SettingsSection>

    <SettingsSection
      :title="formTitle"
      description="新任务会使用独立的计划任务会话保存上下文和结果。"
    >
      <FieldGroup class="gap-0">
        <Field class="border-b px-4 py-3">
          <FieldLabel for="cron-task-name">名称</FieldLabel>
          <Input
            id="cron-task-name"
            v-model="form.name"
            placeholder="例如：每日总结"
          />
        </Field>

        <Field class="border-b px-4 py-3">
          <FieldLabel for="cron-task-note">任务说明</FieldLabel>
          <Textarea
            id="cron-task-note"
            v-model="form.note"
            placeholder="写给 Agent 的计划任务说明"
            class="min-h-24"
          />
        </Field>

        <Field
          orientation="responsive"
          class="border-b px-4 py-3"
        >
          <FieldContent>
            <FieldLabel>计划类型</FieldLabel>
            <FieldDescription>单次时间或五字段 cron 表达式。</FieldDescription>
          </FieldContent>
          <ToggleGroup
            v-model="form.scheduleMode"
            type="single"
            variant="outline"
            class="w-full md:w-auto"
          >
            <ToggleGroupItem
              value="at"
              class="flex-1 md:flex-none"
            >
              单次
            </ToggleGroupItem>
            <ToggleGroupItem
              value="cron"
              class="flex-1 md:flex-none"
            >
              重复
            </ToggleGroupItem>
          </ToggleGroup>
        </Field>

        <Field
          v-if="form.scheduleMode === 'at'"
          class="border-b px-4 py-3"
        >
          <FieldLabel for="cron-task-run-at">运行时间</FieldLabel>
          <Input
            id="cron-task-run-at"
            v-model="form.runAtLocal"
            type="datetime-local"
          />
        </Field>

        <Field
          v-else
          class="border-b px-4 py-3"
        >
          <FieldLabel for="cron-task-expression">Cron 表达式</FieldLabel>
          <Input
            id="cron-task-expression"
            v-model="form.cronExpression"
            placeholder="0 9 * * *"
          />
          <FieldDescription>支持五字段：分钟 小时 日期 月份 星期。</FieldDescription>
        </Field>

        <Field
          orientation="responsive"
          class="border-b px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="cron-task-enabled">启用任务</FieldLabel>
            <FieldDescription>停用后不会自动触发。</FieldDescription>
          </FieldContent>
          <Switch
            id="cron-task-enabled"
            v-model="form.enabled"
            aria-label="启用任务"
          />
        </Field>

        <Field class="px-4 py-3">
          <div class="flex flex-wrap items-center gap-2">
            <Button
              :disabled="saving || !persistenceAvailable"
              @click="submitTask"
            >
              <SaveIcon data-icon="inline-start" />
              保存
            </Button>
            <Button
              v-if="editingTaskId"
              variant="outline"
              @click="cancelEdit"
            >
              <XIcon data-icon="inline-start" />
              取消
            </Button>
            <Button
              v-else
              variant="outline"
              @click="startCreate"
            >
              <PlusIcon data-icon="inline-start" />
              清空
            </Button>
          </div>
        </Field>
      </FieldGroup>
    </SettingsSection>

    <SettingsSection
      title="任务列表"
      :description="loading ? '正在加载计划任务。' : `${tasks.length} 个任务`"
    >
      <div class="flex flex-col">
        <div
          v-if="!tasks.length"
          class="px-4 py-6 text-sm text-muted-foreground"
        >
          暂无计划任务。
        </div>

        <template v-else>
          <div
            v-for="task in tasks"
            :key="task.id"
            class="flex flex-col gap-3 border-b px-4 py-3 last:border-b-0 lg:flex-row lg:items-center lg:justify-between"
          >
            <button
              type="button"
              class="flex min-w-0 flex-1 flex-col gap-1 text-left"
              @click="selectTask(task)"
            >
              <span class="flex flex-wrap items-center gap-2">
                <span class="font-medium">{{ task.name }}</span>
                <Badge variant="secondary">{{ statusLabel(task) }}</Badge>
              </span>
              <span class="text-sm text-muted-foreground">
                {{ scheduleSummary(task.schedule) }} · {{ taskSessionLabel(task) }} · 下次
                {{ formatTime(task.nextRunAt) }}
              </span>
            </button>

            <div class="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                @click="runTask(task)"
              >
                <PlayIcon data-icon="inline-start" />
                运行
              </Button>
              <Button
                size="sm"
                variant="outline"
                @click="selectTask(task)"
              >
                <HistoryIcon data-icon="inline-start" />
                记录
              </Button>
              <Button
                size="sm"
                variant="outline"
                @click="startEdit(task)"
              >
                <PencilIcon data-icon="inline-start" />
                编辑
              </Button>
              <Button
                size="sm"
                variant="outline"
                @click="deleteTask(task)"
              >
                <Trash2Icon data-icon="inline-start" />
                {{ confirmDeleteTaskId === task.id ? '确认删除' : '删除' }}
              </Button>
            </div>
          </div>
        </template>
      </div>
    </SettingsSection>

    <SettingsSection
      title="运行记录"
      :description="selectedTask ? selectedTask.name : '选择一个任务查看审计记录。'"
    >
      <div class="flex flex-col">
        <div
          v-if="!selectedTask"
          class="px-4 py-6 text-sm text-muted-foreground"
        >
          尚未选择任务。
        </div>

        <div
          v-else-if="!selectedRuns.length"
          class="px-4 py-6 text-sm text-muted-foreground"
        >
          暂无运行记录。
        </div>

        <template v-else>
          <div
            v-for="run in selectedRuns"
            :key="run.id"
            class="flex flex-col gap-2 px-4 py-3"
          >
            <div class="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{{ runStatusLabel(run) }}</Badge>
              <span class="text-sm text-muted-foreground">{{ reasonLabel(run) }}</span>
              <span class="text-sm text-muted-foreground">{{ formatTime(run.startedAt) }}</span>
              <span
                v-if="run.durationMs !== undefined"
                class="text-sm text-muted-foreground"
              >
                {{ run.durationMs }} ms
              </span>
            </div>
            <p
              v-if="run.resultSummary"
              class="text-sm"
            >
              {{ run.resultSummary }}
            </p>
            <p
              v-if="run.error"
              class="text-sm text-muted-foreground"
            >
              {{ run.error.message }}
            </p>
            <Separator />
          </div>
        </template>
      </div>
    </SettingsSection>
  </div>
</template>

<script setup lang="ts">
import type { CreateCronTaskRequest, CronTask, UpdateCronTaskRequest } from '@shared/types/cron'
import { PlusIcon, SaveIcon, XIcon } from 'lucide-vue-next'
import { computed, reactive, watch } from 'vue'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { ScheduledTaskSubmitPayload } from './types'

type ScheduleMode = 'at' | 'cron'

const open = defineModel<boolean>('open', { required: true })

const props = defineProps<{
  task?: CronTask
  saving: boolean
  persistenceAvailable: boolean
}>()

const emit = defineEmits<{
  submit: [payload: ScheduledTaskSubmitPayload]
  invalid: [message: string]
}>()

const form = reactive({
  name: '',
  note: '',
  targetSessionId: undefined as string | undefined,
  scheduleMode: 'at' as ScheduleMode,
  runAtLocal: toDatetimeLocal(Date.now() + 60 * 60 * 1000),
  cronExpression: '0 9 * * *',
  enabled: true,
})

const editing = computed(() => Boolean(props.task))
const title = computed(() => (editing.value ? '编辑任务' : '新建任务'))

watch(
  () => ({ open: open.value, task: props.task }),
  ({ open: isOpen, task }) => {
    if (isOpen) {
      resetForm(task)
    }
  },
  { immediate: true }
)

function resetForm(task?: CronTask): void {
  form.name = task?.name ?? ''
  form.note = task?.note ?? ''
  form.targetSessionId = task?.targetSessionId
  form.scheduleMode = task?.schedule.kind ?? 'at'
  form.runAtLocal =
    task?.schedule.kind === 'at'
      ? toDatetimeLocal(task.schedule.runAt)
      : toDatetimeLocal(Date.now() + 60 * 60 * 1000)
  form.cronExpression = task?.schedule.kind === 'cron' ? task.schedule.cronExpression : '0 9 * * *'
  form.enabled = task?.enabled ?? true
}

function submitTask(): void {
  let schedule: Pick<CreateCronTaskRequest, 'runAt'> | Pick<CreateCronTaskRequest, 'cronExpression'>
  try {
    schedule = formSchedulePayload()
  } catch (error) {
    emit('invalid', error instanceof Error ? error.message : '计划任务参数无效。')
    return
  }

  if (props.task) {
    const request: UpdateCronTaskRequest = {
      taskId: props.task.id,
      name: form.name,
      note: form.note,
      enabled: form.enabled,
      ...schedule,
    }
    if (form.targetSessionId) {
      request.targetSessionId = form.targetSessionId
    }
    emit('submit', { kind: 'update', request })
    return
  }

  emit('submit', {
    kind: 'create',
    request: {
      name: form.name,
      note: form.note,
      enabled: form.enabled,
      ...schedule,
    },
  })
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

function toDatetimeLocal(value: number): string {
  const date = new Date(value)
  const offsetMs = date.getTimezoneOffset() * 60_000
  return new Date(value - offsetMs).toISOString().slice(0, 16)
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription>
          新任务会使用独立的计划任务会话保存上下文和结果。
        </DialogDescription>
      </DialogHeader>

      <form
        class="flex flex-col gap-4"
        @submit.prevent="submitTask"
      >
        <FieldGroup>
          <Field>
            <FieldLabel for="cron-task-name">名称</FieldLabel>
            <Input
              id="cron-task-name"
              v-model="form.name"
              placeholder="例如：每日总结"
            />
          </Field>

          <Field>
            <FieldLabel for="cron-task-note">任务说明</FieldLabel>
            <Textarea
              id="cron-task-note"
              v-model="form.note"
              placeholder="写给 Agent 的计划任务说明"
              class="min-h-24"
            />
          </Field>

          <Field orientation="responsive">
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

          <Field v-if="form.scheduleMode === 'at'">
            <FieldLabel for="cron-task-run-at">运行时间</FieldLabel>
            <Input
              id="cron-task-run-at"
              v-model="form.runAtLocal"
              type="datetime-local"
            />
          </Field>

          <Field v-else>
            <FieldLabel for="cron-task-expression">Cron 表达式</FieldLabel>
            <Input
              id="cron-task-expression"
              v-model="form.cronExpression"
              placeholder="0 9 * * *"
            />
            <FieldDescription>支持五字段：分钟 小时 日期 月份 星期。</FieldDescription>
          </Field>

          <Field orientation="responsive">
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
        </FieldGroup>

        <DialogFooter>
          <Button
            v-if="!editing"
            type="button"
            variant="outline"
            @click="resetForm()"
          >
            <PlusIcon data-icon="inline-start" />
            清空
          </Button>
          <Button
            v-else
            type="button"
            variant="outline"
            @click="open = false"
          >
            <XIcon data-icon="inline-start" />
            取消
          </Button>
          <Button
            type="submit"
            :disabled="saving || !persistenceAvailable"
          >
            <SaveIcon data-icon="inline-start" />
            保存
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>

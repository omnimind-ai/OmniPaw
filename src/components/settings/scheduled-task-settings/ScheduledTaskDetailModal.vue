<script setup lang="ts">
import type { CronTask } from '@shared/types/cron'
import { Badge } from '@/components/ui/badge'
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
import { Separator } from '@/components/ui/separator'
import { formatTime, scheduleSummary, statusLabel, taskSessionLabel } from './format'

const open = defineModel<boolean>('open', { required: true })

defineProps<{
  task?: CronTask
}>()
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>任务详情</DialogTitle>
        <DialogDescription>
          {{ task ? task.name : '选择一个任务查看完整配置。' }}
        </DialogDescription>
      </DialogHeader>

      <FieldGroup v-if="task">
        <Field>
          <FieldContent>
            <FieldLabel>状态</FieldLabel>
            <FieldDescription>
              <Badge variant="secondary">{{ statusLabel(task) }}</Badge>
            </FieldDescription>
          </FieldContent>
        </Field>

        <Field>
          <FieldLabel>任务说明</FieldLabel>
          <p class="whitespace-pre-wrap break-words text-sm">
            {{ task.note || '未填写。' }}
          </p>
        </Field>

        <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field class="rounded-md border px-3 py-2">
            <FieldLabel>计划</FieldLabel>
            <FieldDescription>{{ scheduleSummary(task.schedule) }}</FieldDescription>
          </Field>
          <Field class="rounded-md border px-3 py-2">
            <FieldLabel>目标会话</FieldLabel>
            <FieldDescription>{{ taskSessionLabel(task) }}</FieldDescription>
          </Field>
          <Field class="rounded-md border px-3 py-2">
            <FieldLabel>下次运行</FieldLabel>
            <FieldDescription>{{ formatTime(task.nextRunAt) }}</FieldDescription>
          </Field>
          <Field class="rounded-md border px-3 py-2">
            <FieldLabel>正在运行</FieldLabel>
            <FieldDescription>{{ formatTime(task.runningAt) }}</FieldDescription>
          </Field>
          <Field class="rounded-md border px-3 py-2">
            <FieldLabel>上次运行</FieldLabel>
            <FieldDescription>{{ formatTime(task.lastRunAt) }}</FieldDescription>
          </Field>
          <Field class="rounded-md border px-3 py-2">
            <FieldLabel>上次完成</FieldLabel>
            <FieldDescription>{{ formatTime(task.lastCompletedAt) }}</FieldDescription>
          </Field>
          <Field class="rounded-md border px-3 py-2">
            <FieldLabel>失败次数</FieldLabel>
            <FieldDescription>{{ task.failureCount }}</FieldDescription>
          </Field>
          <Field class="rounded-md border px-3 py-2">
            <FieldLabel>启用状态</FieldLabel>
            <FieldDescription>{{ task.enabled ? '已启用' : '已停用' }}</FieldDescription>
          </Field>
        </div>

        <template v-if="task.lastError">
          <Separator />
          <Field>
            <FieldLabel>最近错误</FieldLabel>
            <FieldDescription>
              {{ task.lastError.code }} · {{ task.lastError.message }}
            </FieldDescription>
          </Field>
        </template>

        <Separator />

        <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field class="rounded-md border px-3 py-2">
            <FieldLabel>任务 ID</FieldLabel>
            <FieldDescription class="break-all">{{ task.id }}</FieldDescription>
          </Field>
          <Field class="rounded-md border px-3 py-2">
            <FieldLabel>源会话</FieldLabel>
            <FieldDescription class="break-all">{{ task.sourceSessionId }}</FieldDescription>
          </Field>
          <Field class="rounded-md border px-3 py-2">
            <FieldLabel>创建时间</FieldLabel>
            <FieldDescription>{{ formatTime(task.createdAt) }}</FieldDescription>
          </Field>
          <Field class="rounded-md border px-3 py-2">
            <FieldLabel>更新时间</FieldLabel>
            <FieldDescription>{{ formatTime(task.updatedAt) }}</FieldDescription>
          </Field>
        </div>
      </FieldGroup>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          @click="open = false"
        >
          关闭
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

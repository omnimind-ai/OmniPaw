<script setup lang="ts">
import type { CronRun, CronTask } from '@shared/types/cron'
import { RefreshCwIcon } from 'lucide-vue-next'
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
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Separator } from '@/components/ui/separator'
import { formatTime, reasonLabel, runStatusLabel } from './format'

const open = defineModel<boolean>('open', { required: true })

defineProps<{
  task?: CronTask
  runs: CronRun[]
  loading: boolean
}>()

const emit = defineEmits<{
  refresh: []
}>()
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle>运行审计</DialogTitle>
        <DialogDescription>
          {{ task ? task.name : '选择一个任务查看运行记录。' }}
        </DialogDescription>
      </DialogHeader>

      <div
        v-if="loading"
        class="px-1 py-6 text-sm text-muted-foreground"
      >
        正在加载运行记录。
      </div>

      <div
        v-else-if="!task"
        class="px-1 py-6 text-sm text-muted-foreground"
      >
        尚未选择任务。
      </div>

      <div
        v-else-if="!runs.length"
        class="px-1 py-6 text-sm text-muted-foreground"
      >
        暂无运行记录。
      </div>

      <div
        v-else
        class="flex flex-col gap-4"
      >
        <article
          v-for="(run, index) in runs"
          :key="run.id"
          class="flex flex-col gap-3"
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

          <FieldGroup>
            <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field class="rounded-md border px-3 py-2">
                <FieldLabel>计划时间</FieldLabel>
                <FieldDescription>{{ formatTime(run.scheduledFor) }}</FieldDescription>
              </Field>
              <Field class="rounded-md border px-3 py-2">
                <FieldLabel>完成时间</FieldLabel>
                <FieldDescription>{{ formatTime(run.completedAt) }}</FieldDescription>
              </Field>
              <Field class="rounded-md border px-3 py-2">
                <FieldLabel>结果消息</FieldLabel>
                <FieldDescription class="break-all">
                  {{ run.resultMessageId || '无' }}
                </FieldDescription>
              </Field>
              <Field class="rounded-md border px-3 py-2">
                <FieldLabel>记录 ID</FieldLabel>
                <FieldDescription class="break-all">{{ run.id }}</FieldDescription>
              </Field>
            </div>

            <Field v-if="run.resultSummary">
              <FieldLabel>结果摘要</FieldLabel>
              <p class="whitespace-pre-wrap break-words text-sm">
                {{ run.resultSummary }}
              </p>
            </Field>

            <Field v-if="run.error">
              <FieldLabel>错误</FieldLabel>
              <FieldDescription>
                {{ run.error.code }} · {{ run.error.message }}
                <template v-if="run.error.retryable !== undefined">
                  · {{ run.error.retryable ? '可重试' : '不可重试' }}
                </template>
              </FieldDescription>
            </Field>
          </FieldGroup>

          <Separator v-if="index < runs.length - 1" />
        </article>
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          :disabled="loading || !task"
          @click="emit('refresh')"
        >
          <RefreshCwIcon data-icon="inline-start" />
          刷新
        </Button>
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

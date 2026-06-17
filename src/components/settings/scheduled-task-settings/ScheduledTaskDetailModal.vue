<script setup lang="ts">
import type { CronTask } from '@shared/types/cron'
import { useI18n } from 'vue-i18n'
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

const { t } = useI18n()
const open = defineModel<boolean>('open', { required: true })

defineProps<{
  task?: CronTask
}>()
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{{ t('settings.scheduledTask.detailModal.title') }}</DialogTitle>
        <DialogDescription>
          {{ task ? task.name : t('settings.scheduledTask.selectTask') }}
        </DialogDescription>
      </DialogHeader>

      <FieldGroup v-if="task">
        <Field>
          <FieldContent>
            <FieldLabel>{{ t('settings.scheduledTask.statusField.title') }}</FieldLabel>
            <FieldDescription>
              <Badge variant="secondary">{{ statusLabel(task) }}</Badge>
            </FieldDescription>
          </FieldContent>
        </Field>

        <Field>
          <FieldLabel>{{ t('settings.scheduledTask.taskNote') }}</FieldLabel>
          <p class="whitespace-pre-wrap wrap-break-word text-sm">
            {{ task.note || t('settings.scheduledTask.noNote') }}
          </p>
        </Field>

        <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field class="rounded-md border px-3 py-2">
            <FieldLabel>{{ t('settings.scheduledTask.detailFields.schedule') }}</FieldLabel>
            <FieldDescription>{{ scheduleSummary(task.schedule) }}</FieldDescription>
          </Field>
          <Field class="rounded-md border px-3 py-2">
            <FieldLabel>{{ t('settings.scheduledTask.detailFields.targetSession') }}</FieldLabel>
            <FieldDescription>{{ taskSessionLabel(task) }}</FieldDescription>
          </Field>
          <Field class="rounded-md border px-3 py-2">
            <FieldLabel>{{ t('settings.scheduledTask.detailFields.nextRun') }}</FieldLabel>
            <FieldDescription>{{ formatTime(task.nextRunAt) }}</FieldDescription>
          </Field>
          <Field class="rounded-md border px-3 py-2">
            <FieldLabel>{{ t('settings.scheduledTask.detailFields.running') }}</FieldLabel>
            <FieldDescription>{{ formatTime(task.runningAt) }}</FieldDescription>
          </Field>
          <Field class="rounded-md border px-3 py-2">
            <FieldLabel>{{ t('settings.scheduledTask.detailFields.lastRun') }}</FieldLabel>
            <FieldDescription>{{ formatTime(task.lastRunAt) }}</FieldDescription>
          </Field>
          <Field class="rounded-md border px-3 py-2">
            <FieldLabel>{{ t('settings.scheduledTask.detailFields.lastCompleted') }}</FieldLabel>
            <FieldDescription>{{ formatTime(task.lastCompletedAt) }}</FieldDescription>
          </Field>
          <Field class="rounded-md border px-3 py-2">
            <FieldLabel>{{ t('settings.scheduledTask.detailFields.failureCount') }}</FieldLabel>
            <FieldDescription>{{ task.failureCount }}</FieldDescription>
          </Field>
          <Field class="rounded-md border px-3 py-2">
            <FieldLabel>{{ t('settings.scheduledTask.detailFields.enabled') }}</FieldLabel>
            <FieldDescription>{{ task.enabled ? t('settings.scheduledTask.detailFields.enabledValue') : t('settings.scheduledTask.detailFields.disabledValue') }}</FieldDescription>
          </Field>
        </div>

        <template v-if="task.lastError">
          <Separator />
          <Field>
            <FieldLabel>{{ t('settings.scheduledTask.detailFields.lastError') }}</FieldLabel>
            <FieldDescription>
              {{ task.lastError.code }} · {{ task.lastError.message }}
            </FieldDescription>
          </Field>
        </template>

        <Separator />

        <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field class="rounded-md border px-3 py-2">
            <FieldLabel>{{ t('settings.scheduledTask.detailModal.taskId') }}</FieldLabel>
            <FieldDescription class="break-all">{{ task.id }}</FieldDescription>
          </Field>
          <Field class="rounded-md border px-3 py-2">
            <FieldLabel>{{ t('settings.scheduledTask.detailModal.sourceSession') }}</FieldLabel>
            <FieldDescription class="break-all">{{ task.sourceSessionId }}</FieldDescription>
          </Field>
          <Field class="rounded-md border px-3 py-2">
            <FieldLabel>{{ t('settings.scheduledTask.detailModal.createdAt') }}</FieldLabel>
            <FieldDescription>{{ formatTime(task.createdAt) }}</FieldDescription>
          </Field>
          <Field class="rounded-md border px-3 py-2">
            <FieldLabel>{{ t('settings.scheduledTask.detailModal.updatedAt') }}</FieldLabel>
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
          {{ t('settings.scheduledTask.detailModal.close') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

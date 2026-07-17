<script setup lang="ts">
import { HistoryIcon, PencilIcon, XIcon } from '@lucide/vue'
import type { CronTask } from '@shared/types/cron'
import { useI18n } from 'vue-i18n'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { formatTime, scheduleSummary, statusLabel, taskSessionLabel } from './format'

const { t } = useI18n()
const open = defineModel<boolean>('open', { required: true })

const props = defineProps<{
  task?: CronTask
}>()

const emit = defineEmits<{
  audit: [task: CronTask]
  edit: [task: CronTask]
}>()

function openAudit(): void {
  if (!props.task) return
  open.value = false
  emit('audit', props.task)
}

function editTask(): void {
  if (!props.task) return
  open.value = false
  emit('edit', props.task)
}
</script>

<template>
  <Sheet v-model:open="open">
    <SheetContent
      side="right"
      class="w-full gap-0 p-0 sm:max-w-xl"
      :show-close-button="false"
    >
      <SheetHeader class="flex-row items-start gap-3 px-5 py-4 text-left">
        <div class="min-w-0 flex-1">
          <SheetTitle>{{ t('settings.scheduledTask.detailModal.title') }}</SheetTitle>
          <SheetDescription>
            {{ task ? task.name : t('settings.scheduledTask.selectTask') }}
          </SheetDescription>
        </div>
        <SheetClose as-child>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            :aria-label="t('settings.scheduledTask.detailModal.close')"
          >
            <XIcon />
          </Button>
        </SheetClose>
      </SheetHeader>

      <Separator />

      <div
        v-if="task"
        class="min-h-0 flex-1 overflow-y-auto px-5 py-5"
      >
        <FieldGroup>
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
            <p class="whitespace-pre-wrap break-words text-sm">
              {{ task.note || t('settings.scheduledTask.noNote') }}
            </p>
          </Field>

          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
              <FieldDescription>
                {{ task.enabled ? t('settings.scheduledTask.detailFields.enabledValue') : t('settings.scheduledTask.detailFields.disabledValue') }}
              </FieldDescription>
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

          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
      </div>

      <Separator />
      <SheetFooter class="grid grid-cols-2 p-4">
        <Button
          type="button"
          variant="outline"
          :disabled="!task"
          @click="openAudit"
        >
          <HistoryIcon data-icon="inline-start" />
          {{ t('settings.scheduledTask.listItem.viewAudit') }}
        </Button>
        <Button
          type="button"
          :disabled="!task"
          @click="editTask"
        >
          <PencilIcon data-icon="inline-start" />
          {{ t('settings.scheduledTask.listItem.editTask') }}
        </Button>
      </SheetFooter>
    </SheetContent>
  </Sheet>
</template>

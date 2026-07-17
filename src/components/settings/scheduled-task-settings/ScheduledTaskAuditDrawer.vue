<script setup lang="ts">
import { RefreshCwIcon, XIcon } from '@lucide/vue'
import type { CronRun, CronTask } from '@shared/types/cron'
import { useI18n } from 'vue-i18n'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
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
import { formatTime, reasonLabel, runStatusLabel } from './format'

const { t } = useI18n()

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
  <Sheet v-model:open="open">
    <SheetContent
      side="right"
      class="w-full gap-0 p-0 sm:max-w-2xl"
      :show-close-button="false"
    >
      <SheetHeader class="flex-row items-start gap-3 px-5 py-4 text-left">
        <div class="min-w-0 flex-1">
          <SheetTitle>{{ t('settings.scheduledTask.auditModal.title') }}</SheetTitle>
          <SheetDescription>
            {{ task ? task.name : t('settings.scheduledTask.auditModal.selectTaskPrompt') }}
          </SheetDescription>
        </div>
        <SheetClose as-child>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            :aria-label="t('settings.scheduledTask.auditModal.close')"
          >
            <XIcon />
          </Button>
        </SheetClose>
      </SheetHeader>

      <Separator />

      <div class="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        <div
          v-if="loading"
          class="py-6 text-sm text-muted-foreground"
        >
          {{ t('settings.scheduledTask.auditModal.loadingRuns') }}
        </div>

        <div
          v-else-if="!task"
          class="py-6 text-sm text-muted-foreground"
        >
          {{ t('settings.scheduledTask.auditModal.noTaskSelected') }}
        </div>

        <div
          v-else-if="!runs.length"
          class="py-6 text-sm text-muted-foreground"
        >
          {{ t('settings.scheduledTask.auditModal.noRuns') }}
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
              <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field class="rounded-md border px-3 py-2">
                  <FieldLabel>{{ t('settings.scheduledTask.auditModal.scheduledTime') }}</FieldLabel>
                  <FieldDescription>{{ formatTime(run.scheduledFor) }}</FieldDescription>
                </Field>
                <Field class="rounded-md border px-3 py-2">
                  <FieldLabel>{{ t('settings.scheduledTask.auditModal.completionTime') }}</FieldLabel>
                  <FieldDescription>{{ formatTime(run.completedAt) }}</FieldDescription>
                </Field>
                <Field class="rounded-md border px-3 py-2">
                  <FieldLabel>{{ t('settings.scheduledTask.auditModal.resultMessage') }}</FieldLabel>
                  <FieldDescription class="break-all">
                    {{ run.resultMessageId || t('settings.scheduledTask.auditModal.none') }}
                  </FieldDescription>
                </Field>
                <Field class="rounded-md border px-3 py-2">
                  <FieldLabel>{{ t('settings.scheduledTask.auditModal.recordId') }}</FieldLabel>
                  <FieldDescription class="break-all">{{ run.id }}</FieldDescription>
                </Field>
              </div>

              <Field v-if="run.resultSummary">
                <FieldLabel>{{ t('settings.scheduledTask.auditModal.resultSummary') }}</FieldLabel>
                <p class="whitespace-pre-wrap break-words text-sm">
                  {{ run.resultSummary }}
                </p>
              </Field>

              <Field v-if="run.error">
                <FieldLabel>{{ t('settings.scheduledTask.auditModal.error') }}</FieldLabel>
                <FieldDescription>
                  {{ run.error.code }} · {{ run.error.message }}
                  <template v-if="run.error.retryable !== undefined">
                    · {{ run.error.retryable ? t('settings.scheduledTask.auditModal.retryable') : t('settings.scheduledTask.auditModal.notRetryable') }}
                  </template>
                </FieldDescription>
              </Field>
            </FieldGroup>

            <Separator v-if="index < runs.length - 1" />
          </article>
        </div>
      </div>

      <Separator />
      <SheetFooter class="grid grid-cols-2 p-4">
        <Button
          type="button"
          variant="outline"
          :disabled="loading || !task"
          @click="emit('refresh')"
        >
          <RefreshCwIcon data-icon="inline-start" />
          {{ t('settings.scheduledTask.auditModal.refresh') }}
        </Button>
        <SheetClose as-child>
          <Button
            type="button"
            variant="outline"
          >
            {{ t('settings.scheduledTask.auditModal.close') }}
          </Button>
        </SheetClose>
      </SheetFooter>
    </SheetContent>
  </Sheet>
</template>

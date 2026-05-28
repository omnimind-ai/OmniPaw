<script setup lang="ts">
import type {
  ObservationChangedEvent,
  ObservationErrorInfo,
  ObservationRun,
} from '@shared/types/observation'
import { EyeIcon, EyeOffIcon, Loader2Icon, RefreshCwIcon } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import { computed, onMounted, watch } from 'vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useObservationStore } from '@/stores/observation'
import { useSettingsStore } from '@/stores/settings'
import { errorToText, useToast } from '@/utils/toast'

const props = withDefaults(
  defineProps<{
    sessionId?: string
    sessionKind: 'chat' | 'cat'
    surface?: 'chat' | 'cat'
    disabled?: boolean
    compact?: boolean
  }>(),
  {
    surface: undefined,
    disabled: false,
    compact: false,
  }
)

const observationStore = useObservationStore()
const settingsStore = useSettingsStore()
const toast = useToast()
const { running, loading } = storeToRefs(observationStore)
const notifiedErrorKeys = new Set<string>()

const settings = computed(
  () => settingsStore.draft?.observation ?? settingsStore.config?.observation
)
const activeRun = computed(() => observationStore.activeRun)
const latestSessionEvent = computed(() => eventForCurrentSession(observationStore.lastEvent))
const busy = computed(() => running.value || loading.value)
const statusLabel = computed(() => {
  if (activeRun.value) return '运行中'
  if (latestSessionEvent.value?.reason === 'failed') return '观察失败'
  return '未观察'
})
const canStart = computed(() => Boolean(settings.value) && !props.disabled && !busy.value)
const canControl = computed(() => Boolean(activeRun.value) && !props.disabled && !busy.value)

onMounted(async () => {
  const tasks: Array<Promise<unknown>> = [observationStore.load()]
  if (!settingsStore.config && !settingsStore.draft) {
    tasks.push(settingsStore.load())
  }
  const results = await Promise.allSettled(tasks)
  results.forEach((result) => {
    if (result.status === 'rejected') {
      toast.error(result.reason, { description: '观察状态加载失败' })
    }
  })
})

watch(
  () => observationStore.lastEvent,
  (event) => {
    handleObservationEvent(event)
  }
)

async function handleStart(): Promise<void> {
  if (!settings.value) {
    toast.info('主动视觉设置尚未加载')
    return
  }

  await startObservation()
}

async function startObservation(): Promise<void> {
  if (!settings.value) return
  try {
    await observationStore.start({
      scope: settings.value.defaultScope,
      screenshotRetention: settings.value.screenshotRetention,
    })
  } catch (error) {
    toast.error(errorToText(error, '主动视觉观察启动失败。'))
  }
}

async function handleStop(): Promise<void> {
  const run = activeRun.value
  if (!run) return
  try {
    await observationStore.stop({ runId: run.id, reason: 'user' })
  } catch (error) {
    toast.error(errorToText(error, '停止观察失败。'))
  }
}

async function handleTrigger(): Promise<void> {
  const run = activeRun.value
  if (!run) return
  const triggeredAt = Date.now()
  try {
    await observationStore.trigger({ runId: run.id })
    const active = observationStore.activeRun
    if (
      active?.id === run.id &&
      active.lastDecision?.decision === 'silent' &&
      active.lastDecision.createdAt >= triggeredAt
    ) {
      toast.info('本次观察已完成，模型未输出可见内容。')
    }
  } catch (error) {
    const event = latestSessionEvent.value
    const eventError = event?.run ? (event.error ?? event.run.error) : undefined
    const active = observationStore.activeRun
    const runError = active?.id === run.id ? active.error : undefined
    if (event?.run && eventError) {
      notifyObservationError(event.run, eventError, '立即观察失败。')
    } else if (active && runError) {
      notifyObservationError(active, runError, '立即观察失败。')
    } else {
      toast.error(errorToText(error, '立即观察失败。'))
    }
  }
}

function handleObservationEvent(event: ObservationChangedEvent | null): void {
  const sessionEvent = eventForCurrentSession(event)
  if (!sessionEvent?.run) return

  if (sessionEvent.reason === 'failed') {
    const error = sessionEvent.error ?? sessionEvent.run.error
    if (error) {
      notifyObservationError(sessionEvent.run, error, '主动视觉观察失败。')
    }
    return
  }
}

function eventForCurrentSession(
  event: ObservationChangedEvent | null
): ObservationChangedEvent | null {
  return event?.run ? event : null
}

function notifyObservationError(
  run: ObservationRun,
  error: ObservationErrorInfo,
  fallback: string
): void {
  const key = `${run.id}:${run.failureCount}:${run.status}:${error.code}:${error.message}`
  if (notifiedErrorKeys.has(key)) {
    return
  }
  if (notifiedErrorKeys.size > 30) {
    notifiedErrorKeys.clear()
  }
  notifiedErrorKeys.add(key)
  toast.error(errorToText(error, fallback), { description: '主动视觉观察' })
}
</script>

<template>
  <TooltipProvider>
    <div class="flex min-w-0 items-center gap-1.5">
      <Badge
        variant="outline"
        class="hidden shrink-0 gap-1 px-2 sm:inline-flex"
      >
        <EyeIcon />
        {{ statusLabel }}
      </Badge>

      <Tooltip>
        <TooltipTrigger as-child>
          <Button
            v-if="!activeRun"
            type="button"
            variant="outline"
            size="icon-sm"
            :disabled="!canStart"
            aria-label="开始观察"
            @click="handleStart"
          >
            <Loader2Icon
              v-if="busy"
              class="animate-spin"
            />
            <EyeIcon v-else />
          </Button>
          <Button
            v-else
            type="button"
            variant="outline"
            size="icon-sm"
            :disabled="!canControl"
            aria-label="停止观察"
            @click="handleStop"
          >
            <Loader2Icon
              v-if="busy"
              class="animate-spin"
            />
            <EyeOffIcon v-else />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {{ activeRun ? '停止观察' : '开始观察' }}
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger as-child>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            :disabled="!canControl"
            aria-label="立即观察一次"
            @click="handleTrigger"
          >
            <RefreshCwIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent>立即观察一次</TooltipContent>
      </Tooltip>
    </div>
  </TooltipProvider>
</template>

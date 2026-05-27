<script setup lang="ts">
import type {
  ObservationChangedEvent,
  ObservationErrorInfo,
  ObservationRemoteRiskAcceptance,
  ObservationRun,
} from '@shared/types/observation'
import { EyeIcon, EyeOffIcon, Loader2Icon, RefreshCwIcon, TimerIcon } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ObservationRiskConfirmModal from '@/components/observation/ObservationRiskConfirmModal.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useObservationStore } from '@/stores/observation'
import type { ProviderModelOption } from '@/stores/provider'
import { modelRefToKey, parseModelKey, useProviderStore } from '@/stores/provider'
import { useSettingsStore } from '@/stores/settings'
import { errorToText, useToast } from '@/utils/toast'

const props = withDefaults(
  defineProps<{
    sessionId?: string
    sessionKind: 'chat' | 'cat'
    surface?: 'chat' | 'cat'
    fallbackModelKey?: string
    disabled?: boolean
    compact?: boolean
  }>(),
  {
    surface: undefined,
    fallbackModelKey: '',
    disabled: false,
    compact: false,
  }
)

interface RemoteRisk {
  vision: boolean
  reaction: boolean
  blocked: boolean
  reason?: string
}

const localHostnames = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0'])

const observationStore = useObservationStore()
const settingsStore = useSettingsStore()
const providerStore = useProviderStore()
const toast = useToast()
const { running, loading } = storeToRefs(observationStore)
const now = ref(Date.now())
const riskModalOpen = ref(false)
const pendingRisk = ref<RemoteRisk>({ vision: false, reaction: false, blocked: false })
const notifiedErrorKeys = new Set<string>()
let clock: ReturnType<typeof window.setInterval> | undefined

const settings = computed(
  () => settingsStore.draft?.observation ?? settingsStore.config?.observation
)
const activeRun = computed(() => observationStore.runForSession(props.sessionId))
const latestSessionEvent = computed(() => eventForCurrentSession(observationStore.lastEvent))
const enabled = computed(() => settings.value?.enabled === true)
const busy = computed(() => running.value || loading.value)
const remainingMs = computed(() =>
  activeRun.value ? Math.max(0, activeRun.value.expiresAt - now.value) : 0
)
const statusLabel = computed(() => {
  if (activeRun.value) return formatRemaining(remainingMs.value)
  if (latestSessionEvent.value?.reason === 'failed') return '观察失败'
  if (latestSessionEvent.value?.reason === 'expired') return '已结束'
  if (!enabled.value) return '未启用'
  return '未观察'
})
const canStart = computed(
  () => Boolean(props.sessionId) && enabled.value && !props.disabled && !busy.value
)
const canControl = computed(() => Boolean(activeRun.value) && !props.disabled && !busy.value)

onMounted(async () => {
  clock = window.setInterval(() => {
    now.value = Date.now()
  }, 1000)
  const tasks: Array<Promise<unknown>> = [observationStore.load()]
  if (!settingsStore.config && !settingsStore.draft) {
    tasks.push(settingsStore.load())
  }
  if (!providerStore.modelOptions.length) {
    tasks.push(providerStore.loadProviders())
  }
  const results = await Promise.allSettled(tasks)
  results.forEach((result) => {
    if (result.status === 'rejected') {
      toast.error(result.reason, { description: '观察状态加载失败' })
    }
  })
})

onBeforeUnmount(() => {
  if (clock) {
    window.clearInterval(clock)
    clock = undefined
  }
})

watch(
  () => observationStore.lastEvent,
  (event) => {
    handleObservationEvent(event)
  }
)

async function handleStart(): Promise<void> {
  if (!props.sessionId) {
    toast.info('当前会话尚未创建')
    return
  }
  if (!enabled.value) {
    toast.info('请先在设置中启用主动视觉观察')
    return
  }

  const risk = resolveRemoteRisk()
  if (risk.blocked) {
    toast.error(risk.reason || '当前观察设置不允许使用外部 Provider。')
    return
  }
  if (risk.vision || risk.reaction) {
    pendingRisk.value = risk
    riskModalOpen.value = true
    return
  }

  await startObservation()
}

async function confirmRiskAndStart(): Promise<void> {
  await startObservation({
    vision: pendingRisk.value.vision,
    reaction: pendingRisk.value.reaction,
  })
  riskModalOpen.value = false
}

async function startObservation(
  remoteRiskAccepted?: ObservationRemoteRiskAcceptance
): Promise<void> {
  if (!props.sessionId || !settings.value) return
  try {
    await observationStore.start({
      targetSessionId: props.sessionId,
      targetSessionKind: props.sessionKind,
      surface: props.surface ?? (props.sessionKind === 'cat' ? 'cat' : 'chat'),
      durationMs: settings.value.defaultDurationMs,
      intervalMs: settings.value.defaultIntervalMs,
      scope: settings.value.defaultScope,
      outputMode: settings.value.outputMode,
      retention: settings.value.retention,
      allowRemoteProviders: settings.value.allowRemoteProviders,
      localOnly: settings.value.localOnly,
      ...(remoteRiskAccepted ? { remoteRiskAccepted } : {}),
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
    const active = observationStore.runForSession(props.sessionId)
    if (
      active?.id === run.id &&
      active.lastDecision?.mode === 'silent' &&
      active.lastDecision.createdAt >= triggeredAt
    ) {
      toast.info('本次观察已完成，模型未输出可见内容。')
    }
  } catch (error) {
    const event = latestSessionEvent.value
    const eventError = event?.run ? (event.error ?? event.run.error) : undefined
    const active = observationStore.runForSession(props.sessionId)
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

  if (
    sessionEvent.reason === 'expired' &&
    !sessionEvent.run.lastDecision &&
    sessionEvent.run.error
  ) {
    notifyObservationError(
      sessionEvent.run,
      sessionEvent.run.error,
      '主动视觉观察已结束，期间没有成功完成观察。'
    )
  }
}

function eventForCurrentSession(
  event: ObservationChangedEvent | null
): ObservationChangedEvent | null {
  if (!props.sessionId || !event?.run) return null
  return event.run.targetSessionId === props.sessionId ? event : null
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

function resolveRemoteRisk(): RemoteRisk {
  const observationSettings = settings.value
  if (!observationSettings) {
    return { vision: false, reaction: false, blocked: false }
  }

  const chain = resolveLikelyModelChain()
  const vision = chain.vision ? !isLocalModel(chain.vision) : false
  const reaction = chain.reaction ? !isLocalModel(chain.reaction) && chain.mode === 'split' : false
  const hasRisk = vision || reaction
  if (hasRisk && observationSettings.localOnly) {
    return {
      vision,
      reaction,
      blocked: true,
      reason: 'localOnly 已开启，请切换到本地视觉和 reaction 模型。',
    }
  }
  if (hasRisk && !observationSettings.allowRemoteProviders) {
    return {
      vision,
      reaction,
      blocked: true,
      reason: '当前观察设置不允许使用外部 Provider。',
    }
  }
  return { vision, reaction, blocked: false }
}

function resolveLikelyModelChain(): {
  vision?: ProviderModelOption
  reaction?: ProviderModelOption
  mode: 'single_multimodal' | 'split'
} {
  const vision = optionByRefKey(
    modelRefToKey(providerStore.registrySettings.observationVisionModelRef)
  )
  const reaction = optionByRefKey(
    modelRefToKey(providerStore.registrySettings.observationReactionModelRef)
  )

  if (vision && reaction) {
    return { vision, reaction, mode: 'split' }
  }
  if (vision) {
    return { vision, reaction: vision, mode: 'single_multimodal' }
  }
  if (reaction?.input.includes('image')) {
    return { vision: reaction, reaction, mode: 'single_multimodal' }
  }

  const fallbackVision = resolveVisionFallback()
  return reaction
    ? { vision: fallbackVision, reaction, mode: 'split' }
    : { vision: fallbackVision, reaction: fallbackVision, mode: 'single_multimodal' }
}

function resolveVisionFallback(): ProviderModelOption | undefined {
  const candidates = [
    props.fallbackModelKey,
    providerStore.defaultModelKey,
    ...providerStore.fallbackModelKeys,
  ]
  for (const key of candidates) {
    const option = optionByRefKey(key)
    if (option?.input.includes('image')) {
      return option
    }
  }
  return providerStore.enabledModelOptions.find((option) => option.input.includes('image'))
}

function optionByRefKey(key: string | undefined): ProviderModelOption | undefined {
  if (!key) return undefined
  const ref = parseModelKey(key)
  if (!ref) return undefined
  return providerStore.enabledModelOptions.find((option) => option.key === modelRefToKey(ref))
}

function isLocalModel(option: ProviderModelOption): boolean {
  if (option.providerType === 'ollama' || option.providerType === 'omniinfer') {
    return true
  }
  try {
    return localHostnames.has(new URL(option.baseUrl).hostname)
  } catch {
    return false
  }
}

function formatRemaining(value: number): string {
  const totalSeconds = Math.max(0, Math.ceil(value / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
</script>

<template>
  <TooltipProvider>
    <div class="flex min-w-0 items-center gap-1.5">
      <Badge
        variant="outline"
        class="hidden shrink-0 gap-1 px-2 sm:inline-flex"
      >
        <TimerIcon />
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

  <ObservationRiskConfirmModal
    v-model:open="riskModalOpen"
    :vision="pendingRisk.vision"
    :reaction="pendingRisk.reaction"
    :busy="busy"
    @confirm="confirmRiskAndStart"
  />
</template>

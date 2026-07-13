<script setup lang="ts">
import {
  AlertTriangleIcon,
  BookOpenIcon,
  BrainIcon,
  CalculatorIcon,
  CalendarClockIcon,
  ChevronDownIcon,
  CircleDashedIcon,
  ClockIcon,
  EyeIcon,
  FilePenLineIcon,
  FileSearchIcon,
  FileTextIcon,
  PaperclipIcon,
  PlayIcon,
  SearchIcon,
  ShieldOffIcon,
  SquareTerminalIcon,
  WrenchIcon,
  XCircleIcon,
} from '@lucide/vue'
import { type Component, computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { appBridge } from '@/bridge/app'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Marker, MarkerContent, MarkerIcon } from '@/components/ui/marker'
import type { ToolCall } from '@/composables/useMessages'
import { cn } from '@/lib/utils'
import { errorToText, useToast } from '@/utils/toast'
import { formatJson, toolCallLabel, toolCallStatus } from '../chat-display'

const props = defineProps<{
  toolCall: ToolCall
}>()

defineEmits<{
  openWorkspaceFile: [payload: { path: string; lineStart?: number; lineEnd?: number }]
}>()

const open = ref(false)
const deciding = ref(false)
const toast = useToast()
const { t } = useI18n()
const status = computed(() => toolCallStatus(props.toolCall))
const label = computed(() => toolCallLabel(props.toolCall, t))
const toolName = computed(() =>
  String(props.toolCall.name || props.toolCall.toolName || props.toolCall.tool_name || '')
)

const approval = computed(() =>
  props.toolCall.approval && typeof props.toolCall.approval === 'object'
    ? props.toolCall.approval
    : undefined
)
const runId = computed(() => String(props.toolCall.runId ?? props.toolCall.run_id ?? ''))
const toolCallId = computed(() =>
  String(props.toolCall.id ?? props.toolCall.toolCallId ?? props.toolCall.tool_call_id ?? '')
)
const approvalPending = computed(
  () =>
    status.value === 'pending' &&
    approval.value?.required === true &&
    approval.value?.state === 'pending' &&
    Boolean(runId.value && toolCallId.value)
)
const approvalReason = computed(() => {
  if (!approval.value?.required) {
    return undefined
  }
  if (approval.value.risk === 'write') {
    return t('chat.toolCall.approval.writeReason')
  }
  if (approval.value.risk === 'network') {
    return t('chat.toolCall.approval.networkReason')
  }
  if (approval.value.risk === 'exec') {
    return t('chat.toolCall.approval.execReason')
  }
  return approval.value.reason
})
const approvalPlan = computed(() => {
  const plan = approval.value?.plan
  if (!plan || typeof plan !== 'object') return undefined
  return plan
})
const detailRows = computed(() =>
  [
    [t('chat.toolCall.details.arguments'), props.toolCall.args ?? props.toolCall.arguments],
    [t('chat.toolCall.details.approval'), approvalReason.value],
    [t('chat.toolCall.details.plan'), approvalPlan.value],
    [t('chat.toolCall.details.result'), props.toolCall.result],
    [t('chat.toolCall.details.error'), props.toolCall.error],
  ].filter(([, value]) => value !== undefined && value !== null && value !== '')
)

const statusLabel = computed(() => {
  if (status.value === 'complete') return t('chat.toolCall.status.complete')
  if (status.value === 'error') return t('chat.toolCall.status.error')
  if (status.value === 'denied') return t('chat.toolCall.status.denied')
  if (status.value === 'aborted') return t('chat.toolCall.status.aborted')
  if (approvalPending.value) return t('chat.toolCall.status.approvalPending')
  if (status.value === 'pending') return t('chat.toolCall.status.pending')
  return t('chat.toolCall.status.running')
})

const progressing = computed(
  () => status.value === 'running' || (status.value === 'pending' && !approvalPending.value)
)

const statusLabelClass = computed(() => cn('shrink-0 text-xs', progressing.value && 'shimmer'))

const statusIcon = computed(() => {
  if (status.value === 'error') return XCircleIcon
  if (status.value === 'denied') return ShieldOffIcon
  if (status.value === 'aborted') return AlertTriangleIcon
  if (status.value === 'pending') return CircleDashedIcon
  if (status.value === 'complete') return toolIcon(toolName.value)
  if (status.value === 'running') return WrenchIcon
  return toolIcon(toolName.value)
})

function toolIcon(name: string): Component {
  if (name === 'system_time') return ClockIcon
  if (name === 'calculator') return CalculatorIcon
  if (name === 'attachment_text_read') return PaperclipIcon
  if (name === 'attachment_text_search') return SearchIcon
  if (name === 'memory_search') return BrainIcon
  if (
    name === 'memory_create' ||
    name === 'memory_update_proposal' ||
    name === 'memory_forget_proposal'
  ) {
    return BrainIcon
  }
  if (name === 'skill_read') return BookOpenIcon
  if (name === 'future_task') return CalendarClockIcon
  if (name === 'screen_observe') return EyeIcon
  if (name === 'terminal_exec') return SquareTerminalIcon
  if (name === 'workspace_file') {
    const action = workspaceAction(props.toolCall.args ?? props.toolCall.arguments)
    if (action === 'write' || action === 'patch') return FilePenLineIcon
    if (action === 'search') return FileSearchIcon
    return FileTextIcon
  }
  return WrenchIcon
}

function workspaceAction(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ''
  const action = (value as Record<string, unknown>).action
  return typeof action === 'string' ? action : ''
}

async function decideToolApproval(action: 'approve' | 'reject') {
  if (!appBridge.chat.approveToolCall || !runId.value || !toolCallId.value) {
    toast.error(t('chat.toolCall.approval.unavailable'))
    return
  }
  deciding.value = true
  try {
    const response = await appBridge.chat.approveToolCall({
      runId: runId.value,
      toolCallId: toolCallId.value,
      action,
    })
    if (!response.accepted) {
      toast.error(response.reason || t('chat.toolCall.approval.expired'))
    }
  } catch (error) {
    toast.error(errorToText(error, t('chat.toolCall.approval.failed')))
  } finally {
    deciding.value = false
  }
}
</script>

<template>
  <Collapsible
    v-model:open="open"
    class="w-full"
  >
    <div class="flex min-w-0 flex-col gap-1.5">
      <CollapsibleTrigger as-child>
        <Marker
          as="button"
          type="button"
          :disabled="!detailRows.length"
          class="min-h-6 cursor-pointer rounded-md px-1 py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-default"
          :aria-label="t('chat.toolCall.expandDetails')"
        >
          <MarkerIcon>
            <component
              :is="statusIcon"
              :class="cn(progressing && 'animate-spin')"
            />
          </MarkerIcon>
          <MarkerContent class="flex min-w-0 flex-1 items-center gap-2">
            <span class="min-w-0 truncate font-medium">
              {{ label }}
            </span>
            <span :class="statusLabelClass">
              {{ statusLabel }}
            </span>
            <span
              v-if="toolCall.durationMs"
              class="shrink-0 text-xs text-muted-foreground/70"
            >
              {{ Math.round(Number(toolCall.durationMs)) }} ms
            </span>
          </MarkerContent>
          <MarkerIcon
            v-if="detailRows.length"
            class="ml-auto"
          >
            <ChevronDownIcon
              :class="cn('transition-transform', open && 'rotate-180')"
            />
          </MarkerIcon>
        </Marker>
      </CollapsibleTrigger>

      <div
        v-if="approvalPending"
        class="flex flex-wrap items-center gap-1.5 pl-6"
      >
        <Button
          type="button"
          size="xs"
          :disabled="deciding"
          @click="decideToolApproval('approve')"
        >
          <PlayIcon data-icon="inline-start" />
          {{ t('chat.toolCall.approval.approve') }}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="xs"
          :disabled="deciding"
          @click="decideToolApproval('reject')"
        >
          {{ t('chat.toolCall.approval.reject') }}
        </Button>
      </div>

      <CollapsibleContent v-if="detailRows.length">
        <div class="flex max-w-full flex-col gap-2 pt-1 pl-6">
          <div
            v-for="[title, value] in detailRows"
            :key="title"
            class="flex flex-col gap-1"
          >
            <span class="text-[0.7rem] font-medium text-muted-foreground">{{ title }}</span>
            <pre class="max-h-48 overflow-auto rounded-md bg-muted/60 p-2 text-[0.7rem] leading-4 text-muted-foreground">{{ formatJson(value) }}</pre>
          </div>
        </div>
      </CollapsibleContent>
    </div>
  </Collapsible>
</template>

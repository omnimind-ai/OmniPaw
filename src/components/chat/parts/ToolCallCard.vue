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
  FolderOpenIcon,
  PaperclipIcon,
  PlayIcon,
  SearchIcon,
  ShieldOffIcon,
  SquareTerminalIcon,
  WrenchIcon,
  XCircleIcon,
} from 'lucide-vue-next'
import { type Component, computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { appBridge } from '@/bridge/app'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import type { ToolCall } from '@/composables/useMessages'
import { cn } from '@/lib/utils'
import { errorToText, useToast } from '@/utils/toast'
import { formatJson, toolCallLabel, toolCallStatus } from '../chat-display'

const props = defineProps<{
  toolCall: ToolCall
}>()

const emit = defineEmits<{
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

const workspaceFilePath = computed(() => {
  if (toolName.value !== 'workspace_file') return ''
  if (status.value !== 'complete') return ''
  const result = props.toolCall.result
  if (!result || typeof result !== 'object') return ''
  const payload = result as Record<string, unknown>
  const action = payload.action
  if (action !== 'write' && action !== 'patch') return ''
  const entry = payload.entry
  if (!entry || typeof entry !== 'object') return ''
  const path = (entry as Record<string, unknown>).path
  return typeof path === 'string' ? path : ''
})

function workspaceFileName(path: string) {
  const cleaned = path.replace(/\\+/g, '/')
  const slash = cleaned.lastIndexOf('/')
  return slash >= 0 ? cleaned.slice(slash + 1) : cleaned
}

function openWorkspaceFile() {
  const path = workspaceFilePath.value
  if (!path) return
  emit('openWorkspaceFile', { path })
}
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
    return '此工具会修改本地数据，授权后会继续执行当前回复。'
  }
  if (approval.value.risk === 'network') {
    return '此工具需要访问网络，授权后会继续执行当前回复。'
  }
  if (approval.value.risk === 'exec') {
    return '此工具需要执行本地命令，授权后会继续执行当前回复。'
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
    ['参数', props.toolCall.args ?? props.toolCall.arguments],
    ['授权', approvalReason.value],
    ['执行计划', approvalPlan.value],
    ['结果', props.toolCall.result],
    ['错误', props.toolCall.error],
  ].filter(([, value]) => value !== undefined && value !== null && value !== '')
)

const statusLabel = computed(() => {
  if (status.value === 'complete') return '完成'
  if (status.value === 'error') return '错误'
  if (status.value === 'denied') return '已拒绝'
  if (status.value === 'aborted') return '已中止'
  if (approvalPending.value) return '待授权'
  if (status.value === 'pending') return '等待中'
  return '运行中'
})

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
    toast.error('当前运行无法处理工具授权。')
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
      toast.error(response.reason || '工具授权请求已失效。')
    }
  } catch (error) {
    toast.error(errorToText(error, '工具授权失败。'))
  } finally {
    deciding.value = false
  }
}
</script>

<template>
  <Collapsible
    v-model:open="open"
    class="w-full border-l pl-2.5"
  >
    <div class="flex min-w-0 flex-col gap-1.5">
      <CollapsibleTrigger as-child>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          :disabled="!detailRows.length"
          class="h-6 w-full justify-between px-0 text-xs font-normal text-muted-foreground hover:bg-transparent hover:text-foreground disabled:opacity-100"
          aria-label="展开工具调用详情"
        >
          <span class="flex min-w-0 items-center gap-2">
            <component
              :is="statusIcon"
              data-icon="inline-start"
              :class="cn(status === 'running' && 'animate-spin')"
              aria-hidden="true"
            />
            <span class="min-w-0 truncate font-medium">
              {{ label }}
            </span>
            <span class="shrink-0 text-muted-foreground/70">
              {{ statusLabel }}
            </span>
            <span
              v-if="toolCall.durationMs"
              class="shrink-0 text-muted-foreground/70"
            >
              {{ Math.round(Number(toolCall.durationMs)) }} ms
            </span>
          </span>
          <span class="flex shrink-0 items-center">
            <ChevronDownIcon
              v-if="detailRows.length"
              data-icon="inline-end"
              :class="cn('transition-transform', open && 'rotate-180')"
            />
          </span>
        </Button>
      </CollapsibleTrigger>

      <button
        v-if="workspaceFilePath"
        type="button"
        class="group/file flex w-fit items-center gap-1.5 rounded-md border bg-background/80 px-2 py-0.5 text-[0.7rem] text-muted-foreground transition-colors hover:border-ring hover:bg-accent hover:text-foreground"
        :aria-label="`在文件夹中显示 ${workspaceFilePath}`"
        :title="workspaceFilePath"
        @click="openWorkspaceFile"
      >
        <FolderOpenIcon
          data-icon="inline-start"
          aria-hidden="true"
        />
        <span class="truncate font-mono">
          {{ workspaceFileName(workspaceFilePath) }}
        </span>
      </button>

      <div
        v-if="approvalPending"
        class="flex flex-wrap items-center gap-1.5"
      >
        <Button
          type="button"
          size="xs"
          :disabled="deciding"
          @click="decideToolApproval('approve')"
        >
          <PlayIcon data-icon="inline-start" />
          授权并继续
        </Button>
        <Button
          type="button"
          variant="outline"
          size="xs"
          :disabled="deciding"
          @click="decideToolApproval('reject')"
        >
          拒绝
        </Button>
      </div>

      <CollapsibleContent v-if="detailRows.length">
        <div class="flex max-w-full flex-col gap-2 pt-1">
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

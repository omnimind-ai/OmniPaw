<script setup lang="ts">
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  CircleDashedIcon,
  ShieldOffIcon,
  WrenchIcon,
  XCircleIcon,
} from 'lucide-vue-next'
import { computed, ref } from 'vue'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import type { ToolCall } from '@/composables/useMessages'
import { cn } from '@/lib/utils'
import { formatJson, toolCallLabel, toolCallStatus } from '../chat-display'

const props = defineProps<{
  toolCall: ToolCall
}>()

const open = ref(false)
const status = computed(() => toolCallStatus(props.toolCall))
const label = computed(() => toolCallLabel(props.toolCall))
const detailRows = computed(() =>
  [
    ['参数', props.toolCall.args ?? props.toolCall.arguments],
    ['结果', props.toolCall.result],
    ['错误', props.toolCall.error],
  ].filter(([, value]) => value !== undefined && value !== null && value !== '')
)

const statusLabel = computed(() => {
  if (status.value === 'complete') return '完成'
  if (status.value === 'error') return '错误'
  if (status.value === 'denied') return '已拒绝'
  if (status.value === 'aborted') return '已中止'
  if (status.value === 'pending') return '等待中'
  return '运行中'
})

const statusIcon = computed(() => {
  if (status.value === 'complete') return CheckCircle2Icon
  if (status.value === 'error') return XCircleIcon
  if (status.value === 'denied') return ShieldOffIcon
  if (status.value === 'aborted') return AlertTriangleIcon
  if (status.value === 'pending') return CircleDashedIcon
  return WrenchIcon
})

const statusVariant = computed(() => {
  if (status.value === 'error' || status.value === 'denied' || status.value === 'aborted')
    return 'destructive'
  if (status.value === 'complete') return 'secondary'
  return 'outline'
})
</script>

<template>
  <Collapsible
    v-model:open="open"
    class="rounded-md border bg-background/70"
  >
    <div class="flex items-center justify-between gap-2 px-3 py-2">
      <div class="flex min-w-0 items-center gap-2">
        <component
          :is="statusIcon"
          class="shrink-0"
          aria-hidden="true"
        />
        <div class="min-w-0">
          <p class="truncate text-sm font-medium">
            {{ label }}
          </p>
          <p
            v-if="toolCall.durationMs"
            class="text-xs text-muted-foreground"
          >
            {{ Math.round(Number(toolCall.durationMs)) }} ms
          </p>
        </div>
      </div>

      <div class="flex shrink-0 items-center gap-2">
        <Badge :variant="statusVariant">
          {{ statusLabel }}
        </Badge>
        <CollapsibleTrigger as-child>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            :disabled="!detailRows.length"
            aria-label="展开工具调用详情"
          >
            <ChevronDownIcon
              data-icon="inline-start"
              :class="cn('transition-transform', open && 'rotate-180')"
            />
          </Button>
        </CollapsibleTrigger>
      </div>
    </div>

    <CollapsibleContent v-if="detailRows.length">
      <div class="flex flex-col gap-3 border-t p-3">
        <div
          v-for="[title, value] in detailRows"
          :key="title"
          class="flex flex-col gap-1"
        >
          <span class="text-xs font-medium text-muted-foreground">{{ title }}</span>
          <pre class="max-h-64 overflow-auto rounded-md bg-muted p-2 text-xs leading-5">{{ formatJson(value) }}</pre>
        </div>
      </div>
    </CollapsibleContent>
  </Collapsible>
</template>

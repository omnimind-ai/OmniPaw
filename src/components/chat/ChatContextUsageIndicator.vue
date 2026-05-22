<script setup lang="ts">
import { computed } from 'vue'

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { SessionContextUsage } from '@/stores/chat'

const props = defineProps<{
  usage?: SessionContextUsage
  loading?: boolean
  class?: string
}>()

const hasUsage = computed(() => Boolean(props.usage))
const inputTokens = computed(() => props.usage?.inputTokens ?? props.usage?.totalTokens)
const displayLimitTokens = computed(() => props.usage?.windowTokens ?? props.usage?.budgetTokens)
const displayPercentage = computed(() => props.usage?.windowPercentage ?? props.usage?.percentage)
const boundedPercentage = computed(() => {
  const value = displayPercentage.value
  if (value === undefined || !Number.isFinite(value)) return undefined
  return Math.max(0, Math.min(100, Math.round(value)))
})
const percentLabel = computed(() =>
  boundedPercentage.value === undefined ? '' : `${boundedPercentage.value}%`
)
const remainingLabel = computed(() =>
  boundedPercentage.value === undefined ? '' : `${Math.max(0, 100 - boundedPercentage.value)}%`
)
const inputLabel = computed(() => formatTokenCount(inputTokens.value))
const limitLabel = computed(() => formatTokenCount(displayLimitTokens.value))
const usedLine = computed(() => {
  if (!percentLabel.value) return 'Usage not available'
  return `${percentLabel.value} used (${remainingLabel.value} left)`
})
const tokensLine = computed(() => {
  if (inputLabel.value && limitLabel.value)
    return `${inputLabel.value} / ${limitLabel.value} tokens used`
  if (inputLabel.value) return `${inputLabel.value} tokens used`
  return 'Token count not available'
})
const sourceLabel = computed(() => {
  switch (props.usage?.source) {
    case 'actual':
    case 'provider':
      return 'Actual'
    case 'mixed':
      return 'Mixed'
    case 'estimated':
      return 'Estimated'
    default:
      return props.usage?.source ? String(props.usage.source) : ''
  }
})
const ariaLabel = computed(() => {
  if (props.loading && !hasUsage.value) return '正在计算当前会话上下文用量'
  return `当前会话上下文用量：${usedLine.value}，${tokensLine.value}`
})
const progressStyle = computed(() => {
  const loadingWithoutUsage = props.loading && !hasUsage.value
  const percent = loadingWithoutUsage ? 28 : (boundedPercentage.value ?? 0)
  const color = loadingWithoutUsage
    ? 'var(--muted-foreground)'
    : percent >= 85
      ? 'var(--destructive)'
      : percent >= 70
        ? 'var(--chart-3)'
        : 'var(--primary)'
  return {
    background: `conic-gradient(${color} ${percent * 3.6}deg, var(--muted) 0deg)`,
  }
})

function formatTokenCount(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return ''
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k`
  return String(Math.round(value))
}
</script>

<template>
  <TooltipProvider :delay-duration="120">
    <Tooltip>
      <TooltipTrigger as-child>
        <button
          type="button"
          :class="cn(
            'relative inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
            props.loading && !hasUsage && 'opacity-70',
            props.class,
          )"
          :aria-label="ariaLabel"
        >
          <span
            :class="cn(
              'relative size-4 rounded-full',
              props.loading && !hasUsage && 'animate-spin',
            )"
            :style="progressStyle"
            aria-hidden="true"
          >
            <span class="absolute inset-1 rounded-full bg-background" />
          </span>
        </button>
      </TooltipTrigger>

      <TooltipContent
        side="top"
        align="center"
        :side-offset="8"
        class="flex flex-col items-center gap-1 px-5 py-3 text-center text-sm"
      >
        <span class="font-medium text-background/70">Context window:</span>
        <span class="text-base font-semibold">{{ usedLine }}</span>
        <span class="text-base font-semibold">{{ tokensLine }}</span>
        <span
          v-if="sourceLabel"
          class="text-xs text-background/70"
        >
          {{ sourceLabel }}
        </span>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
</template>

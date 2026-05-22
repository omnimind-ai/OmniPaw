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
  const trackColor = 'color-mix(in oklch, var(--foreground) 32%, transparent)'
  return {
    background: `conic-gradient(${progressColor(percent, loadingWithoutUsage)} ${percent * 3.6}deg, ${trackColor} 0deg)`,
  }
})

function progressColor(percent: number, loading: boolean): string {
  if (loading) return 'color-mix(in oklch, var(--foreground) 72%, transparent)'
  if (percent >= 85) return 'var(--destructive)'
  if (percent >= 70) return 'color-mix(in oklch, var(--foreground) 78%, var(--destructive))'
  return 'var(--foreground)'
}

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
        class="min-w-48 flex-col items-stretch gap-1.5 px-3 py-2.5 text-left"
      >
        <div class="flex items-center justify-between gap-3">
          <span class="text-[0.7rem] font-medium text-background/70">Context</span>
          <span
            v-if="sourceLabel"
            class="text-[0.7rem] text-background/60"
          >
            {{ sourceLabel }}
          </span>
        </div>
        <div class="flex flex-col gap-0.5">
          <span class="text-xs font-medium leading-none">{{ usedLine }}</span>
          <span class="text-[0.7rem] leading-none text-background/70">{{ tokensLine }}</span>
        </div>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
</template>

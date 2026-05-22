import type { ContextPolicy } from '@shared/types/chat'
import type { ProviderMessage, ProviderModel } from '@shared/types/provider'
import type { ChatContextDefaults, ContextBudget } from './types'

export function contextBudget(
  policy: ContextPolicy,
  model: ProviderModel,
  defaults: ChatContextDefaults | undefined
): ContextBudget {
  const contextWindow = finitePositive(model.contextWindow)
  const reservedOutputTokens = finitePositive(model.maxOutputTokens) ?? 1024
  const budgetPercent = clampPercent(defaults?.maxInputBudgetPercent ?? 75)
  const fallbackWindow = 8192
  const windowForBudget = contextWindow ?? fallbackWindow
  const modelDerivedBudget = Math.max(512, Math.floor((windowForBudget * budgetPercent) / 100))
  const maxInputTokens = Math.max(
    256,
    Math.min(
      policy.maxInputTokens ?? modelDerivedBudget,
      Math.max(256, windowForBudget - reservedOutputTokens)
    )
  )

  return {
    contextWindow,
    reservedOutputTokens,
    maxInputTokens,
    usageSource: 'estimated',
    compactThresholdPercent: clampPercent(defaults?.compactThresholdPercent ?? 70),
    autoCompact: defaults?.autoCompact ?? false,
  }
}

export function buildContextUsage(estimatedInputTokens: number, budget: ContextBudget) {
  return {
    source: budget.usageSource,
    estimatedInputTokens,
    contextWindowTokens: budget.contextWindow,
    budgetInputTokens: budget.maxInputTokens,
    reservedOutputTokens: budget.reservedOutputTokens,
    budgetPercent: budget.contextWindow
      ? Math.round((budget.maxInputTokens / budget.contextWindow) * 100)
      : undefined,
    windowUsagePercent: budget.contextWindow
      ? Math.min(999, Math.round((estimatedInputTokens / budget.contextWindow) * 100))
      : undefined,
    usagePercent: Math.min(999, Math.round((estimatedInputTokens / budget.maxInputTokens) * 100)),
    updatedAt: Date.now(),
  }
}

export function estimateTokens(messages: ProviderMessage[]): number {
  const chars = JSON.stringify(messages).length
  return Math.ceil(chars / 4)
}

function finitePositive(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : undefined
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 75
  }
  return Math.max(1, Math.min(95, Math.round(value)))
}

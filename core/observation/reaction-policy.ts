import type { ChatRunTerminalEvent } from '@core/chat/run-manager'
import type {
  ObservationCaptureMetadata,
  ObservationReactionCandidate,
  ObservationReactionDecision,
  ObservationRun,
} from '@shared/types/observation'
import type { DesktopObservationSettings } from '@shared/types/settings'
import {
  normalizeObservationDecision,
  sanitizeObservationReactionText,
  truncateObservationText,
} from './reaction-parser'

export interface ObservationReactionPromptContext {
  consecutiveNoVisibleReactions: number
  nudgeActive: boolean
  nudgeProbability: number
  nudgeThreshold: number
  forceReaction: boolean
}

interface CreateReactionPromptContextInput {
  settings: DesktopObservationSettings
  consecutiveNoVisibleReactions: number
  forceReaction?: boolean
  random: () => number
}

interface DecideReactionInput {
  run: ObservationRun
  candidate: ObservationReactionCandidate
  frame: ObservationCaptureMetadata
  terminal: ChatRunTerminalEvent
  cooldownMs: number
  forceReaction?: boolean
  now?: number
}

const forcedReactionFallbackText = '主动视觉回应测试完成，我会继续陪着你。'

export function createObservationReactionPromptContext(
  input: CreateReactionPromptContextInput
): ObservationReactionPromptContext {
  const threshold = Math.max(1, Math.floor(input.settings.reactionNudgeAfterSilentCaptures ?? 3))
  const baseProbability = clampProbability(input.settings.reactionNudgeProbability ?? 0.35)
  const silentCount = input.consecutiveNoVisibleReactions
  const nudgeStep = silentCount - threshold + 1
  const forced = input.forceReaction === true
  const nudgeProbability = forced ? 1 : nudgeStep > 0 ? Math.min(1, baseProbability * nudgeStep) : 0

  return {
    consecutiveNoVisibleReactions: silentCount,
    nudgeActive: forced || (nudgeProbability > 0 && input.random() < nudgeProbability),
    nudgeProbability,
    nudgeThreshold: threshold,
    forceReaction: forced,
  }
}

export function decideObservationReaction(input: DecideReactionInput): ObservationReactionDecision {
  const now = input.now ?? Date.now()
  let text = sanitizeObservationReactionText(input.candidate.text)
  let decision = normalizeObservationDecision(input.candidate.decision)
  let suppressionReason: ObservationReactionDecision['suppressionReason']
  if (input.forceReaction && (decision === 'silent' || !text)) {
    decision = 'notify'
    text ||= forcedReactionFallbackText
  }
  if (!text && decision !== 'silent') {
    decision = 'silent'
    suppressionReason = 'empty_text'
  }
  if (
    !input.forceReaction &&
    decision !== 'silent' &&
    input.run.notification.lastNotificationAt &&
    now - input.run.notification.lastNotificationAt < input.cooldownMs
  ) {
    suppressionReason = 'cooldown'
  }
  return {
    decision: suppressionReason ? 'silent' : decision,
    text: suppressionReason || decision === 'silent' ? undefined : text,
    reason: truncateObservationText(input.candidate.reason, 180),
    summary: truncateObservationText(input.candidate.summary, 2_000),
    captureId: input.frame.captureId,
    runId: input.terminal.runId,
    messageId: input.terminal.assistantMessageId,
    notificationSuppressed: Boolean(suppressionReason),
    suppressionReason,
    createdAt: now,
  }
}

export function nextNoVisibleReactionCount(
  current: number,
  decision: ObservationReactionDecision
): number {
  const visible =
    decision.decision !== 'silent' && !decision.notificationSuppressed && Boolean(decision.text)
  return visible ? 0 : current + 1
}

function clampProbability(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

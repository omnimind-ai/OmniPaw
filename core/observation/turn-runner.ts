import type { ChatService } from '@core/chat/chat-service'
import type { ChatRunEventTarget, ChatRunTerminalEvent } from '@core/chat/run-manager'
import { VISION_SESSION_TITLE } from '@core/chat/session-defaults'
import { OBSERVATION_PROMPTS } from '@core/prompts'
import type { ChatMessagePart, TransientChatInstruction } from '@shared/types/chat'
import type {
  ObservationCapturedFrame,
  ObservationCaptureMetadata,
  ObservationReactionCandidate,
  ObservationReactionDecision,
  ObservationRun,
  ObservationScreenshotRetention,
} from '@shared/types/observation'
import type { DesktopObservationSettings } from '@shared/types/settings'
import { createObservationError } from './errors'
import type { ResolvedObservationChain } from './model-chain'
import { parseObservationReactionCandidate } from './reaction-parser'
import { decideObservationReaction, type ObservationReactionPromptContext } from './reaction-policy'

export interface ObservationTurnResult {
  frame: {
    metadata: ObservationCaptureMetadata
    dataUrl: string
  }
  terminal: ChatRunTerminalEvent
  summary?: string
  candidate: ObservationReactionCandidate
  decision: ObservationReactionDecision
}

interface ObservationTurnRunnerOptions {
  chatService: () => ChatService | undefined
  eventTarget: () => ChatRunEventTarget | undefined
  settings: () => DesktopObservationSettings
}

interface ExecuteObservationTurnInput {
  run: ObservationRun
  resolved: ResolvedObservationChain
  frame: ObservationCapturedFrame
  signal: AbortSignal
  reactionContext: ObservationReactionPromptContext
}

const captureMarkerText =
  '[Vision capture: screenshot was used only for the current run and was not retained.]'

export class ObservationTurnRunner {
  constructor(private readonly options: ObservationTurnRunnerOptions) {}

  async execute(input: ExecuteObservationTurnInput): Promise<ObservationTurnResult> {
    return input.resolved.chain.mode === 'split'
      ? await this.performSplitObservation(input)
      : await this.performSingleObservation(input)
  }

  private async performSingleObservation(
    input: ExecuteObservationTurnInput
  ): Promise<ObservationTurnResult> {
    const { run, resolved, frame, signal, reactionContext } = input
    const transientCurrentMessageParts: ChatMessagePart[] = [
      {
        type: 'plain',
        text: OBSERVATION_PROMPTS.singleModelReactionUser({
          sessionKind: 'vision',
          sessionTitle: VISION_SESSION_TITLE,
          reactionContext,
        }),
      },
    ]
    const terminal = await this.sendVisionTurn({
      run,
      frame,
      providerId: resolved.vision.provider.id,
      modelId: resolved.vision.model.id,
      parts: captureParts(frame, run.screenshotRetention),
      transientSystemInstruction: OBSERVATION_PROMPTS.singleModelReactionSystem,
      transientCurrentMessageParts,
      signal,
      metadata: {
        source: 'observation',
        observationRunId: run.id,
        captureId: frame.captureId,
        phase: 'single_multimodal',
        screenshotRetention: run.screenshotRetention,
      },
    })
    const text = terminal.type === 'final' ? textFromParts(terminal.message.parts) : ''
    const candidate = parseObservationReactionCandidate(text)
    const decision = decideObservationReaction({
      run,
      candidate,
      frame,
      terminal,
      cooldownMs: this.options.settings().notificationCooldownMs,
      forceReaction: reactionContext.forceReaction,
    })
    return {
      frame: { metadata: captureMetadata(frame), dataUrl: frame.dataUrl },
      terminal,
      candidate,
      decision,
    }
  }

  private async performSplitObservation(
    input: ExecuteObservationTurnInput
  ): Promise<ObservationTurnResult> {
    const { run, resolved, frame, signal, reactionContext } = input
    const visionTerminal = await this.sendVisionTurn({
      run,
      frame,
      providerId: resolved.vision.provider.id,
      modelId: resolved.vision.model.id,
      parts: captureParts(frame, run.screenshotRetention),
      transientSystemInstruction: OBSERVATION_PROMPTS.visionSummarySystem,
      transientCurrentMessageParts: [
        { type: 'plain', text: OBSERVATION_PROMPTS.visionSummaryUser },
      ],
      signal,
      metadata: {
        source: 'observation',
        observationRunId: run.id,
        captureId: frame.captureId,
        phase: 'vision_summary',
        screenshotRetention: run.screenshotRetention,
      },
    })
    const summary =
      visionTerminal.type === 'final' ? textFromParts(visionTerminal.message.parts) : ''
    const reaction = resolved.reaction ?? resolved.vision
    const reactionTerminal = await this.sendVisionTurn({
      run,
      providerId: reaction.provider.id,
      modelId: reaction.model.id,
      parts: [{ type: 'plain', text: '[主动视觉 reaction 决策]' }],
      transientSystemInstruction: OBSERVATION_PROMPTS.splitReactionSystem,
      transientCurrentMessageParts: [
        {
          type: 'plain',
          text: OBSERVATION_PROMPTS.splitReactionUser({
            sessionKind: 'vision',
            sessionTitle: VISION_SESSION_TITLE,
            summary,
            reactionContext,
          }),
        },
      ],
      signal,
      metadata: {
        source: 'observation',
        observationRunId: run.id,
        captureId: frame.captureId,
        phase: 'reaction_decision',
        summaryMessageId: visionTerminal.type === 'final' ? visionTerminal.message.id : undefined,
      },
    })
    const text =
      reactionTerminal.type === 'final' ? textFromParts(reactionTerminal.message.parts) : ''
    const candidate = { ...parseObservationReactionCandidate(text), summary }
    const decision = decideObservationReaction({
      run,
      candidate,
      frame,
      terminal: reactionTerminal,
      cooldownMs: this.options.settings().notificationCooldownMs,
      forceReaction: reactionContext.forceReaction,
    })
    return {
      frame: { metadata: captureMetadata(frame), dataUrl: frame.dataUrl },
      terminal: reactionTerminal,
      summary,
      candidate,
      decision,
    }
  }

  private async sendVisionTurn(input: {
    run: ObservationRun
    frame?: ObservationCapturedFrame
    providerId: string
    modelId: string
    parts: ChatMessagePart[]
    transientSystemInstruction: string
    transientCurrentMessageParts: ChatMessagePart[]
    signal: AbortSignal
    metadata: Record<string, unknown>
  }): Promise<ChatRunTerminalEvent> {
    const chat = this.requireChatService()
    const target = this.options.eventTarget()
    if (!target) {
      throw createObservationError('provider_failed', '主动视觉事件广播入口不可用。', true)
    }
    const response = await chat.sendInternalMessage(
      {
        sessionId: input.run.visionSessionId,
        parts: input.parts,
        providerId: input.providerId,
        modelId: input.modelId,
        mode: 'fast_chat',
        toolProfile: 'minimal',
        maxSteps: 1,
        metadata: input.metadata,
        transientSystemInstructions: transientSystemInstructions(
          chat,
          input.transientSystemInstruction
        ),
        transientCurrentMessageParts: input.transientCurrentMessageParts,
        transientImageInputs:
          input.frame && input.run.screenshotRetention === 'ephemeral'
            ? [
                {
                  captureId: input.frame.captureId,
                  dataUrl: input.frame.dataUrl,
                  mimeType: input.frame.mimeType,
                  width: input.frame.width,
                  height: input.frame.height,
                  createdAt: input.frame.createdAt,
                },
              ]
            : undefined,
      },
      target,
      input.signal
    )
    const terminal = await response.terminalEvent
    if (terminal.type === 'error') {
      throw createObservationError(
        terminal.error.code === 'aborted' ? 'aborted' : 'provider_failed',
        terminal.error.message,
        terminal.error.retryable
      )
    }
    return terminal
  }

  private requireChatService(): ChatService {
    const chat = this.options.chatService()
    if (!chat) {
      throw createObservationError('provider_failed', '主动视觉聊天执行入口尚未初始化。', true)
    }
    return chat
  }
}

function captureParts(
  frame: ObservationCapturedFrame,
  retention: ObservationScreenshotRetention
): ChatMessagePart[] {
  const parts: ChatMessagePart[] = [
    {
      type: 'vision_capture',
      captureId: frame.captureId,
      scope: frame.scope,
      sourceId: frame.sourceId,
      sourceType: frame.sourceType,
      mimeType: frame.mimeType,
      width: frame.width,
      height: frame.height,
      retention,
      createdAt: frame.createdAt,
      marker: retention === 'ephemeral' ? captureMarkerText : undefined,
    },
  ]
  if (retention === 'persist' && frame.attachmentId) {
    parts.push({
      type: 'image',
      attachmentId: frame.attachmentId,
      attachment_id: frame.attachmentId,
      filename: `vision-capture-${frame.captureId}.png`,
    })
  }
  return parts
}

function transientSystemInstructions(
  chat: ChatService,
  observationInstruction: string
): TransientChatInstruction[] {
  const instructions: TransientChatInstruction[] = []
  const role =
    typeof chat.buildDefaultSystemContext === 'function'
      ? chat.buildDefaultSystemContext()?.role
      : undefined
  if (role?.text?.trim()) {
    instructions.push({
      id: 'observation:role',
      kind: 'role',
      source: role.refId ?? 'role.active',
      refId: role.refId,
      text: role.text,
    })
  }
  instructions.push({
    id: 'observation:runtime',
    kind: 'runtime',
    source: 'observation.runtime',
    text: observationInstruction,
  })
  return instructions
}

function captureMetadata(frame: ObservationCaptureMetadata): ObservationCaptureMetadata {
  return {
    captureId: frame.captureId,
    scope: frame.scope,
    sourceId: frame.sourceId,
    sourceType: frame.sourceType,
    mimeType: frame.mimeType,
    width: frame.width,
    height: frame.height,
    createdAt: frame.createdAt,
    retention: frame.retention,
  }
}

function textFromParts(parts: ChatMessagePart[]): string {
  return parts
    .map((part) => {
      const record = part as Record<string, unknown>
      return part.type === 'plain' && typeof record.text === 'string' ? record.text : ''
    })
    .filter(Boolean)
    .join('\n')
    .trim()
}

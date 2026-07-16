import type { ProviderMessage, ProviderTool } from '@core/provider/base-provider'
import type {
  ChatMessage,
  ChatMessagePart,
  ChatRunMode,
  ProviderRequestSnapshot,
  ToolProfile,
} from '@shared/types/chat'
import type { SkillPromptContext } from '@shared/types/skill'
import type { AgentRunInput } from '../agent-runner'
import type { ToolPolicy } from '../tools/policy'
import type { AgentTool } from '../tools/types'
import {
  appendTextPart,
  collectPlainContent,
  collectReasoningContent,
  collectReasoningSignature,
} from './helpers'

export interface AgentRunStateInit {
  startedAt: number
  input: AgentRunInput
  mode: ChatRunMode
  requestedMode: ChatRunMode
  supportsTools: boolean
  fallbackReason?: string
  maxSteps: number
  toolProfile: ToolProfile
  policy: ToolPolicy
  sourceMessages: ChatMessage[]
  providerMessages: ProviderMessage[]
  baseProviderMessages: ProviderMessage[]
  agentTools: AgentTool[]
  providerTools: ProviderTool[]
  snapshot: ProviderRequestSnapshot
  skillPrompt?: SkillPromptContext
}

export class AgentRunState {
  readonly startedAt: number
  readonly input: AgentRunInput
  readonly mode: ChatRunMode
  readonly requestedMode: ChatRunMode
  readonly supportsTools: boolean
  readonly fallbackReason?: string
  readonly maxSteps: number
  readonly toolProfile: ToolProfile
  readonly policy: ToolPolicy
  readonly sourceMessages: ChatMessage[]
  readonly agentTools: AgentTool[]
  readonly providerTools: ProviderTool[]
  readonly skillPrompt?: SkillPromptContext

  readonly assistantParts: ChatMessagePart[] = []
  providerMessages: ProviderMessage[]
  activeProviderTools: ProviderTool[]
  snapshot: ProviderRequestSnapshot

  private readonly baseProviderMessages: ProviderMessage[]

  constructor(init: AgentRunStateInit) {
    this.startedAt = init.startedAt
    this.input = init.input
    this.mode = init.mode
    this.requestedMode = init.requestedMode
    this.supportsTools = init.supportsTools
    this.fallbackReason = init.fallbackReason
    this.maxSteps = init.maxSteps
    this.toolProfile = init.toolProfile
    this.policy = init.policy
    this.sourceMessages = init.sourceMessages
    this.providerMessages = init.providerMessages
    this.baseProviderMessages = init.baseProviderMessages
    this.agentTools = init.agentTools
    this.providerTools = init.providerTools
    this.activeProviderTools = init.providerTools
    this.snapshot = init.snapshot
    this.skillPrompt = init.skillPrompt
  }

  appendContentDelta(text: string, stepParts?: ChatMessagePart[]): void {
    appendTextPart(this.assistantParts, text)
    if (stepParts) {
      appendTextPart(stepParts, text)
    }
  }

  appendReasoningDelta(text: string, stepParts?: ChatMessagePart[]): void {
    const part: ChatMessagePart = { type: 'think', think: text }
    this.assistantParts.push(part)
    stepParts?.push({ ...part })
  }

  appendReasoningSignature(signature: string, stepParts?: ChatMessagePart[]): void {
    setLastReasoningSignature(this.assistantParts, signature)
    if (stepParts) {
      setLastReasoningSignature(stepParts, signature)
    }
  }

  appendAssistantToolCallMessage(
    stepParts: ChatMessagePart[],
    toolCalls: ProviderMessage['toolCalls']
  ): void {
    this.providerMessages.push({
      role: 'assistant',
      content: collectPlainContent(stepParts) ?? '',
      reasoningContent: collectReasoningContent(stepParts),
      reasoningSignature: collectReasoningSignature(stepParts),
      toolCalls,
    })
  }

  appendToolResultMessage(toolCallId: string, content: string): void {
    this.providerMessages.push({
      role: 'tool',
      toolCallId,
      content,
    })
  }

  disableToolsForFallback(reason: string): void {
    this.activeProviderTools = []
    this.providerMessages = [...this.baseProviderMessages]
    this.snapshot = {
      ...this.snapshot,
      mode: 'fast_chat',
      availableTools: [],
      toolSources: [],
      fallbackReason: reason,
      messageCount: this.providerMessages.length,
    }
  }

  trimForContextLengthRetry(reason: string): boolean {
    if (this.snapshot.fallbackReasons?.includes(reason)) {
      return false
    }
    if (this.providerMessages.length <= 2) {
      return false
    }

    const first = this.providerMessages[0]
    const last = this.providerMessages.at(-1)
    const middle = this.providerMessages.slice(1, -1)
    const keepMiddle = middle.slice(Math.floor(middle.length / 2))
    this.providerMessages = [first, ...keepMiddle, last].filter(
      (message): message is NonNullable<typeof message> => Boolean(message)
    )
    this.snapshot = {
      ...this.snapshot,
      fallbackReason: reason,
      fallbackReasons: [...(this.snapshot.fallbackReasons ?? []), reason],
      messageCount: this.providerMessages.length,
      droppedCounts: {
        ...(this.snapshot.droppedCounts ?? {}),
        message:
          (this.snapshot.droppedCounts?.message ?? 0) +
          Math.max(0, middle.length - keepMiddle.length),
      },
    }
    return true
  }

  recordTransportRetry(at = Date.now()): void {
    this.snapshot = {
      ...this.snapshot,
      transport: {
        ...this.snapshot.transport,
        retryCount: (this.snapshot.transport?.retryCount ?? 0) + 1,
        lastRetryAt: at,
        streamCompleted: false,
      },
    }
  }

  markStreamCompleted(): void {
    this.snapshot = {
      ...this.snapshot,
      transport: {
        ...this.snapshot.transport,
        streamCompleted: true,
      },
    }
  }
}

function setLastReasoningSignature(parts: ChatMessagePart[], signature: string): void {
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index]
    if (part?.type === 'think') {
      part.signature = signature
      return
    }
  }
}

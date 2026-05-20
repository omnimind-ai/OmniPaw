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
import { appendTextPart, collectPlainContent, collectReasoningContent } from './helpers'

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

  appendAssistantToolCallMessage(
    stepParts: ChatMessagePart[],
    toolCalls: ProviderMessage['toolCalls']
  ): void {
    this.providerMessages.push({
      role: 'assistant',
      content: collectPlainContent(stepParts) ?? '',
      reasoningContent: collectReasoningContent(stepParts),
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
}

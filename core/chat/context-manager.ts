import type { ChatMessage, ChatMessagePart, ContextPolicy } from '@shared/types/chat'
import type { ProviderContentPart, ProviderMessage, ProviderModel } from '@shared/types/provider'
import type { AttachmentService } from './attachment-service'
import { countAttachmentParts, partsToProviderContent } from './context/attachments'
import { buildContextUsage, contextBudget, estimateTokens } from './context/budget'
import { eligibleMessages, filterMessagesAfterSummary, normalizePolicy } from './context/policy'
import { hasProviderContent, partsReasoningText, serializeUnits } from './context/serialize'
import { compileToolCallMessages } from './context/tool-calls'
import type {
  BuildContextInput,
  BuildContextResult,
  ContextBudget,
  ContextBuilderOptions,
  ContextUnit,
} from './context/types'
import {
  buildSystemUnits,
  contextUnitStats,
  countUnits,
  messagePriority,
  selectContextUnits,
  summaryUnit,
  trimMessageUnit,
  unitKindForMessage,
} from './context/units'
import { workspaceDocumentAttachmentsFromMetadata } from './workspace-document-attachments'

export type {
  BuildContextInput,
  BuildContextResult,
  ChatContextDefaults,
  ContextBuilderOptions,
  ContextSummaryStore,
} from './context/types'

export class ContextBuilder {
  constructor(
    private readonly attachments: AttachmentService,
    private readonly options: ContextBuilderOptions = {}
  ) {}

  async build(input: BuildContextInput): Promise<BuildContextResult> {
    const defaults = this.options.contextDefaults?.()
    const policy = normalizePolicy(input.session.contextPolicy, defaults)
    const budget = contextBudget(policy, input.model, defaults)
    const supportsSystemRole = input.model.compat?.supportsSystemRole !== false
    const eligible = eligibleMessages(input.messages)
    const latestSummary =
      policy.mode === 'summary-plus-recent'
        ? this.options.summaries?.latestUsable(input.session.id)
        : undefined
    const messagesAfterSummary = filterMessagesAfterSummary(eligible, latestSummary)
    const systemUnits = buildSystemUnits(input.session, input.skillPrompt)
    const summaryUnits = latestSummary ? [summaryUnit(latestSummary)] : []
    const messageUnits = await this.buildMessageUnits(messagesAfterSummary, input, policy, budget)
    const selection = selectContextUnits(
      [...systemUnits, ...summaryUnits, ...messageUnits],
      policy,
      budget
    )
    const providerMessages = serializeUnits(selection.selected, supportsSystemRole)
    const attachmentCount = selection.selected.reduce(
      (count, unit) => count + (unit.attachmentCount ?? 0),
      0
    )
    const imageInputCount = countProviderImageInputs(providerMessages)
    const estimatedInputTokens = estimateTokens(providerMessages)

    return {
      messages: providerMessages,
      snapshot: {
        api: input.provider.api ?? 'openai-chat-completions',
        baseUrlHost: hostFromUrl(input.provider.baseUrl),
        model: input.model.remoteId ?? input.model.id,
        contextPolicyMode: policy.mode,
        tokenBudget: {
          maxInputTokens: budget.maxInputTokens,
          usableInputTokens: budget.maxInputTokens,
          reservedOutputTokens: budget.reservedOutputTokens,
        },
        contextUsage: buildContextUsage(estimatedInputTokens, budget),
        contextUnits: contextUnitStats(selection.selected, selection.dropped),
        selectedCounts: countUnits(selection.selected),
        droppedCounts: countUnits(selection.dropped),
        summaryId: latestSummary?.id,
        messageCount: providerMessages.length,
        attachmentCount,
        imageInputCount,
        estimatedInputTokens,
        skills: input.skillPrompt
          ? {
              enabledSkillIds: input.skillPrompt.enabledSkillIds,
              injected: input.skillPrompt.injected,
              omittedReason: input.skillPrompt.omittedReason,
            }
          : undefined,
      },
    }
  }

  private async buildMessageUnits(
    messages: ChatMessage[],
    input: BuildContextInput,
    policy: ContextPolicy,
    budget: ContextBudget
  ): Promise<ContextUnit[]> {
    const keepRecentMessages = Math.max(2, (policy.keepRecentTurns ?? 4) * 2)
    const recentIds = new Set(messages.slice(-keepRecentMessages).map((message) => message.id))
    const units: ContextUnit[] = []

    for (const message of messages) {
      const isCurrent = message.id === input.currentUserMessageId
      const isRecent = recentIds.has(message.id)
      const degraded = policy.mode !== 'recent-turns' && !isCurrent && !isRecent
      const unitMessages = await this.messageToProviderMessages(message, input, policy, {
        degraded,
        includeReasoning: !degraded,
        maxToolResultChars: degraded ? 1200 : undefined,
      })

      if (!unitMessages.length) {
        continue
      }

      const attachmentCount = countAttachmentParts(message.parts)
      units.push({
        id: `message:${message.id}`,
        kind: unitKindForMessage(message),
        source: `message:${message.role}`,
        priority: messagePriority(message, isCurrent, isRecent),
        required: isCurrent,
        messageId: message.id,
        messageCreatedAt: message.createdAt,
        attachmentCount,
        estimatedTokens: estimateTokens(unitMessages),
        messages: unitMessages,
      })
    }

    if (units.reduce((sum, unit) => sum + unit.estimatedTokens, 0) <= budget.maxInputTokens) {
      return units
    }

    return units.map((unit) => {
      if (unit.required || unit.priority >= 70) {
        return unit
      }
      const messages = trimMessageUnit(unit.messages)
      return {
        ...unit,
        messages,
        estimatedTokens: estimateTokens(messages),
      }
    })
  }

  private async messageToProviderMessages(
    message: ChatMessage,
    input: BuildContextInput,
    policy: ContextPolicy,
    options: {
      degraded: boolean
      includeReasoning: boolean
      maxToolResultChars?: number
    }
  ): Promise<ProviderMessage[]> {
    const isCurrent = message.id === input.currentUserMessageId
    const includeAttachmentPayloads =
      isCurrent || (!options.degraded && policy.includeAttachments === 'recent')
    const neverIncludeAttachments = policy.includeAttachments === 'never'

    if (message.role === 'assistant') {
      const textContent = await this.partsToProviderContent(
        message,
        message.parts.filter((part) => part.type !== 'tool_call'),
        input.model,
        includeAttachmentPayloads,
        neverIncludeAttachments
      )
      const reasoningContent = options.includeReasoning ? partsReasoningText(message.parts) : ''
      const compiledToolMessages = compileToolCallMessages(
        message.parts,
        {
          content: textContent,
          reasoningContent,
        },
        { maxToolResultChars: options.maxToolResultChars }
      )
      if (compiledToolMessages.length) {
        return compiledToolMessages
      }
    }

    const content = await this.partsToProviderContent(
      message,
      message.parts,
      input.model,
      includeAttachmentPayloads,
      neverIncludeAttachments || options.degraded
    )
    const providerContent = this.withTransientImages(
      content,
      input,
      isCurrent && includeAttachmentPayloads && !neverIncludeAttachments && !options.degraded
    )
    if (!hasProviderContent(providerContent)) {
      return []
    }

    return [
      {
        role:
          message.role === 'assistant'
            ? 'assistant'
            : message.role === 'system'
              ? 'system'
              : 'user',
        content: providerContent,
        reasoningContent:
          message.role === 'assistant' && options.includeReasoning
            ? partsReasoningText(message.parts)
            : undefined,
      },
    ]
  }

  private partsToProviderContent(
    message: ChatMessage,
    parts: ChatMessagePart[],
    model: ProviderModel,
    includeAttachmentPayloads: boolean,
    neverIncludeAttachments: boolean
  ): Promise<ProviderMessage['content']> {
    return partsToProviderContent(
      this.attachments,
      parts,
      model,
      includeAttachmentPayloads,
      neverIncludeAttachments,
      {
        workspaceDocumentAttachments: workspaceDocumentAttachmentsFromMetadata(message.metadata),
      }
    )
  }

  private withTransientImages(
    content: ProviderMessage['content'],
    input: BuildContextInput,
    enabled: boolean
  ): ProviderMessage['content'] {
    const images =
      enabled && (input.model.input ?? ['text']).includes('image')
        ? (input.transientImageInputs ?? [])
        : []
    if (!images.length) {
      return content
    }

    const parts: ProviderContentPart[] =
      typeof content === 'string' ? [{ type: 'text', text: content }] : [...content]
    for (const image of images) {
      parts.push({ type: 'image_url', image_url: { url: image.dataUrl } })
    }
    return parts
  }
}

export class ContextManager extends ContextBuilder {
  trimToRecentTurns(messages: ChatMessage[], maxMessages = 20): ChatMessage[] {
    return messages.slice(-maxMessages)
  }
}

function hostFromUrl(value: string): string | undefined {
  try {
    return new URL(value).host
  } catch {
    return undefined
  }
}

function countProviderImageInputs(messages: ProviderMessage[]): number {
  return messages.reduce((count, message) => {
    if (!Array.isArray(message.content)) {
      return count
    }

    return count + message.content.filter((part) => part.type === 'image_url').length
  }, 0)
}

import type { ContextBuilder } from '@core/chat/context-manager'
import type { RunManager } from '@core/chat/run-manager'
import type { ChatMessageRepo, ChatRunRepo } from '@core/db/repos'
import type { Logger } from '@core/logging'
import type { ChatError, ProviderMessage, ProviderToolCall } from '@core/provider/base-provider'
import { normalizeProviderError } from '@core/provider/errors'
import type { ProviderManager } from '@core/provider/manager'
import type { SkillManager } from '@core/skill/skill-manager'
import type {
  ChatMessagePart,
  ChatRun,
  ChatRunMode,
  ChatSession,
  ProviderRequestSnapshot,
  ToolProfile,
} from '@shared/types/chat'
import type { ProviderConfig, ProviderModel } from '@shared/types/provider'
import {
  createAgentStepEvent,
  createToolCallEvent,
  createToolResultEvent,
  toolCallPart,
  upsertToolCallPart,
} from './agent-events'
import type { AgentTool } from './tool'
import { ToolExecutor } from './tool-executor'
import { defaultToolPolicy } from './tool-policy'
import { providerToolsFromAgentTools, type ToolRegistry } from './tool-registry'

export interface AgentRunnerOptions {
  messages: ChatMessageRepo
  runs: ChatRunRepo
  providers: ProviderManager
  contextBuilder: ContextBuilder
  runManager: RunManager
  toolRegistry: ToolRegistry
  skills?: SkillManager
  compactSkillDescriptions?: () => boolean
  toolExecutor?: ToolExecutor
  onComplete?: (sessionId: string) => void
  logger?: Logger
}

export interface AgentRunInput {
  run: ChatRun
  session: ChatSession
  provider: ProviderConfig
  model: ProviderModel
  signal: AbortSignal
  mode?: ChatRunMode
  toolProfile?: ToolProfile
  maxSteps?: number
}

export class AgentRunner {
  private readonly toolExecutor: ToolExecutor

  constructor(private readonly options: AgentRunnerOptions) {
    this.toolExecutor =
      options.toolExecutor ?? new ToolExecutor({ logger: options.logger?.child({ scope: 'tool' }) })
  }

  async run(input: AgentRunInput): Promise<void> {
    const startedAt = Date.now()
    const logger = this.options.logger?.child({
      scope: 'run',
      runId: input.run.id,
      sessionId: input.session.id,
      providerId: input.provider.id,
      modelId: input.model.id,
    })
    const assistantParts: ChatMessagePart[] = []
    const maxSteps = clampMaxSteps(input.maxSteps)
    const requestedMode = input.mode ?? 'assistant'
    const supportsTools = providerSupportsTools(input.provider, input.model)
    const mode: ChatRunMode =
      requestedMode === 'fast_chat' || !supportsTools ? 'fast_chat' : 'assistant'
    const fallbackReason =
      requestedMode === 'assistant' && !supportsTools
        ? 'provider_or_model_does_not_support_tools'
        : undefined
    logger?.info('Agent run started.', {
      mode,
      requestedMode,
      fallbackReason,
      maxSteps,
      supportsTools,
    })

    try {
      const allMessages = this.options.messages.listBySession(input.session.id)
      const skillPrompt = this.options.skills?.buildPromptInventory({
        compact: this.options.compactSkillDescriptions?.() ?? true,
        supportsSystemRole: input.model.compat?.supportsSystemRole !== false,
      })
      const toolProfile = input.toolProfile ?? 'assistant'
      const policy = defaultToolPolicy(toolProfile)
      const agentTools =
        mode === 'assistant'
          ? await this.options.toolRegistry.resolve({ sessionId: input.session.id, policy })
          : []
      const context = await this.options.contextBuilder.build({
        session: input.session,
        messages: allMessages,
        currentUserMessageId: input.run.userMessageId,
        provider: input.provider,
        model: input.model,
        skillPrompt,
      })
      const client = await this.options.providers.createProviderClient(input.provider.id)
      let messages = injectToolInventory(
        context.messages,
        agentTools,
        input.model.compat?.supportsSystemRole !== false
      )
      const providerTools = providerToolsFromAgentTools(agentTools)
      let activeProviderTools = providerTools
      logger?.debug('Agent context prepared.', {
        mode,
        toolCount: agentTools.length,
        skillInjected: skillPrompt?.injected,
        enabledSkillCount: skillPrompt?.enabledSkillIds.length ?? 0,
      })
      const snapshot: ProviderRequestSnapshot = {
        ...context.snapshot,
        messageCount: messages.length,
        mode,
        toolProfile,
        availableTools: agentTools.map((tool) => tool.providerName ?? tool.name),
        toolSources: agentTools.map((tool) => ({
          name: tool.providerName ?? tool.name,
          source: tool.source,
          serverId: tool.serverId,
        })),
        skills: skillPrompt
          ? {
              enabledSkillIds: skillPrompt.enabledSkillIds,
              injected: skillPrompt.injected,
              omittedReason: skillPrompt.omittedReason,
            }
          : undefined,
        maxSteps,
        fallbackReason,
      }
      this.options.runs.save({ ...input.run, requestSnapshot: snapshot, updatedAt: Date.now() })

      for (let step = 1; step <= maxSteps; step += 1) {
        throwIfAborted(input.signal)
        const stepParts: ChatMessagePart[] = []
        this.options.runManager.emit(
          createAgentStepEvent({
            runId: input.run.id,
            sessionId: input.run.sessionId,
            assistantMessageId: input.run.assistantMessageId,
            seq: this.options.runManager.nextSeq(input.run.id),
            step,
            maxSteps,
            status: 'started',
          })
        )

        const stepToolCalls: ProviderToolCall[] = []
        let sawFinal = false
        let retryWithoutTools = false
        do {
          retryWithoutTools = false
          try {
            for await (const chunk of client.streamChat({
              modelId: input.model.remoteId || input.model.id,
              messages,
              maxOutputTokens: input.model.maxOutputTokens,
              tools: activeProviderTools.length ? activeProviderTools : undefined,
              abortSignal: input.signal,
            })) {
              throwIfAborted(input.signal)

              if (chunk.type === 'delta' && (chunk.content || chunk.reasoning)) {
                const text = chunk.content ?? chunk.reasoning ?? ''
                if (chunk.content) {
                  appendText(assistantParts, text)
                  appendText(stepParts, text)
                }
                if (chunk.reasoning) {
                  assistantParts.push({ type: 'think', think: text })
                  stepParts.push({ type: 'think', think: text })
                }
                this.options.messages.updateParts(input.run.assistantMessageId, assistantParts, {
                  status: 'streaming',
                })
                this.options.runManager.emit({
                  type: 'delta',
                  runId: input.run.id,
                  sessionId: input.run.sessionId,
                  assistantMessageId: input.run.assistantMessageId,
                  seq: this.options.runManager.nextSeq(input.run.id),
                  text,
                  channel: chunk.reasoning ? 'reasoning' : 'content',
                })
                continue
              }

              if (chunk.type === 'tool_call_delta') {
                continue
              }

              if (chunk.type === 'tool_call_final') {
                stepToolCalls.push(...chunk.toolCalls)
                continue
              }

              if (chunk.type === 'final') {
                sawFinal = true
                if (!stepToolCalls.length) {
                  this.completeRun(input.run, assistantParts, chunk.usage)
                  logger?.info('Agent run completed.', {
                    status: 'complete',
                    step,
                    durationMs: Date.now() - startedAt,
                  })
                  return
                }
              }
            }
          } catch (error) {
            const chatError = normalizeProviderError(error)
            if (
              activeProviderTools.length &&
              canRetryWithoutTools(chatError, stepParts, stepToolCalls, sawFinal)
            ) {
              activeProviderTools = []
              messages = [...context.messages]
              retryWithoutTools = true
              const currentRun = this.options.runs.get(input.run.id) ?? input.run
              const currentSnapshot = currentRun.requestSnapshot ?? snapshot
              this.options.runs.save({
                ...currentRun,
                requestSnapshot: {
                  ...currentSnapshot,
                  mode: 'fast_chat',
                  availableTools: [],
                  toolSources: [],
                  fallbackReason: 'provider_rejected_tools',
                  messageCount: messages.length,
                },
                updatedAt: Date.now(),
              })
              logger?.info('Provider rejected tool calling; retrying without tools.', {
                providerId: input.provider.id,
                modelId: input.model.id,
                errorCode: chatError.code,
                providerStatus: chatError.providerStatus,
                fallbackReason: 'provider_rejected_tools',
              })
              continue
            }
            throw error
          }
        } while (retryWithoutTools)

        if (!stepToolCalls.length) {
          if (!sawFinal) {
            this.completeRun(input.run, assistantParts)
            logger?.info('Agent run completed without final chunk.', {
              status: 'complete',
              step,
              durationMs: Date.now() - startedAt,
            })
          }
          return
        }

        this.options.runManager.emit(
          createAgentStepEvent({
            runId: input.run.id,
            sessionId: input.run.sessionId,
            assistantMessageId: input.run.assistantMessageId,
            seq: this.options.runManager.nextSeq(input.run.id),
            step,
            maxSteps,
            status: 'tool_calling',
          })
        )

        messages.push({
          role: 'assistant',
          content: collectPlainContent(stepParts) ?? '',
          reasoningContent: collectReasoningContent(stepParts),
          toolCalls: stepToolCalls,
        })

        for (const toolCall of stepToolCalls) {
          const runningCall = {
            id: toolCall.id,
            name: toolCall.function.name,
            arguments: parseArgumentsForDisplay(toolCall.function.arguments),
            args: parseArgumentsForDisplay(toolCall.function.arguments),
            status: 'running' as const,
            startedAt: Date.now(),
            ts: Date.now() / 1000,
          }
          this.upsertAndEmitTool(input.run, assistantParts, runningCall, step, 'call')

          const execution = await this.toolExecutor.execute({
            toolCall,
            tools: agentTools,
            policy,
            signal: input.signal,
          })
          if (toolCall.function.name === 'skill_read') {
            const readSkillIds = this.options.skills?.drainReadSkillIds() ?? []
            if (readSkillIds.length) {
              const currentRun = this.options.runs.get(input.run.id) ?? input.run
              const currentSnapshot = currentRun.requestSnapshot ?? snapshot
              this.options.runs.save({
                ...currentRun,
                requestSnapshot: {
                  ...currentSnapshot,
                  skills: {
                    enabledSkillIds:
                      currentSnapshot.skills?.enabledSkillIds ?? skillPrompt?.enabledSkillIds ?? [],
                    injected: currentSnapshot.skills?.injected ?? skillPrompt?.injected ?? false,
                    omittedReason:
                      currentSnapshot.skills?.omittedReason ?? skillPrompt?.omittedReason,
                    readSkillIds: [
                      ...new Set([
                        ...(currentSnapshot.skills?.readSkillIds ?? []),
                        ...readSkillIds,
                      ]),
                    ].sort(),
                  },
                },
                updatedAt: Date.now(),
              })
            }
          }

          this.upsertAndEmitTool(input.run, assistantParts, execution.display, step, 'result')

          if (execution.result.status === 'aborted') {
            throw new DOMException('Run aborted.', 'AbortError')
          }

          messages.push({
            role: 'tool',
            toolCallId: toolCall.id,
            content: execution.result.resultText,
          })
        }

        this.options.runManager.emit(
          createAgentStepEvent({
            runId: input.run.id,
            sessionId: input.run.sessionId,
            assistantMessageId: input.run.assistantMessageId,
            seq: this.options.runManager.nextSeq(input.run.id),
            step,
            maxSteps,
            status: 'tool_complete',
          })
        )
      }

      const message = `Reached maximum agent steps (${maxSteps}) before a final answer.`
      appendText(assistantParts, message)
      this.options.messages.updateParts(input.run.assistantMessageId, assistantParts, {
        status: 'complete',
      })
      this.options.runs.updateStatus(input.run.id, 'complete', { finishedAt: Date.now() })
      this.emitFinal(input.run)
      this.options.onComplete?.(input.run.sessionId)
      logger?.warn('Agent run reached max steps.', {
        status: 'complete',
        maxSteps,
        durationMs: Date.now() - startedAt,
      })
    } catch (error) {
      const chatError = normalizeProviderError(error)
      const status = chatError.code === 'aborted' ? 'aborted' : 'error'
      if (status === 'aborted') {
        logger?.info('Agent run aborted.', {
          errorCode: chatError.code,
          retryable: chatError.retryable,
          durationMs: Date.now() - startedAt,
          error: {
            code: chatError.code,
            message: chatError.message,
            retryable: chatError.retryable,
            providerStatus: chatError.providerStatus,
          },
        })
      } else {
        logger?.warn('Agent run failed.', {
          errorCode: chatError.code,
          retryable: chatError.retryable,
          durationMs: Date.now() - startedAt,
          error: {
            code: chatError.code,
            message: chatError.message,
            retryable: chatError.retryable,
            providerStatus: chatError.providerStatus,
          },
        })
      }
      this.options.messages.updateParts(input.run.assistantMessageId, assistantParts, {
        status,
        error: chatError,
      })
      this.options.runs.updateStatus(input.run.id, status, {
        finishedAt: Date.now(),
        error: chatError,
      })
      this.options.runManager.emit({
        type: 'error',
        runId: input.run.id,
        sessionId: input.run.sessionId,
        assistantMessageId: input.run.assistantMessageId,
        seq: this.options.runManager.nextSeq(input.run.id),
        error: chatError,
      })
    } finally {
      this.options.runManager.finish(input.run.id)
    }
  }

  private completeRun(run: ChatRun, parts: ChatMessagePart[], usage?: ChatRun['usage']): void {
    this.options.messages.updateParts(run.assistantMessageId, parts, {
      status: 'complete',
      usage,
    })
    this.options.runs.updateStatus(run.id, 'complete', {
      finishedAt: Date.now(),
      usage,
    })
    this.emitFinal(run)
    this.options.onComplete?.(run.sessionId)
  }

  private emitFinal(run: ChatRun): void {
    const finalMessage = this.options.messages.get(run.assistantMessageId)
    if (!finalMessage) {
      return
    }
    this.options.runManager.emit({
      type: 'final',
      runId: run.id,
      sessionId: run.sessionId,
      assistantMessageId: run.assistantMessageId,
      seq: this.options.runManager.nextSeq(run.id),
      message: finalMessage,
    })
  }

  private upsertAndEmitTool(
    run: ChatRun,
    parts: ChatMessagePart[],
    toolCall: NonNullable<Parameters<typeof upsertToolCallPart>[1]>,
    step: number,
    kind: 'call' | 'result'
  ): void {
    const updated = upsertToolCallPart(parts, toolCall)
    parts.splice(0, parts.length, ...updated)
    this.options.messages.updateParts(run.assistantMessageId, parts, { status: 'streaming' })
    this.options.runManager.emit({
      type: 'part',
      runId: run.id,
      sessionId: run.sessionId,
      assistantMessageId: run.assistantMessageId,
      seq: this.options.runManager.nextSeq(run.id),
      part: toolCallPart(toolCall),
    })
    this.options.runManager.emit(
      kind === 'call'
        ? createToolCallEvent({
            runId: run.id,
            sessionId: run.sessionId,
            assistantMessageId: run.assistantMessageId,
            seq: this.options.runManager.nextSeq(run.id),
            step,
            toolCall,
          })
        : createToolResultEvent({
            runId: run.id,
            sessionId: run.sessionId,
            assistantMessageId: run.assistantMessageId,
            seq: this.options.runManager.nextSeq(run.id),
            step,
            toolCall,
          })
    )
  }
}

function appendText(parts: ChatMessagePart[], text: string): void {
  const last = parts[parts.length - 1] as { type?: string; text?: string } | undefined
  if (last?.type === 'plain') {
    last.text = `${last.text ?? ''}${text}`
    return
  }
  parts.push({ type: 'plain', text })
}

function clampMaxSteps(value?: number): number {
  if (!Number.isFinite(value)) {
    return 6
  }
  return Math.max(1, Math.min(Math.floor(value ?? 6), 12))
}

function providerSupportsTools(provider: ProviderConfig, model: ProviderModel): boolean {
  if (
    provider.capabilities?.tools === false ||
    model.capabilities?.tools === false ||
    model.capabilities?.toolCall === false
  ) {
    return false
  }
  // OpenAI-compatible /models commonly returns only model IDs. In existing configs
  // supportsTools:false often means "unknown" rather than a verified model limit.
  return true
}

function canRetryWithoutTools(
  chatError: ChatError,
  stepParts: ChatMessagePart[],
  stepToolCalls: ProviderToolCall[],
  sawFinal: boolean
): boolean {
  return (
    !sawFinal &&
    stepParts.length === 0 &&
    stepToolCalls.length === 0 &&
    isToolUnsupportedProviderError(chatError)
  )
}

function isToolUnsupportedProviderError(chatError: ChatError): boolean {
  const message = `${chatError.message} ${chatError.providerBodyPreview ?? ''}`.toLowerCase()
  if (message.includes('function calling is not enabled')) {
    return true
  }
  if (message.includes('tool') && hasUnsupportedCapabilityText(message)) {
    return true
  }
  if (message.includes('function') && hasUnsupportedCapabilityText(message)) {
    return true
  }
  return false
}

function hasUnsupportedCapabilityText(message: string): boolean {
  return (
    message.includes('support') ||
    message.includes('unsupported') ||
    message.includes('not enabled') ||
    message.includes('disabled')
  )
}

function parseArgumentsForDisplay(value: string): unknown {
  try {
    return value.trim() ? (JSON.parse(value) as unknown) : {}
  } catch {
    return value
  }
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException('Run aborted.', 'AbortError')
  }
}

function collectReasoningContent(parts: ChatMessagePart[]): string | undefined {
  const text = parts
    .filter((part): part is Extract<ChatMessagePart, { type: 'think' }> => part.type === 'think')
    .map((part) => part.think)
    .join('')
    .trim()
  return text || undefined
}

function collectPlainContent(parts: ChatMessagePart[]): string | undefined {
  const text = parts
    .filter((part): part is Extract<ChatMessagePart, { type: 'plain' }> => part.type === 'plain')
    .map((part) => part.text)
    .join('')
    .trim()
  return text || undefined
}

function injectToolInventory(
  messages: ProviderMessage[],
  tools: AgentTool[],
  supportsSystemRole: boolean
): ProviderMessage[] {
  const prompt = buildToolInventoryPrompt(tools)
  if (!prompt) {
    return [...messages]
  }

  if (supportsSystemRole) {
    const next = [...messages]
    const systemIndex = next.findIndex((message) => message.role === 'system')
    if (systemIndex >= 0) {
      const system = next[systemIndex]!
      next[systemIndex] = {
        ...system,
        content: appendTextContent(system.content, prompt),
      }
      return next
    }
    return [{ role: 'system', content: prompt }, ...next]
  }

  const next = [...messages]
  const userIndex = next.findIndex((message) => message.role === 'user')
  if (userIndex >= 0) {
    const user = next[userIndex]!
    next[userIndex] = {
      ...user,
      content: prependTextContent(user.content, prompt),
    }
    return next
  }

  return [{ role: 'user', content: prompt }, ...next]
}

function buildToolInventoryPrompt(tools: AgentTool[]): string | undefined {
  if (!tools.length) {
    return undefined
  }

  const lines = tools.slice(0, 80).map((tool) => {
    const name = tool.providerName ?? tool.name
    const source =
      tool.source === 'mcp'
        ? `mcp${tool.serverName ? `:${sanitizeToolPromptText(tool.serverName, 80)}` : ''}`
        : tool.source
    const description = sanitizeToolPromptText(tool.description, 180)
    return `- ${name} [${source}]: ${description}`
  })

  const omittedCount = Math.max(0, tools.length - lines.length)
  if (omittedCount) {
    lines.push(`- ... ${omittedCount} additional tools omitted from this summary.`)
  }

  return [
    'Available tools for this chat run are listed below. Tool parameter schemas are provided separately through the tool API.',
    'If the user asks which MCP tools are available, answer from entries marked with [mcp] and use the exact tool names shown here.',
    'If no entries are marked [mcp], say that no MCP tools are currently available in this run.',
    ...lines,
  ].join('\n')
}

function appendTextContent(
  content: ProviderMessage['content'],
  text: string
): ProviderMessage['content'] {
  if (typeof content === 'string') {
    return content ? `${content}\n\n${text}` : text
  }
  return [...content, { type: 'text', text }]
}

function prependTextContent(
  content: ProviderMessage['content'],
  text: string
): ProviderMessage['content'] {
  if (typeof content === 'string') {
    return content ? `${text}\n\n${content}` : text
  }
  return [{ type: 'text', text }, ...content]
}

function sanitizeToolPromptText(value: string | undefined, maxLength: number): string {
  return (value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

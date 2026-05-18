import type { ChatMessageRepo, ChatRunRepo } from '@core/db/repos'
import { normalizeProviderError } from '@core/provider/errors'
import type { ProviderManager } from '@core/provider/manager'
import type { ProviderToolCall } from '@core/provider/base-provider'
import type { ChatMessagePart, ChatRun, ChatRunMode, ChatSession, ToolProfile } from '@shared/types/chat'
import type { ProviderConfig, ProviderModel } from '@shared/types/provider'
import type { ContextBuilder } from '@core/chat/context-manager'
import type { RunManager } from '@core/chat/run-manager'
import { createAgentStepEvent, createToolCallEvent, createToolResultEvent, toolCallPart, upsertToolCallPart } from './agent-events'
import { ToolExecutor } from './tool-executor'
import { providerToolsFromAgentTools, ToolRegistry } from './tool-registry'
import { defaultToolPolicy } from './tool-policy'

export interface AgentRunnerOptions {
  messages: ChatMessageRepo
  runs: ChatRunRepo
  providers: ProviderManager
  contextBuilder: ContextBuilder
  runManager: RunManager
  toolRegistry: ToolRegistry
  toolExecutor?: ToolExecutor
  onComplete?: (sessionId: string) => void
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
    this.toolExecutor = options.toolExecutor ?? new ToolExecutor()
  }

  async run(input: AgentRunInput): Promise<void> {
    const assistantParts: ChatMessagePart[] = []
    const maxSteps = clampMaxSteps(input.maxSteps)
    const requestedMode = input.mode ?? 'assistant'
    const supportsTools = providerSupportsTools(input.provider, input.model)
    const mode: ChatRunMode = requestedMode === 'fast_chat' || !supportsTools ? 'fast_chat' : 'assistant'
    const fallbackReason = requestedMode === 'assistant' && !supportsTools ? 'provider_or_model_does_not_support_tools' : undefined

    try {
      const allMessages = this.options.messages.listBySession(input.session.id)
      const context = await this.options.contextBuilder.build({
        session: input.session,
        messages: allMessages,
        currentUserMessageId: input.run.userMessageId,
        provider: input.provider,
        model: input.model,
      })
      const client = await this.options.providers.createProviderClient(input.provider.id)
      const messages = [...context.messages]
      const policy = defaultToolPolicy(input.toolProfile ?? 'minimal')
      const agentTools = mode === 'assistant'
        ? await this.options.toolRegistry.resolve({ sessionId: input.session.id, policy })
        : []
      const providerTools = providerToolsFromAgentTools(agentTools)
      const snapshot = {
        ...context.snapshot,
        mode,
        toolProfile: input.toolProfile ?? 'minimal',
        availableTools: agentTools.map((tool) => tool.providerName ?? tool.name),
        toolSources: agentTools.map((tool) => ({
          name: tool.providerName ?? tool.name,
          source: tool.source,
          serverId: tool.serverId,
        })),
        maxSteps,
        fallbackReason,
      }
      this.options.runs.save({ ...input.run, requestSnapshot: snapshot, updatedAt: Date.now() })

      for (let step = 1; step <= maxSteps; step += 1) {
        throwIfAborted(input.signal)
        this.options.runManager.emit(createAgentStepEvent({
          runId: input.run.id,
          sessionId: input.run.sessionId,
          assistantMessageId: input.run.assistantMessageId,
          seq: this.options.runManager.nextSeq(input.run.id),
          step,
          maxSteps,
          status: 'started',
        }))

        const stepToolCalls: ProviderToolCall[] = []
        let sawFinal = false
        for await (const chunk of client.streamChat({
          modelId: input.model.remoteId || input.model.id,
          messages,
          maxOutputTokens: input.model.maxOutputTokens,
          tools: providerTools.length ? providerTools : undefined,
          abortSignal: input.signal,
        })) {
          throwIfAborted(input.signal)

          if (chunk.type === 'delta' && (chunk.content || chunk.reasoning)) {
            const text = chunk.content ?? chunk.reasoning ?? ''
            if (chunk.content) {
              appendText(assistantParts, text)
            }
            if (chunk.reasoning) {
              assistantParts.push({ type: 'think', think: text })
            }
            this.options.messages.updateParts(input.run.assistantMessageId, assistantParts, { status: 'streaming' })
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
              return
            }
          }
        }

        if (!stepToolCalls.length) {
          if (!sawFinal) {
            this.completeRun(input.run, assistantParts)
          }
          return
        }

        this.options.runManager.emit(createAgentStepEvent({
          runId: input.run.id,
          sessionId: input.run.sessionId,
          assistantMessageId: input.run.assistantMessageId,
          seq: this.options.runManager.nextSeq(input.run.id),
          step,
          maxSteps,
          status: 'tool_calling',
        }))

        messages.push({
          role: 'assistant',
          content: '',
          reasoningContent: collectReasoningContent(assistantParts),
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

        this.options.runManager.emit(createAgentStepEvent({
          runId: input.run.id,
          sessionId: input.run.sessionId,
          assistantMessageId: input.run.assistantMessageId,
          seq: this.options.runManager.nextSeq(input.run.id),
          step,
          maxSteps,
          status: 'tool_complete',
        }))
      }

      const message = `Reached maximum agent steps (${maxSteps}) before a final answer.`
      appendText(assistantParts, message)
      this.options.messages.updateParts(input.run.assistantMessageId, assistantParts, { status: 'complete' })
      this.options.runs.updateStatus(input.run.id, 'complete', { finishedAt: Date.now() })
      this.emitFinal(input.run)
      this.options.onComplete?.(input.run.sessionId)
    } catch (error) {
      const chatError = normalizeProviderError(error)
      const status = chatError.code === 'aborted' ? 'aborted' : 'error'
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
    kind: 'call' | 'result',
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
    this.options.runManager.emit(kind === 'call'
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
        }))
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
  if (provider.capabilities?.tools === false || model.supportsTools === false) {
    return false
  }
  return true
}

function parseArgumentsForDisplay(value: string): unknown {
  try {
    return value.trim() ? JSON.parse(value) as unknown : {}
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

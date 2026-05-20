import { injectToolInventory, providerSupportsTools } from '@core/agent/run/helpers'
import { ToolExecutor } from '@core/agent/tools/executor'
import { defaultToolPolicy } from '@core/agent/tools/policy'
import { providerToolsFromAgentTools, type ToolRegistry } from '@core/agent/tools/registry'
import type { AgentTool, NormalizedToolResult } from '@core/agent/tools/types'
import type { ContextBuilder } from '@core/chat/context-manager'
import type { ChatMessageRepo, ChatSessionRepo } from '@core/db/repos'
import type { Logger } from '@core/logging'
import type {
  BaseProvider,
  ChatCompletionChunk,
  ProviderMessage,
  ProviderToolCall,
} from '@core/provider/base-provider'
import { type ProviderManager, ProviderSelectionError } from '@core/provider/manager'
import type { SkillManager } from '@core/skill'
import type { ChatMessage, ChatSession } from '@shared/types/chat'
import type { CronRun, CronTask } from '@shared/types/cron'
import type { ProviderConfig, ProviderModel } from '@shared/types/provider'
import type { ScheduledTaskExecutionResult, ScheduledTaskExecutor } from './cron-manager'

export interface ScheduledTaskAgentExecutorOptions {
  sessions: ChatSessionRepo
  messages: ChatMessageRepo
  providers: ProviderManager
  contextBuilder: ContextBuilder
  toolRegistry: ToolRegistry
  skills?: SkillManager
  compactSkillDescriptions?: () => boolean
  logger?: Logger
}

export class ScheduledTaskAgentExecutor implements ScheduledTaskExecutor {
  private readonly toolExecutor: ToolExecutor

  constructor(private readonly options: ScheduledTaskAgentExecutorOptions) {
    this.toolExecutor = new ToolExecutor({ logger: options.logger?.child({ scope: 'tool' }) })
  }

  async execute(input: {
    task: CronTask
    run: CronRun
    signal: AbortSignal
  }): Promise<ScheduledTaskExecutionResult> {
    const startedAt = Date.now()
    const logger = this.options.logger?.child({
      scope: 'execute',
      taskId: input.task.id,
      runId: input.run.id,
      sessionId: input.task.targetSessionId,
    })
    const session = this.requireSession(input.task.targetSessionId)
    const { provider, model } = await this.resolveProviderAndModel(session)
    const policy = defaultToolPolicy('assistant')
    const supportsTools = providerSupportsTools(provider, model)
    const agentTools = supportsTools
      ? await this.options.toolRegistry.resolve({ sessionId: session.id, policy })
      : []
    const providerTools = providerToolsFromAgentTools(agentTools)
    const sourceMessages = [
      ...this.options.messages.listBySession(session.id),
      createScheduledInstructionMessage(input.task, input.run),
    ]
    const skillPrompt = this.options.skills?.buildPromptInventory({
      compact: this.options.compactSkillDescriptions?.() ?? true,
      supportsSystemRole: model.compat?.supportsSystemRole !== false,
    })
    const context = await this.options.contextBuilder.build({
      session,
      messages: sourceMessages,
      currentUserMessageId: scheduledInstructionMessageId(input.run.id),
      provider,
      model,
      skillPrompt,
    })
    const client = await this.options.providers.createProviderClient(provider.id)
    const providerMessages = injectToolInventory(
      context.messages,
      agentTools,
      model.compat?.supportsSystemRole !== false
    )
    const finalText = await this.runProviderLoop({
      client,
      providerMessages,
      model,
      providerTools,
      agentTools,
      policy,
      signal: input.signal,
    })
    const text = finalText.trim()
    if (!text) {
      logger?.info('Scheduled task completed without user-facing output.', {
        providerId: provider.id,
        modelId: model.id,
        durationMs: Date.now() - startedAt,
      })
      return {}
    }

    const message = this.appendFinalMessage(session, input.task, input.run, provider, model, text)
    logger?.info('Scheduled task final message appended.', {
      providerId: provider.id,
      modelId: model.id,
      messageId: message.id,
      durationMs: Date.now() - startedAt,
    })
    return {
      resultMessageId: message.id,
      resultSummary: summarizeResult(text),
    }
  }

  private async runProviderLoop(input: {
    client: BaseProvider
    providerMessages: ProviderMessage[]
    model: ProviderModel
    providerTools: ReturnType<typeof providerToolsFromAgentTools>
    agentTools: AgentTool[]
    policy: ReturnType<typeof defaultToolPolicy>
    signal: AbortSignal
  }): Promise<string> {
    const messages = [...input.providerMessages]
    let finalText = ''
    for (let step = 1; step <= 6; step += 1) {
      throwIfAborted(input.signal)
      const stepText: string[] = []
      const toolCalls: ProviderToolCall[] = []
      for await (const chunk of input.client.streamChat({
        modelId: input.model.remoteId || input.model.id,
        messages,
        maxOutputTokens: input.model.maxOutputTokens,
        tools: input.providerTools.length ? input.providerTools : undefined,
        abortSignal: input.signal,
      })) {
        throwIfAborted(input.signal)
        collectProviderChunk(chunk, stepText, toolCalls)
      }
      if (!toolCalls.length) {
        finalText = stepText.join('')
        break
      }

      messages.push({
        role: 'assistant',
        content: stepText.join(''),
        toolCalls,
      })
      for (const toolCall of toolCalls) {
        const result = await this.executeTool(
          input.agentTools,
          input.policy,
          toolCall,
          input.signal
        )
        messages.push({
          role: 'tool',
          toolCallId: toolCall.id,
          content: result.resultText,
        })
        if (result.status === 'aborted') {
          throw new DOMException('Scheduled task tool execution aborted.', 'AbortError')
        }
      }
    }
    return finalText
  }

  private async executeTool(
    tools: AgentTool[],
    policy: ReturnType<typeof defaultToolPolicy>,
    toolCall: ProviderToolCall,
    signal: AbortSignal
  ): Promise<NormalizedToolResult> {
    const result = await this.toolExecutor.execute({
      toolCall,
      tools,
      policy,
      signal,
    })
    if (toolCall.function.name === 'skill_read') {
      this.options.skills?.drainReadSkillIds()
    }
    return result.result
  }

  private requireSession(sessionId: string): ChatSession {
    const session = this.options.sessions.get(sessionId)
    if (!session || session.status === 'deleted') {
      throw new ProviderSelectionError({
        code: 'not_found',
        message: 'Scheduled task target chat session was not found.',
        retryable: false,
      })
    }
    return session
  }

  private async resolveProviderAndModel(
    session: ChatSession
  ): Promise<{ provider: ProviderConfig; model: ProviderModel }> {
    const resolved = session.defaultProviderId
      ? {
          provider: await this.options.providers.get(session.defaultProviderId),
          modelId: session.defaultModelId,
        }
      : await this.options.providers.resolveDefaultProvider(session.id)
    if (!resolved.provider) {
      throw new ProviderSelectionError({
        code: 'not_found',
        message: 'No enabled provider is configured for the scheduled task target session.',
        retryable: false,
      })
    }
    const provider = await this.options.providers.get(resolved.provider.id)
    if (!provider) {
      throw new ProviderSelectionError({
        code: 'not_found',
        message: 'Scheduled task provider is not available.',
        retryable: false,
      })
    }
    const model =
      provider.models.find((item) => item.id === resolved.modelId && item.enabled !== false) ??
      provider.models.find((item) => item.enabled !== false)
    if (!model) {
      throw new ProviderSelectionError({
        code: 'validation',
        message: 'No enabled model is configured for scheduled task execution.',
        retryable: false,
      })
    }
    return { provider, model }
  }

  private appendFinalMessage(
    session: ChatSession,
    task: CronTask,
    run: CronRun,
    provider: ProviderConfig,
    model: ProviderModel,
    text: string
  ): ChatMessage {
    const now = Date.now()
    const message: ChatMessage = {
      id: crypto.randomUUID(),
      sessionId: session.id,
      role: 'assistant',
      status: 'complete',
      parts: [{ type: 'plain', text }],
      providerId: provider.id,
      modelId: model.id,
      metadata: {
        source: 'cron',
        cronTaskId: task.id,
        cronRunId: run.id,
      },
      createdAt: now,
      updatedAt: now,
    }
    this.options.messages.save(message)
    const messages = this.options.messages.listBySession(session.id)
    this.options.sessions.updateMessageSummary(
      session.id,
      {
        messageCount: messages.length,
        lastMessagePreview: summarizeResult(text, 160),
        lastMessageAt: now,
      },
      now
    )
    return message
  }
}

function collectProviderChunk(
  chunk: ChatCompletionChunk,
  text: string[],
  toolCalls: ProviderToolCall[]
): void {
  if (chunk.type === 'delta' && chunk.content) {
    text.push(chunk.content)
    return
  }
  if (chunk.type === 'tool_call_final') {
    toolCalls.push(...chunk.toolCalls)
  }
}

function createScheduledInstructionMessage(task: CronTask, run: CronRun): ChatMessage {
  const now = Date.now()
  return {
    id: scheduledInstructionMessageId(run.id),
    sessionId: task.targetSessionId,
    role: 'user',
    status: 'complete',
    parts: [
      {
        type: 'plain',
        text: [
          'This is an internal scheduled task execution.',
          `Task ID: ${task.id}`,
          `Run ID: ${run.id}`,
          `Run reason: ${run.reason}`,
          'Use the task note below to produce a concise final result for the user.',
          '<scheduled_task_note>',
          task.note,
          '</scheduled_task_note>',
        ].join('\n'),
      },
    ],
    metadata: {
      source: 'cron_internal',
      cronTaskId: task.id,
      cronRunId: run.id,
    },
    createdAt: now,
    updatedAt: now,
  }
}

function scheduledInstructionMessageId(runId: string): string {
  return `cron-instruction:${runId}`
}

function summarizeResult(text: string, maxLength = 500): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException('Scheduled task execution aborted.', 'AbortError')
  }
}

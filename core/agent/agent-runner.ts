import type { ContextCompactionService } from '@core/chat/context-compaction'
import type { ContextBuilder } from '@core/chat/context-manager'
import type { RunManager } from '@core/chat/run-manager'
import type { ChatMessageRepo, ChatRunRepo } from '@core/db/repos'
import type { Logger } from '@core/logging'
import type { ProviderManager } from '@core/provider/manager'
import type { SkillManager } from '@core/skill/skill-manager'
import type { ChatRun, ChatRunMode, ChatSession, ToolProfile } from '@shared/types/chat'
import type { ProviderConfig, ProviderModel } from '@shared/types/provider'
import type { DesktopChatContextSettings } from '@shared/types/settings'
import { AgentRunFinalizer } from './run/finalize'
import { prepareAgentRun } from './run/prepare'
import type { AgentRunState } from './run/state'
import { AgentStepEngine } from './step-engine'
import { ToolExecutor } from './tools/executor'
import type { ToolRegistry } from './tools/registry'

export interface AgentRunnerOptions {
  messages: ChatMessageRepo
  runs: ChatRunRepo
  providers: ProviderManager
  contextBuilder: ContextBuilder
  contextCompaction?: ContextCompactionService
  runManager: RunManager
  toolRegistry: ToolRegistry
  skills?: SkillManager
  compactSkillDescriptions?: () => boolean
  contextDefaults?: () => DesktopChatContextSettings
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
    const finalizer = new AgentRunFinalizer(this.options, logger)
    let state: AgentRunState | undefined

    try {
      const prepared = await prepareAgentRun(this.options, input, startedAt)
      state = prepared.state
      logger?.info('Agent run started.', {
        mode: state.mode,
        requestedMode: state.requestedMode,
        fallbackReason: state.fallbackReason,
        maxSteps: state.maxSteps,
        supportsTools: state.supportsTools,
      })
      logger?.debug('Agent context prepared.', {
        mode: state.mode,
        toolCount: state.agentTools.length,
        skillInjected: state.skillPrompt?.injected,
        enabledSkillCount: state.skillPrompt?.enabledSkillIds.length ?? 0,
      })

      const engine = new AgentStepEngine(
        {
          messages: this.options.messages,
          runs: this.options.runs,
          runManager: this.options.runManager,
          skills: this.options.skills,
          toolExecutor: this.toolExecutor,
        },
        prepared.client,
        finalizer,
        logger
      )
      await engine.run(state)
    } catch (error) {
      if (state) {
        finalizer.failRun(state, error)
      } else {
        finalizer.failInput(input, startedAt, error)
      }
    } finally {
      if (state) {
        finalizer.finish(state)
      } else {
        finalizer.finishRun(input.run.id)
      }
    }
  }
}

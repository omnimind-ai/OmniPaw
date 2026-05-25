import type { BaseProvider } from '@core/provider/base-provider'
import type { ChatRunMode } from '@shared/types/chat'
import type { SkillPromptContext } from '@shared/types/skill'
import type { AgentRunInput, AgentRunnerOptions } from '../agent-runner'
import { defaultToolPolicy } from '../tools/policy'
import { providerToolsFromAgentTools } from '../tools/registry'
import { clampMaxSteps, injectToolInventory, providerSupportsTools } from './helpers'
import { AgentRunState } from './state'

export interface PreparedAgentRun {
  state: AgentRunState
  client: BaseProvider
}

export async function prepareAgentRun(
  options: AgentRunnerOptions,
  input: AgentRunInput,
  startedAt: number
): Promise<PreparedAgentRun> {
  const maxSteps = clampMaxSteps(input.maxSteps)
  const requestedMode = input.mode ?? 'assistant'
  const supportsTools = providerSupportsTools(input.provider, input.model)
  const mode: ChatRunMode =
    requestedMode === 'fast_chat' || !supportsTools ? 'fast_chat' : 'assistant'
  const fallbackReason =
    requestedMode === 'assistant' && !supportsTools
      ? 'provider_or_model_does_not_support_tools'
      : undefined
  const sourceMessages = options.messages.listBySession(input.session.id)
  const skillPrompt = options.skills?.buildPromptInventory({
    compact: options.compactSkillDescriptions?.() ?? true,
    supportsSystemRole: input.model.compat?.supportsSystemRole !== false,
  })
  const toolProfile = input.toolProfile ?? 'assistant'
  const policy = defaultToolPolicy(toolProfile)
  const agentTools =
    mode === 'assistant'
      ? await options.toolRegistry.resolve({ sessionId: input.session.id, policy })
      : []
  const context = await options.contextBuilder.build({
    session: input.session,
    messages: sourceMessages,
    currentUserMessageId: input.run.userMessageId,
    provider: input.provider,
    model: input.model,
    skillPrompt,
  })
  const client = await options.providers.createProviderClient(input.provider.id)
  const providerMessages = injectToolInventory(
    context.messages,
    agentTools,
    input.model.compat?.supportsSystemRole !== false
  )
  const providerTools = providerToolsFromAgentTools(agentTools)
  const snapshot = {
    ...context.snapshot,
    messageCount: providerMessages.length,
    mode,
    toolProfile,
    availableTools: agentTools.map((tool) => tool.providerName ?? tool.name),
    toolSources: agentTools.map((tool) => ({
      name: tool.providerName ?? tool.name,
      source: tool.source,
      serverId: tool.serverId,
    })),
    localCapabilities: {
      enabled: agentTools.some((tool) => Boolean(tool.localCapability)),
      providerFacingToolNames: agentTools
        .filter((tool) => Boolean(tool.localCapability))
        .map((tool) => tool.providerName ?? tool.name),
      profile: toolProfile,
      fullAccess: agentTools.some((tool) => tool.localCapability?.fullAccess),
      hiddenReasons:
        toolProfile === 'minimal'
          ? ['minimal_profile_hides_local_write_and_terminal_tools']
          : undefined,
    },
    skills: skillSnapshot(skillPrompt),
    maxSteps,
    fallbackReason,
  }
  options.runs.save({ ...input.run, requestSnapshot: snapshot, updatedAt: Date.now() })

  return {
    state: new AgentRunState({
      startedAt,
      input,
      mode,
      requestedMode,
      supportsTools,
      fallbackReason,
      maxSteps,
      toolProfile,
      policy,
      sourceMessages,
      providerMessages,
      baseProviderMessages: context.messages,
      agentTools,
      providerTools,
      snapshot,
      skillPrompt,
    }),
    client,
  }
}

function skillSnapshot(skillPrompt: SkillPromptContext | undefined) {
  return skillPrompt
    ? {
        enabledSkillIds: skillPrompt.enabledSkillIds,
        injected: skillPrompt.injected,
        omittedReason: skillPrompt.omittedReason,
      }
    : undefined
}

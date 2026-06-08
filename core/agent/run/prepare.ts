import type { BaseProvider } from '@core/provider/base-provider'
import { throwProviderError } from '@core/provider/errors'
import type { ChatRunMode, ToolProfile } from '@shared/types/chat'
import type { SkillPromptContext } from '@shared/types/skill'
import type { AgentRunInput, AgentRunnerOptions } from '../agent-runner'
import { defaultToolPolicy } from '../tools/policy'
import { providerToolsFromAgentTools } from '../tools/registry'
import type { AgentTool } from '../tools/types'
import { prepareRunDocumentAttachments } from './document-attachments'
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
  let sourceMessages = options.messages.listBySession(input.session.id)
  const skillPrompt = input.omitSkillInventory
    ? {
        enabledSkillIds: [],
        injected: false,
        omittedReason: 'tavern_run_profile',
      }
    : options.skills?.buildPromptInventory({
        compact: options.compactSkillDescriptions?.() ?? true,
        supportsSystemRole: input.model.compat?.supportsSystemRole !== false,
      })
  const toolProfile = input.toolProfile ?? 'assistant'
  const policy = defaultToolPolicy(toolProfile)
  const agentTools =
    mode === 'assistant'
      ? await options.toolRegistry.resolve({ sessionId: input.session.id, policy })
      : []
  const documentAttachments = await prepareRunDocumentAttachments({
    options,
    input,
    sourceMessages,
    requestedMode,
    mode,
    supportsTools,
    toolProfile,
    agentTools,
  })
  sourceMessages = documentAttachments.sourceMessages
  const tavernContext =
    input.tavernContext ??
    options.tavernContextService?.buildPlan({
      session: input.session,
      messages: sourceMessages,
      currentUserMessageId: input.run.userMessageId,
    })
  const memoryContext = options.memoryService?.retrieveForRun({
    session: input.session,
    messages: sourceMessages,
    currentUserMessageId: input.run.userMessageId,
  })
  if (documentAttachments.rejectionMessage) {
    const snapshot = {
      api: input.provider.api ?? 'openai-chat-completions',
      baseUrlHost: hostFromUrl(input.provider.baseUrl),
      model: input.model.remoteId ?? input.model.id,
      mode,
      toolProfile,
      availableTools: agentTools.map((tool) => tool.providerName ?? tool.name),
      toolSources: agentTools.map((tool) => ({
        name: tool.providerName ?? tool.name,
        source: tool.source,
        serverId: tool.serverId,
      })),
      localCapabilities: localCapabilitiesSnapshot(agentTools, toolProfile),
      skills: skillSnapshot(skillPrompt),
      maxSteps,
      fallbackReason,
      messageCount: 0,
      attachmentCount: documentAttachments.diagnostic?.complexCount ?? 0,
      complexDocumentAttachments: documentAttachments.diagnostic,
    }
    options.runs.save({ ...input.run, requestSnapshot: snapshot, updatedAt: Date.now() })
    throwProviderError({
      code: 'provider_bad_request',
      message: documentAttachments.rejectionMessage,
      retryable: false,
    })
  }
  const context = await options.contextBuilder.build({
    session: input.session,
    messages: sourceMessages,
    currentUserMessageId: input.run.userMessageId,
    provider: input.provider,
    model: input.model,
    skillPrompt,
    transientImageInputs: input.transientImageInputs,
    transientSystemInstructions: input.transientSystemInstructions,
    transientCurrentMessageParts: input.transientCurrentMessageParts,
    tavernContext,
    memoryContext,
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
      ...localCapabilitiesSnapshot(agentTools, toolProfile),
    },
    skills: skillSnapshot(skillPrompt),
    tavern: tavernContext?.snapshot
      ? {
          ...tavernContext.snapshot,
          omittedInventoryReasons:
            input.omittedInventoryReasons ?? tavernContext.snapshot.omittedInventoryReasons,
        }
      : undefined,
    omittedInventoryReasons: input.omittedInventoryReasons,
    maxSteps,
    complexDocumentAttachments: documentAttachments.diagnostic,
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

function localCapabilitiesSnapshot(agentTools: AgentTool[], toolProfile: ToolProfile) {
  return {
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
  }
}

function hostFromUrl(value: string): string | undefined {
  try {
    return new URL(value).host
  } catch {
    return undefined
  }
}

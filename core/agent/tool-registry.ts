import type { AttachmentService } from '@core/chat/attachment-service'
import type { ChatMessageRepo } from '@core/db/repos'
import type { ProviderTool } from '@core/provider/base-provider'
import type { SkillManager } from '@core/skill/skill-manager'
import type { ToolProfile } from '@shared/types/chat'
import { createBuiltinTools } from './builtin-tools'
import type { AgentTool } from './tool'
import { toProviderTool } from './tool'
import { allowedToolNamesForProfile, type ToolPolicy } from './tool-policy'

export interface ToolRegistryOptions {
  messages: ChatMessageRepo
  attachments: AttachmentService
  skills?: SkillManager
  disabledToolNames?: () => Iterable<string>
  mcpTools?: (input: ToolResolutionInput) => AgentTool[] | Promise<AgentTool[]>
}

export interface ToolResolutionInput {
  sessionId: string
  policy: ToolPolicy
}

export class ToolRegistry {
  constructor(private readonly options: ToolRegistryOptions) {}

  async resolve(input: ToolResolutionInput): Promise<AgentTool[]> {
    if (!input.policy.enabled) {
      return []
    }

    const disabledNames = new Set(this.options.disabledToolNames?.() ?? [])
    const builtinTools = createBuiltinTools({
      messages: this.options.messages,
      attachments: this.options.attachments,
      sessionId: input.sessionId,
      skills: this.options.skills,
    })
    const profileNames = new Set(allowedToolNamesForProfile(input.policy.profile as ToolProfile))
    const builtins = builtinTools.filter(
      (tool) => !disabledNames.has(tool.name) && profileNames.has(tool.name)
    )
    const mcpTools = (await this.options.mcpTools?.(input)) ?? []
    return [...builtins, ...mcpTools.filter((tool) => !disabledNames.has(tool.name))]
  }
}

export function providerToolsFromAgentTools(tools: AgentTool[]): ProviderTool[] {
  return tools.map(toProviderTool)
}

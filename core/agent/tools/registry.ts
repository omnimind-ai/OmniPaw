import type { AttachmentService } from '@core/chat/attachment-service'
import type { CronManager } from '@core/cron/cron-manager'
import type { ChatMessageRepo } from '@core/db/repos'
import type { ProviderTool } from '@core/provider/base-provider'
import type { SkillManager } from '@core/skill/skill-manager'
import type { ToolProfile } from '@shared/types/chat'
import { createBuiltinTools } from './builtin-tools'
import { allowedToolNamesForProfile, type ToolPolicy } from './policy'
import type { AgentTool } from './types'
import { toProviderTool } from './types'

export interface ToolRegistryOptions {
  messages: ChatMessageRepo
  attachments: AttachmentService
  skills?: SkillManager
  cronManager?: () => CronManager
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
      cronManager: this.options.cronManager?.(),
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

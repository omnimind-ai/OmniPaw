import type { TerminalService } from '@core/agent/terminal'
import type { AgentWorkspaceService } from '@core/agent/workspace'
import type { AttachmentService } from '@core/chat/attachment-service'
import type { CronManager } from '@core/cron/cron-manager'
import type { ChatMessageRepo } from '@core/db/repos'
import type { CompanionMemoryService } from '@core/memory/service'
import type { ObservationManager } from '@core/observation'
import type { ProviderTool } from '@core/provider/base-provider'
import type { SkillManager } from '@core/skill/skill-manager'
import type { ToolProfile } from '@shared/types/chat'
import type { DesktopToolSettings } from '@shared/types/settings'
import { createBuiltinTools } from './builtin-tools'
import { allowedToolNamesForProfile, type ToolPolicy } from './policy'
import type { AgentTool } from './types'
import { toProviderTool } from './types'

export interface ToolRegistryOptions {
  messages: ChatMessageRepo
  attachments: AttachmentService
  memoryService?: CompanionMemoryService
  skills?: SkillManager
  cronManager?: () => CronManager
  observationManager?: () => ObservationManager | undefined
  workspaceService?: AgentWorkspaceService
  terminalService?: TerminalService
  toolSettings?: () => DesktopToolSettings
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
      memoryService: this.options.memoryService,
      skills: this.options.skills,
      cronManager: this.options.cronManager?.(),
      observationManager: this.options.observationManager?.(),
      policy: input.policy,
      workspaceService: this.options.workspaceService,
      terminalService: this.options.terminalService,
      toolSettings: this.options.toolSettings,
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

import type { AttachmentService } from '@core/chat/attachment-service'
import type { ChatMessageRepo } from '@core/db/repos'
import type { ProviderTool } from '@core/provider/base-provider'
import type { ToolProfile } from '@shared/types/chat'
import { createBuiltinTools } from './builtin-tools'
import type { AgentTool } from './tool'
import { toProviderTool } from './tool'
import { allowedToolNamesForProfile, type ToolPolicy } from './tool-policy'

export interface ToolRegistryOptions {
  messages: ChatMessageRepo
  attachments: AttachmentService
  disabledToolNames?: () => Iterable<string>
}

export interface ToolResolutionInput {
  sessionId: string
  policy: ToolPolicy
}

export class ToolRegistry {
  constructor(private readonly options: ToolRegistryOptions) {}

  resolve(input: ToolResolutionInput): AgentTool[] {
    if (!input.policy.enabled) {
      return []
    }

    const disabledNames = new Set(this.options.disabledToolNames?.() ?? [])
    const tools = createBuiltinTools({
      messages: this.options.messages,
      attachments: this.options.attachments,
      sessionId: input.sessionId,
    })
    const profileNames = new Set(allowedToolNamesForProfile(input.policy.profile as ToolProfile))
    return tools.filter((tool) => !disabledNames.has(tool.name) && profileNames.has(tool.name))
  }
}

export function providerToolsFromAgentTools(tools: AgentTool[]): ProviderTool[] {
  return tools.map(toProviderTool)
}

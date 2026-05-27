import type { AgentTool, ToolProfile, ToolRisk } from './types'

export interface ToolPolicy {
  enabled: boolean
  profile: ToolProfile
  allow?: string[]
  deny?: string[]
  requireApprovalForRisk?: ToolRisk[]
}

export interface ToolPolicyDecision {
  allowed: boolean
  reason?: string
  approvalRequired?: boolean
}

const PROFILE_TOOLS: Record<ToolProfile, string[]> = {
  minimal: [
    'system_time',
    'calculator',
    'attachment_text_read',
    'attachment_text_search',
    'skill_read',
  ],
  assistant: [
    'system_time',
    'calculator',
    'attachment_text_read',
    'attachment_text_search',
    'future_task',
    'skill_read',
    'workspace_file',
    'terminal_exec',
    'screen_observe',
  ],
  power: [
    'system_time',
    'calculator',
    'attachment_text_read',
    'attachment_text_search',
    'future_task',
    'skill_read',
    'workspace_file',
    'terminal_exec',
    'screen_observe',
  ],
}

export function defaultToolPolicy(profile: ToolProfile = 'minimal'): ToolPolicy {
  return {
    enabled: true,
    profile,
    requireApprovalForRisk: profile === 'power' ? [] : ['write', 'network', 'exec'],
  }
}

export function decideToolUse(
  tool: AgentTool | undefined,
  policy: ToolPolicy,
  options: { risk?: ToolRisk } = {}
): ToolPolicyDecision {
  if (!policy.enabled) {
    return { allowed: false, reason: 'Tool use is disabled for this run.' }
  }

  if (!tool) {
    return { allowed: false, reason: 'Requested tool is not registered.' }
  }

  if (policy.deny?.includes(tool.name)) {
    return { allowed: false, reason: `Tool "${tool.name}" is denied by policy.` }
  }

  const profileAllowed = PROFILE_TOOLS[policy.profile] ?? []
  if (tool.source === 'builtin' && !profileAllowed.includes(tool.name)) {
    return {
      allowed: false,
      reason: `Tool "${tool.name}" is not available in ${policy.profile} profile.`,
    }
  }

  if (tool.profiles?.length && !tool.profiles.includes(policy.profile)) {
    return {
      allowed: false,
      reason: `Tool "${tool.name}" does not support ${policy.profile} profile.`,
    }
  }

  if (policy.allow?.length && !policy.allow.includes(tool.name)) {
    return { allowed: false, reason: `Tool "${tool.name}" is not in the allow list.` }
  }

  const risk = options.risk ?? tool.risk
  if (policy.requireApprovalForRisk?.includes(risk)) {
    return {
      allowed: false,
      approvalRequired: true,
      reason: `Tool "${tool.name}" requires approval for ${risk} risk.`,
    }
  }

  if (policy.profile === 'minimal' && !['safe', 'read'].includes(risk)) {
    return { allowed: false, reason: `Minimal profile cannot execute ${risk} risk tools.` }
  }

  return { allowed: true }
}

export function allowedToolNamesForProfile(profile: ToolProfile): string[] {
  return [...(PROFILE_TOOLS[profile] ?? [])]
}

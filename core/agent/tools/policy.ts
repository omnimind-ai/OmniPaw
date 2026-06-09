import { DEFAULT_TOOL_APPROVAL_RISKS, TOOL_PROFILE_ALLOWLIST } from './catalog'
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

export function defaultToolPolicy(profile: ToolProfile = 'minimal'): ToolPolicy {
  return {
    enabled: true,
    profile,
    requireApprovalForRisk: [...(DEFAULT_TOOL_APPROVAL_RISKS[profile] ?? [])],
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

  const profileAllowed = TOOL_PROFILE_ALLOWLIST[policy.profile] ?? []
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
  return [...(TOOL_PROFILE_ALLOWLIST[profile] ?? [])]
}

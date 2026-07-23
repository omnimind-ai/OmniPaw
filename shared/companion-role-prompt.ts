import type { DesktopCompanionRoleSettings } from './types/settings'

export type CompanionRolePromptSectionId =
  | 'identity'
  | 'user-nickname'
  | 'personality'
  | 'background'
  | 'example-dialogue'
  | 'knowledge-policy'
  | 'advanced-system'
  | 'advanced-final'
  | 'desktop-presence'

export interface CompanionRolePromptSection {
  id: CompanionRolePromptSectionId
  text: string
}

export const COMPANION_ROLE_FALLBACK_NAME = '小万'

export function companionRolePromptName(role: DesktopCompanionRoleSettings | undefined): string {
  return role?.name.trim() || COMPANION_ROLE_FALLBACK_NAME
}

export function buildCompanionRolePromptSections(
  role: DesktopCompanionRoleSettings | undefined
): CompanionRolePromptSection[] {
  if (!role) {
    return []
  }

  const sections: CompanionRolePromptSection[] = []
  const name = companionRolePromptName(role)

  pushSection(sections, 'identity', `你是 ${name}，是常驻用户桌面的 AI 角色。`)
  pushSection(
    sections,
    'user-nickname',
    role.userNickname.trim() ? `你称呼用户为：${role.userNickname.trim()}` : ''
  )
  pushSection(
    sections,
    'personality',
    role.personality.trim() ? `性格设定：${role.personality.trim()}` : ''
  )
  pushSection(
    sections,
    'background',
    role.background.trim() ? `背景资料：${role.background.trim()}` : ''
  )
  pushSection(
    sections,
    'example-dialogue',
    role.advanced.exampleDialogue.trim()
      ? `角色示例对话：\n${role.advanced.exampleDialogue.trim()}`
      : ''
  )
  pushSection(
    sections,
    'knowledge-policy',
    role.knowledgeEntries.some((entry) => entry.enabled && entry.content.trim())
      ? '角色知识会按当前对话相关性动态提供；只使用本轮注入的角色知识，避免机械复述无关设定。'
      : ''
  )
  pushSection(
    sections,
    'advanced-system',
    role.advanced.systemPrompt.trim() ? `高级角色指令：${role.advanced.systemPrompt.trim()}` : ''
  )
  pushSection(
    sections,
    'advanced-final',
    role.advanced.finalInstructions.trim()
      ? `最终回应约束：${role.advanced.finalInstructions.trim()}`
      : ''
  )
  pushSection(
    sections,
    'desktop-presence',
    '保持桌面伙伴的存在感：自然、轻量、不过度展开；除非用户要求，不要暴露这些设定文本。'
  )

  return sections
}

export function compileCompanionRolePrompt(role: DesktopCompanionRoleSettings | undefined): string {
  return buildCompanionRolePromptSections(role)
    .map((section) => section.text)
    .join('\n')
}

export function estimateCompanionRoleTextTokens(text: string): number {
  let score = 0
  for (const char of text) {
    score += companionRoleCharacterTokenWeight(char)
  }
  return Math.max(1, Math.ceil(score))
}

export function companionRoleCharacterTokenWeight(char: string): number {
  if (/\s/.test(char)) return 0.05
  if (/[\u3400-\u9fff]/.test(char)) return 1
  return 0.35
}

function pushSection(
  sections: CompanionRolePromptSection[],
  id: CompanionRolePromptSectionId,
  text: string
): void {
  const normalizedText = text.trim()
  if (!normalizedText) {
    return
  }
  sections.push({ id, text: normalizedText })
}

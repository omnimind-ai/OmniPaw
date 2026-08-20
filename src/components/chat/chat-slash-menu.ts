import type { Component } from 'vue'

export type ChatSlashMenuItemKind = 'command' | 'skill'

export type ChatSlashCommand =
  | 'new-chat'
  | 'add-attachment'
  | 'manage-skills'
  | 'open-settings'
  | 'clear-input'

export interface ChatSlashMenuItem {
  id: string
  kind: ChatSlashMenuItemKind
  label: string
  description: string
  token: string
  keywords: string
  icon: Component
  command?: ChatSlashCommand
  skillId?: string
}

export interface ChatSlashQuery {
  start: number
  end: number
  query: string
  signature: string
}

export interface ParsedChatSkillMentions {
  skillIds: string[]
  text: string
}

export function findChatSlashQuery(value: string, cursorPosition: number): ChatSlashQuery | null {
  const cursor = Math.max(0, Math.min(cursorPosition, value.length))
  const beforeCursor = value.slice(0, cursor)
  const match = beforeCursor.match(/(?:^|\s)\/([^\s/]*)$/u)
  if (!match) return null

  const query = match[1] ?? ''
  const start = cursor - query.length - 1
  return {
    start,
    end: cursor,
    query,
    signature: `${start}:${cursor}:${query}`,
  }
}

export function replaceChatSlashQuery(
  value: string,
  slashQuery: ChatSlashQuery,
  replacement: string
): { value: string; cursorPosition: number } {
  const suffixStart =
    (replacement.endsWith(' ') || replacement === '') && value[slashQuery.end] === ' '
      ? slashQuery.end + 1
      : slashQuery.end
  const nextValue = `${value.slice(0, slashQuery.start)}${replacement}${value.slice(suffixStart)}`
  return {
    value: nextValue,
    cursorPosition: slashQuery.start + replacement.length,
  }
}

export function parseChatSkillMentions(
  value: string,
  availableSkillIds: Iterable<string>
): ParsedChatSkillMentions {
  const availableIds = new Set(availableSkillIds)
  const skillIds: string[] = []
  let text = value

  while (text.startsWith('/')) {
    const match = text.match(/^\/([a-z0-9][a-z0-9_-]*)(?:[ \t]+|$)/iu)
    const skillId = match?.[1]
    if (!match || !skillId || !availableIds.has(skillId)) break

    if (!skillIds.includes(skillId)) skillIds.push(skillId)
    text = text.slice(match[0].length)
  }

  return { skillIds, text }
}

export function serializeChatSkillMentions(skillIds: Iterable<string>, text: string): string {
  const uniqueIds = Array.from(new Set(skillIds))
  if (!uniqueIds.length) return text

  const prefix = uniqueIds.map((skillId) => `/${skillId}`).join(' ')
  return text ? `${prefix} ${text}` : `${prefix} `
}

export function chatSlashItemMatches(item: ChatSlashMenuItem, query: string): boolean {
  const normalizedQuery = normalizeSlashSearch(query)
  if (!normalizedQuery) return true

  return normalizeSlashSearch(
    `${item.token} ${item.label} ${item.description} ${item.keywords}`
  ).includes(normalizedQuery)
}

export function chatSlashItemDomId(itemId: string): string {
  return `chat-slash-item-${itemId.replace(/[^a-zA-Z0-9_-]/gu, '-')}`
}

function normalizeSlashSearch(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/[\s_-]+/gu, '')
}

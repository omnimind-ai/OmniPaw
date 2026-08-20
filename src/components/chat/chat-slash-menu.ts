import type { Component } from 'vue'

export type ChatSlashMenuItemKind = 'skill' | 'mcp'

export interface ChatCapabilityReference {
  kind: ChatSlashMenuItemKind
  id: string
}

export interface ChatCapabilityMention extends ChatCapabilityReference {
  key: string
  label: string
}

export interface ChatSlashMenuItem {
  id: string
  kind: ChatSlashMenuItemKind
  label: string
  description: string
  token: string
  keywords: string
  icon: Component
  reference: ChatCapabilityReference
}

export interface ChatSlashQuery {
  start: number
  end: number
  query: string
  signature: string
}

export interface ParsedChatCapabilityMentions {
  references: ChatCapabilityReference[]
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

export function parseChatCapabilityMentions(
  value: string,
  availableSkillIds: Iterable<string>,
  availableMcpToolIds: Iterable<string>
): ParsedChatCapabilityMentions {
  const skillIds = new Set(availableSkillIds)
  const mcpToolIds = new Set(availableMcpToolIds)
  const references: ChatCapabilityReference[] = []
  let text = value

  while (text.startsWith('/')) {
    const match = text.match(/^\/([a-z0-9][a-z0-9_-]*)(?:[ \t]+|$)/iu)
    const referenceId = match?.[1]
    if (!match || !referenceId) break

    const kind = skillIds.has(referenceId)
      ? 'skill'
      : mcpToolIds.has(referenceId)
        ? 'mcp'
        : undefined
    if (!kind) break

    if (!references.some((reference) => reference.kind === kind && reference.id === referenceId)) {
      references.push({ kind, id: referenceId })
    }
    text = text.slice(match[0].length)
  }

  return { references, text }
}

export function serializeChatCapabilityMentions(
  references: Iterable<ChatCapabilityReference>,
  text: string
): string {
  const uniqueReferences: ChatCapabilityReference[] = []
  const seen = new Set<string>()

  for (const reference of references) {
    const key = `${reference.kind}:${reference.id}`
    if (seen.has(key)) continue
    seen.add(key)
    uniqueReferences.push(reference)
  }

  if (!uniqueReferences.length) return text

  const prefix = uniqueReferences.map((reference) => `/${reference.id}`).join(' ')
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

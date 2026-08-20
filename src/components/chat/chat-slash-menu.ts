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
}

export interface ChatSlashQuery {
  start: number
  end: number
  query: string
  signature: string
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
    replacement.endsWith(' ') && value[slashQuery.end] === ' ' ? slashQuery.end + 1 : slashQuery.end
  const nextValue = `${value.slice(0, slashQuery.start)}${replacement}${value.slice(suffixStart)}`
  return {
    value: nextValue,
    cursorPosition: slashQuery.start + replacement.length,
  }
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

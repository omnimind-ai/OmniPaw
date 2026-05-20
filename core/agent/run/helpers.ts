import type { ChatError, ProviderMessage, ProviderToolCall } from '@core/provider/base-provider'
import type { ChatMessagePart } from '@shared/types/chat'
import type { ProviderConfig, ProviderModel } from '@shared/types/provider'
import type { AgentTool } from '../tools/types'

export function appendTextPart(parts: ChatMessagePart[], text: string): void {
  const last = parts[parts.length - 1] as { type?: string; text?: string } | undefined
  if (last?.type === 'plain') {
    last.text = `${last.text ?? ''}${text}`
    return
  }
  parts.push({ type: 'plain', text })
}

export function clampMaxSteps(value?: number): number {
  if (!Number.isFinite(value)) {
    return 6
  }
  return Math.max(1, Math.min(Math.floor(value ?? 6), 12))
}

export function providerSupportsTools(provider: ProviderConfig, model: ProviderModel): boolean {
  if (
    provider.capabilities?.tools === false ||
    model.capabilities?.tools === false ||
    model.capabilities?.toolCall === false
  ) {
    return false
  }
  // OpenAI-compatible /models commonly returns only model IDs. In existing configs
  // supportsTools:false often means "unknown" rather than a verified model limit.
  return true
}

export function canRetryWithoutTools(
  chatError: ChatError,
  stepParts: ChatMessagePart[],
  stepToolCalls: ProviderToolCall[],
  sawFinal: boolean
): boolean {
  return (
    !sawFinal &&
    stepParts.length === 0 &&
    stepToolCalls.length === 0 &&
    isToolUnsupportedProviderError(chatError)
  )
}

export function parseArgumentsForDisplay(value: string): unknown {
  try {
    return value.trim() ? (JSON.parse(value) as unknown) : {}
  } catch {
    return value
  }
}

export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException('Run aborted.', 'AbortError')
  }
}

export function collectReasoningContent(parts: ChatMessagePart[]): string | undefined {
  const text = parts
    .filter((part): part is Extract<ChatMessagePart, { type: 'think' }> => part.type === 'think')
    .map((part) => part.think)
    .join('')
    .trim()
  return text || undefined
}

export function collectPlainContent(parts: ChatMessagePart[]): string | undefined {
  const text = parts
    .filter((part): part is Extract<ChatMessagePart, { type: 'plain' }> => part.type === 'plain')
    .map((part) => part.text)
    .join('')
    .trim()
  return text || undefined
}

export function injectToolInventory(
  messages: ProviderMessage[],
  tools: AgentTool[],
  supportsSystemRole: boolean
): ProviderMessage[] {
  const prompt = buildToolInventoryPrompt(tools)
  if (!prompt) {
    return [...messages]
  }

  if (supportsSystemRole) {
    const next = [...messages]
    const systemIndex = next.findIndex((message) => message.role === 'system')
    if (systemIndex >= 0) {
      const system = next[systemIndex]!
      next[systemIndex] = {
        ...system,
        content: appendTextContent(system.content, prompt),
      }
      return next
    }
    return [{ role: 'system', content: prompt }, ...next]
  }

  const next = [...messages]
  const userIndex = next.findIndex((message) => message.role === 'user')
  if (userIndex >= 0) {
    const user = next[userIndex]!
    next[userIndex] = {
      ...user,
      content: prependTextContent(user.content, prompt),
    }
    return next
  }

  return [{ role: 'user', content: prompt }, ...next]
}

function isToolUnsupportedProviderError(chatError: ChatError): boolean {
  const message = `${chatError.message} ${chatError.providerBodyPreview ?? ''}`.toLowerCase()
  if (message.includes('function calling is not enabled')) {
    return true
  }
  if (message.includes('tool') && hasUnsupportedCapabilityText(message)) {
    return true
  }
  if (message.includes('function') && hasUnsupportedCapabilityText(message)) {
    return true
  }
  return false
}

function hasUnsupportedCapabilityText(message: string): boolean {
  return (
    message.includes('support') ||
    message.includes('unsupported') ||
    message.includes('not enabled') ||
    message.includes('disabled')
  )
}

function buildToolInventoryPrompt(tools: AgentTool[]): string | undefined {
  if (!tools.length) {
    return undefined
  }

  const lines = tools.slice(0, 80).map((tool) => {
    const name = tool.providerName ?? tool.name
    const source =
      tool.source === 'mcp'
        ? `mcp${tool.serverName ? `:${sanitizeToolPromptText(tool.serverName, 80)}` : ''}`
        : tool.source
    const description = sanitizeToolPromptText(tool.description, 180)
    return `- ${name} [${source}]: ${description}`
  })

  const omittedCount = Math.max(0, tools.length - lines.length)
  if (omittedCount) {
    lines.push(`- ... ${omittedCount} additional tools omitted from this summary.`)
  }

  return [
    'Available tools for this chat run are listed below. Tool parameter schemas are provided separately through the tool API.',
    'If the user asks which MCP tools are available, answer from entries marked with [mcp] and use the exact tool names shown here.',
    'If no entries are marked [mcp], say that no MCP tools are currently available in this run.',
    ...lines,
  ].join('\n')
}

function appendTextContent(
  content: ProviderMessage['content'],
  text: string
): ProviderMessage['content'] {
  if (typeof content === 'string') {
    return content ? `${content}\n\n${text}` : text
  }
  return [...content, { type: 'text', text }]
}

function prependTextContent(
  content: ProviderMessage['content'],
  text: string
): ProviderMessage['content'] {
  if (typeof content === 'string') {
    return content ? `${text}\n\n${content}` : text
  }
  return [{ type: 'text', text }, ...content]
}

function sanitizeToolPromptText(value: string | undefined, maxLength: number): string {
  return (value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

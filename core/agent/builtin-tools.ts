import type { AttachmentService } from '@core/chat/attachment-service'
import type { ChatMessageRepo } from '@core/db/repos'
import type { SkillManager } from '@core/skill/skill-manager'
import type { AgentTool } from './tool'
import type { ToolProfile, ToolRisk } from './tool'

export interface BuiltinToolDefinition {
  name: string
  providerName?: string
  label: string
  description: string
  risk: ToolRisk
  source: 'builtin'
  profiles: ToolProfile[]
  parameters: Record<string, unknown>
}

export interface BuiltinToolOptions {
  messages: ChatMessageRepo
  attachments: AttachmentService
  sessionId: string
  skills?: SkillManager
  maxResultChars?: number
}

export function createBuiltinTools(options: BuiltinToolOptions): AgentTool[] {
  const tools: AgentTool[] = [
    { ...BUILTIN_TOOL_DEFINITIONS.system_time, execute: createSystemTimeExecutor() },
    { ...BUILTIN_TOOL_DEFINITIONS.calculator, execute: createCalculatorExecutor() },
    {
      ...BUILTIN_TOOL_DEFINITIONS.attachment_text_read,
      execute: createAttachmentTextReadExecutor(options),
    },
    {
      ...BUILTIN_TOOL_DEFINITIONS.attachment_text_search,
      execute: createAttachmentTextSearchExecutor(options),
    },
  ]
  if (options.skills?.getActiveSkills().length) {
    tools.push({
      ...BUILTIN_TOOL_DEFINITIONS.skill_read,
      execute: createSkillReadExecutor(options.skills),
    })
  }
  return tools
}

export function listBuiltinToolDefinitions(): BuiltinToolDefinition[] {
  return [
    BUILTIN_TOOL_DEFINITIONS.system_time,
    BUILTIN_TOOL_DEFINITIONS.calculator,
    BUILTIN_TOOL_DEFINITIONS.attachment_text_read,
    BUILTIN_TOOL_DEFINITIONS.attachment_text_search,
    BUILTIN_TOOL_DEFINITIONS.skill_read,
  ].map((definition) => ({ ...definition }))
}

const MINIMAL_PROFILES: ToolProfile[] = ['minimal', 'assistant', 'power']

const BUILTIN_TOOL_DEFINITIONS = {
  system_time: {
    name: 'system_time',
    label: 'System time',
    description: 'Get the current local time, timezone, and UTC offset.',
    risk: 'safe',
    source: 'builtin',
    profiles: MINIMAL_PROFILES,
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  calculator: {
    name: 'calculator',
    label: 'Calculator',
    description:
      'Evaluate basic arithmetic. Use expression for +, -, *, /, %, ^ and parentheses, or operation with numeric operands.',
    risk: 'safe',
    source: 'builtin',
    profiles: MINIMAL_PROFILES,
    parameters: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: 'Arithmetic expression using numbers, +, -, *, /, %, ^, and parentheses.',
        },
        operation: {
          type: 'string',
          enum: ['add', 'subtract', 'multiply', 'divide', 'power'],
        },
        operands: {
          type: 'array',
          items: { type: 'number' },
        },
      },
      additionalProperties: false,
    },
  },
  attachment_text_read: {
    name: 'attachment_text_read',
    label: 'Read attachment text',
    description: 'Read extracted text from attachments uploaded in the current chat session.',
    risk: 'read',
    source: 'builtin',
    profiles: MINIMAL_PROFILES,
    parameters: {
      type: 'object',
      properties: {
        attachmentId: { type: 'string' },
        attachmentIds: { type: 'array', items: { type: 'string' } },
        maxChars: { type: 'number' },
      },
      additionalProperties: false,
    },
  },
  attachment_text_search: {
    name: 'attachment_text_search',
    label: 'Search attachment text',
    description: 'Search extracted text from attachments uploaded in the current chat session.',
    risk: 'read',
    source: 'builtin',
    profiles: MINIMAL_PROFILES,
    parameters: {
      type: 'object',
      required: ['query'],
      properties: {
        query: { type: 'string' },
        maxResults: { type: 'number' },
        contextChars: { type: 'number' },
      },
      additionalProperties: false,
    },
  },
  skill_read: {
    name: 'skill_read',
    label: 'Read local skill',
    description: 'Read the SKILL.md instructions for an enabled local skill before applying it.',
    risk: 'read',
    source: 'builtin',
    profiles: MINIMAL_PROFILES,
    parameters: {
      type: 'object',
      required: ['skillId'],
      properties: {
        skillId: {
          type: 'string',
          description: 'The local skill id from the available skills inventory.',
        },
      },
      additionalProperties: false,
    },
  },
} satisfies Record<string, BuiltinToolDefinition>

function createSystemTimeExecutor(): AgentTool<Record<string, never>>['execute'] {
  return async () => {
    const now = new Date()
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const offsetMinutes = -now.getTimezoneOffset()
    const sign = offsetMinutes >= 0 ? '+' : '-'
    const absolute = Math.abs(offsetMinutes)
    const offset = `${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            iso: now.toISOString(),
            local: now.toLocaleString(),
            timeZone,
            utcOffset: offset,
          }),
        },
      ],
    }
  }
}

interface CalculatorArgs {
  expression?: string
  operation?: 'add' | 'subtract' | 'multiply' | 'divide' | 'power'
  operands?: number[]
}

function createCalculatorExecutor(): AgentTool<CalculatorArgs>['execute'] {
  return async (_toolCallId, args) => {
    const value = calculate(args)
    return {
      content: [{ type: 'text', text: JSON.stringify({ result: value }) }],
    }
  }
}

interface AttachmentReadArgs {
  attachmentId?: string
  attachmentIds?: string[]
  maxChars?: number
}

function createAttachmentTextReadExecutor(
  options: BuiltinToolOptions
): AgentTool<AttachmentReadArgs>['execute'] {
  return async (_toolCallId, args, signal) => {
    throwIfAborted(signal)
    const ids = [
      ...new Set([args.attachmentId, ...(args.attachmentIds ?? [])].filter(isNonEmptyString)),
    ]
    if (!ids.length) {
      throw new Error('attachment_text_read requires attachmentId or attachmentIds.')
    }
    const allowed = currentSessionAttachmentIds(options)
    const maxChars = clampMaxChars(args.maxChars, options.maxResultChars)
    const blocks: string[] = []
    for (const id of ids) {
      throwIfAborted(signal)
      if (!allowed.has(id)) {
        throw new Error(`Attachment is not available in the current session: ${id}`)
      }
      const attachment = options.attachments.get(id)
      if (!attachment) {
        throw new Error(`Attachment not found: ${id}`)
      }
      if (attachment.extractedTextStatus !== 'complete' || !attachment.extractedText) {
        throw new Error(`Attachment does not have extracted text: ${attachment.originalName}`)
      }
      blocks.push(
        formatAttachmentBlock(
          attachment.originalName,
          truncateText(attachment.extractedText, maxChars)
        )
      )
    }
    return { content: [{ type: 'text', text: blocks.join('\n\n') }] }
  }
}

interface AttachmentSearchArgs {
  query?: string
  maxResults?: number
  contextChars?: number
}

function createAttachmentTextSearchExecutor(
  options: BuiltinToolOptions
): AgentTool<AttachmentSearchArgs>['execute'] {
  return async (_toolCallId, args, signal) => {
    throwIfAborted(signal)
    const query = args.query?.trim()
    if (!query) {
      throw new Error('attachment_text_search requires query.')
    }
    const maxResults = Math.max(1, Math.min(Math.floor(args.maxResults ?? 8), 20))
    const contextChars = Math.max(20, Math.min(Math.floor(args.contextChars ?? 120), 500))
    const allowed = currentSessionAttachmentIds(options)
    const matches: Array<{
      attachmentId: string
      filename: string
      snippet: string
      index: number
    }> = []
    const needle = query.toLowerCase()

    for (const id of allowed) {
      throwIfAborted(signal)
      const attachment = options.attachments.get(id)
      if (attachment?.extractedTextStatus !== 'complete' || !attachment.extractedText) {
        continue
      }
      const haystack = attachment.extractedText.toLowerCase()
      let from = 0
      while (matches.length < maxResults) {
        const index = haystack.indexOf(needle, from)
        if (index === -1) break
        matches.push({
          attachmentId: id,
          filename: attachment.originalName,
          index,
          snippet: makeSnippet(attachment.extractedText, index, query.length, contextChars),
        })
        from = index + Math.max(needle.length, 1)
      }
      if (matches.length >= maxResults) {
        break
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            query,
            matchCount: matches.length,
            matches,
          }),
        },
      ],
    }
  }
}

interface SkillReadArgs {
  skillId?: string
}

function createSkillReadExecutor(skills: SkillManager): AgentTool<SkillReadArgs>['execute'] {
  return async (_toolCallId, args, signal) => {
    throwIfAborted(signal)
    const skillId = args.skillId?.trim()
    if (!skillId) {
      throw new Error('skill_read requires skillId.')
    }
    const result = skills.readEnabledSkillContent(skillId)
    return {
      content: [
        {
          type: 'text',
          text: `<skill id="${escapeXml(result.skillId)}" name="${escapeXml(result.name)}">\n${result.content}\n</skill>`,
        },
      ],
    }
  }
}

function currentSessionAttachmentIds(options: BuiltinToolOptions): Set<string> {
  const ids = new Set<string>()
  const messages = options.messages.listBySession(options.sessionId)
  for (const message of messages) {
    if (message.status === 'deleted' || message.status === 'superseded') {
      continue
    }
    for (const link of options.messages.listAttachmentLinks(message.id)) {
      ids.add(link.attachmentId)
    }
  }
  return ids
}

function calculate(args: CalculatorArgs): number {
  if (typeof args.expression === 'string' && args.expression.trim()) {
    return evaluateExpression(args.expression)
  }

  const operands = args.operands
  if (
    !args.operation ||
    !Array.isArray(operands) ||
    !operands.length ||
    !operands.every(Number.isFinite)
  ) {
    throw new Error('calculator requires expression or operation with numeric operands.')
  }

  if (args.operation === 'add') return operands.reduce((sum, item) => sum + item, 0)
  if (args.operation === 'subtract')
    return operands.slice(1).reduce((value, item) => value - item, operands[0] ?? 0)
  if (args.operation === 'multiply') return operands.reduce((value, item) => value * item, 1)
  if (args.operation === 'divide')
    return operands.slice(1).reduce((value, item) => value / item, operands[0] ?? 0)
  if (args.operation === 'power') {
    if (operands.length !== 2) {
      throw new Error('power operation requires exactly two operands.')
    }
    return operands[0] ** operands[1]
  }

  throw new Error(`Unsupported operation: ${args.operation}`)
}

function evaluateExpression(expression: string): number {
  if (!/^[\d\s+\-*/%^().]+$/.test(expression)) {
    throw new Error('Expression contains unsupported characters.')
  }
  const parser = new ArithmeticParser(expression)
  const value = parser.parse()
  if (!Number.isFinite(value)) {
    throw new Error('Calculation result is not finite.')
  }
  return value
}

class ArithmeticParser {
  private index = 0

  constructor(private readonly input: string) {}

  parse(): number {
    const value = this.parseExpression()
    this.skipWhitespace()
    if (this.index < this.input.length) {
      throw new Error(`Unexpected token at ${this.index}.`)
    }
    return value
  }

  private parseExpression(): number {
    let value = this.parseTerm()
    while (true) {
      this.skipWhitespace()
      if (this.consume('+')) value += this.parseTerm()
      else if (this.consume('-')) value -= this.parseTerm()
      else return value
    }
  }

  private parseTerm(): number {
    let value = this.parsePower()
    while (true) {
      this.skipWhitespace()
      if (this.consume('*')) value *= this.parsePower()
      else if (this.consume('/')) value /= this.parsePower()
      else if (this.consume('%')) value %= this.parsePower()
      else return value
    }
  }

  private parsePower(): number {
    let value = this.parseUnary()
    this.skipWhitespace()
    if (this.consume('^')) {
      value **= this.parsePower()
    }
    return value
  }

  private parseUnary(): number {
    this.skipWhitespace()
    if (this.consume('+')) return this.parseUnary()
    if (this.consume('-')) return -this.parseUnary()
    return this.parsePrimary()
  }

  private parsePrimary(): number {
    this.skipWhitespace()
    if (this.consume('(')) {
      const value = this.parseExpression()
      if (!this.consume(')')) {
        throw new Error('Missing closing parenthesis.')
      }
      return value
    }

    const start = this.index
    while (this.index < this.input.length && /[\d.]/.test(this.input[this.index] ?? '')) {
      this.index += 1
    }
    if (start === this.index) {
      throw new Error(`Expected number at ${this.index}.`)
    }
    const value = Number(this.input.slice(start, this.index))
    if (!Number.isFinite(value)) {
      throw new Error(`Invalid number at ${start}.`)
    }
    return value
  }

  private consume(char: string): boolean {
    this.skipWhitespace()
    if (this.input[this.index] !== char) {
      return false
    }
    this.index += 1
    return true
  }

  private skipWhitespace(): void {
    while (/\s/.test(this.input[this.index] ?? '')) {
      this.index += 1
    }
  }
}

function clampMaxChars(value: number | undefined, fallback = 12_000): number {
  if (!Number.isFinite(value)) {
    return fallback
  }
  return Math.max(500, Math.min(Math.floor(value ?? fallback), fallback))
}

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text
  }
  return `${text.slice(0, maxChars)}\n[truncated ${text.length - maxChars} chars]`
}

function formatAttachmentBlock(filename: string, text: string): string {
  return `<attachment name="${escapeAttribute(filename)}">\n${text}\n</attachment>`
}

function makeSnippet(text: string, index: number, length: number, contextChars: number): string {
  const start = Math.max(0, index - contextChars)
  const end = Math.min(text.length, index + length + contextChars)
  return `${start > 0 ? '...' : ''}${text.slice(start, end)}${end < text.length ? '...' : ''}`
}

function escapeXml(value: string): string {
  return value.replace(
    /[&<>"]/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
      })[char] ?? char
  )
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function escapeAttribute(value: string): string {
  return value.replace(
    /["&<>]/g,
    (char) =>
      ({
        '"': '&quot;',
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
      })[char] ?? char
  )
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Tool execution aborted.', 'AbortError')
  }
}

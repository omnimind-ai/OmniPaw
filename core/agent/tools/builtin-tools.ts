import { createHash } from 'node:crypto'
import type { TerminalExecRequest, TerminalService } from '@core/agent/terminal'
import type { AgentWorkspaceService } from '@core/agent/workspace'
import type { AttachmentService } from '@core/chat/attachment-service'
import type { CronManager } from '@core/cron/cron-manager'
import type { ChatMessageRepo } from '@core/db/repos'
import type { CompanionMemoryService } from '@core/memory/service'
import type { ObservationManager } from '@core/observation'
import { ATTACHMENT_PROMPTS, SKILL_PROMPTS } from '@core/prompts'
import type { SkillManager } from '@core/skill/skill-manager'
import type {
  CompanionMemoryKind,
  CompanionMemoryProposalKind,
  CompanionMemoryScope,
} from '@shared/types/memory'
import type { DesktopToolSettings } from '@shared/types/settings'
import { BUILTIN_TOOL_CATALOG, BUILTIN_TOOL_ORDER, type BuiltinToolDefinition } from './catalog'
import type { ToolPolicy } from './policy'
import type { AgentTool, ToolProfile, ToolRisk } from './types'

export interface BuiltinToolOptions {
  messages: ChatMessageRepo
  attachments: AttachmentService
  sessionId: string
  memoryService?: CompanionMemoryService
  skills?: SkillManager
  cronManager?: CronManager
  observationManager?: ObservationManager
  policy?: ToolPolicy
  workspaceService?: AgentWorkspaceService
  terminalService?: TerminalService
  toolSettings?: () => DesktopToolSettings
  maxResultChars?: number
}

export function createBuiltinTools(options: BuiltinToolOptions): AgentTool[] {
  const tools: AgentTool[] = [
    { ...BUILTIN_TOOL_CATALOG.system_time, execute: createSystemTimeExecutor() },
    { ...BUILTIN_TOOL_CATALOG.calculator, execute: createCalculatorExecutor() },
    {
      ...BUILTIN_TOOL_CATALOG.attachment_text_read,
      execute: createAttachmentTextReadExecutor(options),
    },
    {
      ...BUILTIN_TOOL_CATALOG.attachment_text_search,
      execute: createAttachmentTextSearchExecutor(options),
    },
  ]
  if (options.memoryService?.canSearchForSession(options.sessionId)) {
    tools.push({
      ...BUILTIN_TOOL_CATALOG.memory_search,
      execute: createMemorySearchExecutor(options),
    })
  }
  if (options.memoryService?.canWriteForSession(options.sessionId)) {
    tools.push(
      {
        ...BUILTIN_TOOL_CATALOG.memory_create,
        requiresApproval: () => false,
        execute: createMemoryCreateExecutor(options),
      },
      {
        ...BUILTIN_TOOL_CATALOG.memory_update_proposal,
        requiresApproval: () => false,
        execute: createMemoryUpdateProposalExecutor(options),
      },
      {
        ...BUILTIN_TOOL_CATALOG.memory_forget_proposal,
        requiresApproval: () => false,
        execute: createMemoryForgetProposalExecutor(options),
      }
    )
  }
  if (options.cronManager) {
    tools.push({
      ...BUILTIN_TOOL_CATALOG.future_task,
      execute: createFutureTaskExecutor(options),
    })
  }
  if (options.observationManager) {
    tools.push({
      ...BUILTIN_TOOL_CATALOG.screen_observe,
      execute: createScreenObserveExecutor(options),
    })
  }
  if (options.workspaceService) {
    tools.push({
      ...BUILTIN_TOOL_CATALOG.workspace_file,
      localCapability: {
        kind: 'workspace',
      },
      resolveRisk: resolveWorkspaceFileRisk,
      approvalPlan: createWorkspaceFileApprovalPlan,
      execute: createWorkspaceFileExecutor(options),
    })
  }
  if (options.terminalService) {
    tools.push({
      ...BUILTIN_TOOL_CATALOG.terminal_exec,
      localCapability: {
        kind: 'terminal',
        fullAccess: options.policy?.profile === 'power',
      },
      resolveRisk: () => 'exec',
      resolveTimeoutMs: (args) => {
        const terminalArgs = asTerminalExecArgs(args)
        const settings = options.toolSettings?.().terminal
        if (terminalArgs.background) return 5_000
        return Math.min(
          (terminalArgs.timeoutMs ?? settings?.timeoutMs ?? 30_000) + 1_000,
          24 * 60 * 60 * 1000
        )
      },
      approvalPlan: async (args, context) =>
        options.terminalService?.createApprovalPlan(
          toTerminalRequest(args, options, context.policyProfile, context.runId)
        ),
      execute: createTerminalExecExecutor(options),
    })
  }
  if (options.skills?.getActiveSkills().length) {
    tools.push({
      ...BUILTIN_TOOL_CATALOG.skill_read,
      execute: createSkillReadExecutor(options.skills),
    })
  }
  return tools
}

export function listBuiltinToolDefinitions(): BuiltinToolDefinition[] {
  return BUILTIN_TOOL_ORDER.map((name) => ({ ...BUILTIN_TOOL_CATALOG[name] }))
}

function createSystemTimeExecutor(): AgentTool['execute'] {
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

function createCalculatorExecutor(): AgentTool['execute'] {
  return async (_toolCallId, args) => {
    const value = calculate(asCalculatorArgs(args))
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

function createAttachmentTextReadExecutor(options: BuiltinToolOptions): AgentTool['execute'] {
  return async (_toolCallId, args, signal) => {
    throwIfAborted(signal)
    const readArgs = asAttachmentReadArgs(args)
    const ids = [
      ...new Set(
        [readArgs.attachmentId, ...(readArgs.attachmentIds ?? [])].filter(isNonEmptyString)
      ),
    ]
    if (!ids.length) {
      throw new Error('attachment_text_read requires attachmentId or attachmentIds.')
    }
    const allowed = currentSessionAttachmentIds(options)
    const maxChars = clampMaxChars(readArgs.maxChars, options.maxResultChars)
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

function createAttachmentTextSearchExecutor(options: BuiltinToolOptions): AgentTool['execute'] {
  return async (_toolCallId, args, signal) => {
    throwIfAborted(signal)
    const searchArgs = asAttachmentSearchArgs(args)
    const query = searchArgs.query?.trim()
    if (!query) {
      throw new Error('attachment_text_search requires query.')
    }
    const maxResults = Math.max(1, Math.min(Math.floor(searchArgs.maxResults ?? 8), 20))
    const contextChars = Math.max(20, Math.min(Math.floor(searchArgs.contextChars ?? 120), 500))
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

interface MemorySearchArgs {
  mode?: 'search' | 'overview'
  query?: string
  limit?: number
  kinds?: CompanionMemoryKind[]
  scopes?: CompanionMemoryScope[]
  minConfidence?: number
  sessionOnly?: boolean
}

interface MemoryCreateArgs {
  content?: string
  kind?: CompanionMemoryKind
  scope?: CompanionMemoryScope
  subject?: string
  importance?: number
  confidence?: number
}

interface MemoryUpdateProposalArgs {
  memoryId?: string
  relatedMemoryId?: string
  kind?: Exclude<CompanionMemoryProposalKind, 'delete'>
  proposedContent?: string
  reason?: string
  confidence?: number
}

interface MemoryForgetProposalArgs {
  memoryId?: string
  action?: 'archive' | 'delete'
  reason?: string
  confidence?: number
}

function createMemorySearchExecutor(options: BuiltinToolOptions): AgentTool['execute'] {
  return async (_toolCallId, args, signal) => {
    throwIfAborted(signal)
    if (!options.memoryService) {
      throw new Error('Companion memory search is not available.')
    }
    const searchArgs = asMemorySearchArgs(args)
    const query = searchArgs.query?.trim()
    const response = await options.memoryService.searchForTool({
      sessionId: options.sessionId,
      mode: searchArgs.mode,
      query,
      limit: searchArgs.limit,
      kinds: searchArgs.kinds,
      scopes: searchArgs.scopes,
      minConfidence: searchArgs.minConfidence,
      sessionOnly: searchArgs.sessionOnly,
    })
    return jsonToolResult({
      ...response,
      results: response.results.map((item) => ({
        ...item,
        content: truncateText(item.content, 1200),
      })),
    })
  }
}

function createMemoryCreateExecutor(options: BuiltinToolOptions): AgentTool['execute'] {
  return async (_toolCallId, args, signal, _onUpdate, context) => {
    throwIfAborted(signal)
    if (!options.memoryService) {
      throw new Error('Companion memory writing is not available.')
    }
    const writeArgs = asMemoryCreateArgs(args)
    const content = writeArgs.content?.trim()
    if (!content) {
      throw new Error('memory_create requires content.')
    }
    const sourceMessageIds = latestUserMessageIds(options)
    const memory = options.memoryService.createForSession(options.sessionId, {
      kind: writeArgs.kind ?? 'fact',
      scope: writeArgs.scope ?? 'user',
      content,
      subject: writeArgs.subject,
      importance: writeArgs.importance,
      confidence: writeArgs.confidence ?? 1,
      sessionId: options.sessionId,
      sourceRunId: context?.runId,
      observedAt: Date.now(),
      metadata: {
        extractor: 'tool',
        attributedTo: 'user-stated',
      },
      sources: [
        {
          sourceKind: 'manual-intent',
          sessionId: options.sessionId,
          runId: context?.runId,
          messageIds: sourceMessageIds,
          sourceRole: sourceMessageIds.length ? 'user' : undefined,
          evidenceHash: hashToolEvidence(context?.runId ?? options.sessionId, sourceMessageIds),
          sourceCreatedAt: Date.now(),
          metadata: {
            toolName: 'memory_create',
          },
        },
      ],
    })
    return jsonToolResult({
      ok: true,
      action: 'create',
      memoryId: memory.id,
      status: memory.status,
      kind: memory.kind,
    })
  }
}

function createMemoryUpdateProposalExecutor(options: BuiltinToolOptions): AgentTool['execute'] {
  return async (_toolCallId, args, signal, _onUpdate, context) => {
    throwIfAborted(signal)
    if (!options.memoryService) {
      throw new Error('Companion memory writing is not available.')
    }
    const proposalArgs = asMemoryUpdateProposalArgs(args)
    if (!proposalArgs.memoryId?.trim() || !proposalArgs.reason?.trim()) {
      throw new Error('memory_update_proposal requires memoryId and reason.')
    }
    const proposal = options.memoryService.createProposal({
      kind: proposalArgs.kind ?? 'review',
      memoryId: proposalArgs.memoryId,
      relatedMemoryId: proposalArgs.relatedMemoryId,
      proposedContent: proposalArgs.proposedContent,
      reason: proposalArgs.reason,
      confidence: proposalArgs.confidence,
      source: 'tool',
      runId: context?.runId,
      metadata: { toolName: 'memory_update_proposal' },
    })
    return jsonToolResult({
      ok: true,
      action: 'proposal',
      proposalId: proposal.id,
      status: proposal.status,
      kind: proposal.kind,
    })
  }
}

function createMemoryForgetProposalExecutor(options: BuiltinToolOptions): AgentTool['execute'] {
  return async (_toolCallId, args, signal, _onUpdate, context) => {
    throwIfAborted(signal)
    if (!options.memoryService) {
      throw new Error('Companion memory writing is not available.')
    }
    const proposalArgs = asMemoryForgetProposalArgs(args)
    if (!proposalArgs.memoryId?.trim() || !proposalArgs.reason?.trim()) {
      throw new Error('memory_forget_proposal requires memoryId and reason.')
    }
    const settings = options.memoryService.getSettings()
    if (!settings.destructiveToolRequiresConfirmation && proposalArgs.action === 'archive') {
      const archived = options.memoryService.archive(proposalArgs.memoryId)
      return jsonToolResult({
        ok: Boolean(archived),
        action: 'archive',
        memoryId: proposalArgs.memoryId,
        status: archived?.status ?? 'not_found',
      })
    }
    const proposal = options.memoryService.createProposal({
      kind: proposalArgs.action ?? 'archive',
      memoryId: proposalArgs.memoryId,
      reason: proposalArgs.reason,
      confidence: proposalArgs.confidence,
      source: 'tool',
      runId: context?.runId,
      metadata: { toolName: 'memory_forget_proposal' },
    })
    return jsonToolResult({
      ok: true,
      action: 'proposal',
      proposalId: proposal.id,
      status: proposal.status,
      kind: proposal.kind,
    })
  }
}

interface SkillReadArgs {
  skillId?: string
}

function createSkillReadExecutor(skills: SkillManager): AgentTool['execute'] {
  return async (_toolCallId, args, signal) => {
    throwIfAborted(signal)
    const skillId = asSkillReadArgs(args).skillId?.trim()
    if (!skillId) {
      throw new Error('skill_read requires skillId.')
    }
    const result = skills.readEnabledSkillContent(skillId)
    return {
      content: [
        {
          type: 'text',
          text: SKILL_PROMPTS.contentBlock({
            skillId: result.skillId,
            name: result.name,
            content: result.content,
          }),
        },
      ],
    }
  }
}

interface FutureTaskArgs {
  action?: 'create' | 'edit' | 'delete' | 'list'
  taskId?: string
  name?: string
  note?: string
  runAt?: string | number
  cronExpression?: string
  enabled?: boolean
}

interface WorkspaceFileArgs {
  action?: 'list' | 'read' | 'write' | 'search' | 'patch'
  path?: string
  recursive?: boolean
  maxEntries?: number
  maxBytes?: number
  content?: string
  append?: boolean
  query?: string
  maxResults?: number
  contextChars?: number
  oldText?: string
  newText?: string
  replaceAll?: boolean
}

interface TerminalExecArgs {
  command?: string
  cwd?: string
  timeoutMs?: number
  maxOutputChars?: number
  background?: boolean
  pty?: boolean
  env?: Record<string, string>
  network?: 'ask' | 'allow' | 'deny'
}

function createFutureTaskExecutor(options: BuiltinToolOptions): AgentTool['execute'] {
  return async (_toolCallId, args, signal) => {
    throwIfAborted(signal)
    if (!options.cronManager) {
      return futureTaskError('unavailable', 'Scheduled task management is not available.')
    }
    const taskArgs = asFutureTaskArgs(args)
    if (taskArgs.action === 'list') {
      const response = options.cronManager.list({ sessionId: options.sessionId })
      return futureTaskResult({
        ok: true,
        action: 'list',
        tasks: response.tasks.map(summarizeCronTaskForTool),
      })
    }
    if (taskArgs.action === 'create') {
      if (!taskArgs.name?.trim() || !taskArgs.note?.trim()) {
        return futureTaskError('validation', 'create requires name and note.')
      }
      const response = options.cronManager.create({
        name: taskArgs.name,
        note: taskArgs.note,
        sourceSessionId: options.sessionId,
        targetSessionId: options.sessionId,
        runAt: parseToolRunAt(taskArgs.runAt),
        cronExpression: taskArgs.cronExpression,
        enabled: taskArgs.enabled,
      })
      return futureTaskResult({
        ok: true,
        action: 'create',
        task: summarizeCronTaskForTool(response.task),
      })
    }
    if (taskArgs.action === 'edit') {
      if (!taskArgs.taskId?.trim()) {
        return futureTaskError('validation', 'edit requires taskId.')
      }
      const response = options.cronManager.update({
        taskId: taskArgs.taskId,
        sessionId: options.sessionId,
        name: taskArgs.name,
        note: taskArgs.note,
        runAt: taskArgs.runAt === undefined ? undefined : parseToolRunAt(taskArgs.runAt),
        cronExpression: taskArgs.cronExpression,
        enabled: taskArgs.enabled,
      })
      return futureTaskResult({
        ok: true,
        action: 'edit',
        task: summarizeCronTaskForTool(response.task),
      })
    }
    if (taskArgs.action === 'delete') {
      if (!taskArgs.taskId?.trim()) {
        return futureTaskError('validation', 'delete requires taskId.')
      }
      const response = options.cronManager.delete({
        taskId: taskArgs.taskId,
        sessionId: options.sessionId,
      })
      return futureTaskResult({
        ok: response.deleted,
        action: 'delete',
        taskId: taskArgs.taskId,
      })
    }
    return futureTaskError('unsupported_action', 'action must be create, edit, delete, or list.')
  }
}

function createScreenObserveExecutor(options: BuiltinToolOptions): AgentTool['execute'] {
  return async (_toolCallId, _args, signal) => {
    throwIfAborted(signal)
    if (!options.observationManager) {
      throw new Error('Screen observation is not available.')
    }
    const result = await options.observationManager.captureForTool(options.sessionId)
    return jsonToolResult(result)
  }
}

function createWorkspaceFileExecutor(options: BuiltinToolOptions): AgentTool['execute'] {
  return async (_toolCallId, args, signal) => {
    throwIfAborted(signal)
    if (!options.workspaceService) {
      throw new Error('Workspace file service is not available.')
    }
    const workspaceArgs = asWorkspaceFileArgs(args)
    if (workspaceArgs.action === 'list') {
      const response = await options.workspaceService.listFiles({
        sessionId: options.sessionId,
        path: workspaceArgs.path,
        recursive: workspaceArgs.recursive,
        maxEntries: workspaceArgs.maxEntries,
      })
      return jsonToolResult(response)
    }
    if (workspaceArgs.action === 'read') {
      if (!workspaceArgs.path) throw new Error('workspace_file read requires path.')
      const response = await options.workspaceService.readFile({
        sessionId: options.sessionId,
        path: workspaceArgs.path,
        maxBytes: Math.min(
          workspaceArgs.maxBytes ?? options.toolSettings?.().workspace.maxToolResultChars ?? 20_000,
          options.toolSettings?.().workspace.maxToolResultChars ?? 20_000
        ),
      })
      return jsonToolResult(response)
    }
    if (workspaceArgs.action === 'write') {
      if (!workspaceArgs.path) throw new Error('workspace_file write requires path.')
      const entry = await options.workspaceService.writeFile({
        sessionId: options.sessionId,
        path: workspaceArgs.path,
        content: workspaceArgs.content ?? '',
        append: workspaceArgs.append,
      })
      return jsonToolResult({ ok: true, action: 'write', entry })
    }
    if (workspaceArgs.action === 'search') {
      if (!workspaceArgs.query) throw new Error('workspace_file search requires query.')
      const response = await options.workspaceService.searchFiles({
        sessionId: options.sessionId,
        query: workspaceArgs.query,
        path: workspaceArgs.path,
        maxResults: workspaceArgs.maxResults,
        contextChars: workspaceArgs.contextChars,
      })
      return jsonToolResult(response)
    }
    if (workspaceArgs.action === 'patch') {
      if (!workspaceArgs.path) throw new Error('workspace_file patch requires path.')
      const entry = await options.workspaceService.patchFile({
        sessionId: options.sessionId,
        path: workspaceArgs.path,
        oldText: workspaceArgs.oldText,
        newText: workspaceArgs.newText,
        replaceAll: workspaceArgs.replaceAll,
      })
      return jsonToolResult({ ok: true, action: 'patch', entry })
    }
    throw new Error('workspace_file action must be list, read, write, search, or patch.')
  }
}

function createTerminalExecExecutor(options: BuiltinToolOptions): AgentTool['execute'] {
  return async (toolCallId, args, signal, _onUpdate, context) => {
    if (!options.terminalService) {
      throw new Error('Terminal service is not available.')
    }
    const response = await options.terminalService.execute(
      toTerminalRequest(args, options, context?.policyProfile ?? 'assistant', context?.runId, {
        toolCallId,
        signal,
      })
    )
    return jsonToolResult({
      status: response.process.status,
      processId: response.process.id,
      exitCode: response.exitCode,
      signal: response.signal,
      timedOut: response.timedOut,
      aborted: response.aborted,
      truncated: response.truncated,
      stdout: response.stdout,
      stderr: response.stderr,
      fullAccess: response.plan.fullAccess,
      background: response.plan.background,
    })
  }
}

function resolveWorkspaceFileRisk(args: unknown): ToolRisk {
  const action = asWorkspaceFileArgs(args).action
  return action === 'write' || action === 'patch' ? 'write' : 'read'
}

function createWorkspaceFileApprovalPlan(args: unknown) {
  const workspaceArgs = asWorkspaceFileArgs(args)
  if (workspaceArgs.action !== 'write' && workspaceArgs.action !== 'patch') {
    return undefined
  }
  return {
    kind: 'workspace' as const,
    action: workspaceArgs.action,
    targetPath: workspaceArgs.path ?? '',
    scope: 'managed-workspace' as const,
    sizeBytes:
      workspaceArgs.action === 'write'
        ? Buffer.byteLength(workspaceArgs.content ?? '', 'utf8')
        : undefined,
    writeScope: workspaceArgs.action === 'patch' ? 'replace text range' : 'file content',
  }
}

function asRecord(value: unknown, toolName: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${toolName} arguments must be an object.`)
  }
  return value as Record<string, unknown>
}

function asCalculatorArgs(value: unknown): CalculatorArgs {
  const args = asRecord(value, 'calculator')
  return {
    expression: typeof args.expression === 'string' ? args.expression : undefined,
    operation: isCalculatorOperation(args.operation) ? args.operation : undefined,
    operands: Array.isArray(args.operands) ? args.operands.filter(isFiniteNumber) : undefined,
  }
}

function asAttachmentReadArgs(value: unknown): AttachmentReadArgs {
  const args = asRecord(value, 'attachment_text_read')
  return {
    attachmentId: typeof args.attachmentId === 'string' ? args.attachmentId : undefined,
    attachmentIds: Array.isArray(args.attachmentIds)
      ? args.attachmentIds.filter(isNonEmptyString)
      : undefined,
    maxChars: isFiniteNumber(args.maxChars) ? args.maxChars : undefined,
  }
}

function asAttachmentSearchArgs(value: unknown): AttachmentSearchArgs {
  const args = asRecord(value, 'attachment_text_search')
  return {
    query: typeof args.query === 'string' ? args.query : undefined,
    maxResults: isFiniteNumber(args.maxResults) ? args.maxResults : undefined,
    contextChars: isFiniteNumber(args.contextChars) ? args.contextChars : undefined,
  }
}

function asMemorySearchArgs(value: unknown): MemorySearchArgs {
  const args = asRecord(value, 'memory_search')
  return {
    mode:
      args.mode === 'search' || args.mode === 'overview'
        ? args.mode
        : typeof args.query === 'string' && args.query.trim()
          ? 'search'
          : 'overview',
    query: typeof args.query === 'string' ? args.query : undefined,
    limit: isFiniteNumber(args.limit) ? args.limit : undefined,
    kinds: Array.isArray(args.kinds) ? args.kinds.filter(isMemoryKind) : undefined,
    scopes: Array.isArray(args.scopes) ? args.scopes.filter(isMemoryScope) : undefined,
    minConfidence: isFiniteNumber(args.minConfidence) ? args.minConfidence : undefined,
    sessionOnly: typeof args.sessionOnly === 'boolean' ? args.sessionOnly : undefined,
  }
}

function asMemoryCreateArgs(value: unknown): MemoryCreateArgs {
  const args = asRecord(value, 'memory_create')
  return {
    content: typeof args.content === 'string' ? args.content : undefined,
    kind: isMemoryKind(args.kind) ? args.kind : undefined,
    scope: isMemoryScope(args.scope) ? args.scope : undefined,
    subject: typeof args.subject === 'string' ? args.subject : undefined,
    importance: isFiniteNumber(args.importance) ? clampNumber(args.importance, 1, 5) : undefined,
    confidence: isFiniteNumber(args.confidence) ? clampNumber(args.confidence, 0, 1) : undefined,
  }
}

function asMemoryUpdateProposalArgs(value: unknown): MemoryUpdateProposalArgs {
  const args = asRecord(value, 'memory_update_proposal')
  return {
    memoryId: typeof args.memoryId === 'string' ? args.memoryId : undefined,
    relatedMemoryId: typeof args.relatedMemoryId === 'string' ? args.relatedMemoryId : undefined,
    kind:
      args.kind === 'update' ||
      args.kind === 'merge' ||
      args.kind === 'archive' ||
      args.kind === 'review'
        ? args.kind
        : undefined,
    proposedContent: typeof args.proposedContent === 'string' ? args.proposedContent : undefined,
    reason: typeof args.reason === 'string' ? args.reason : undefined,
    confidence: isFiniteNumber(args.confidence) ? clampNumber(args.confidence, 0, 1) : undefined,
  }
}

function asMemoryForgetProposalArgs(value: unknown): MemoryForgetProposalArgs {
  const args = asRecord(value, 'memory_forget_proposal')
  return {
    memoryId: typeof args.memoryId === 'string' ? args.memoryId : undefined,
    action: args.action === 'delete' ? 'delete' : 'archive',
    reason: typeof args.reason === 'string' ? args.reason : undefined,
    confidence: isFiniteNumber(args.confidence) ? clampNumber(args.confidence, 0, 1) : undefined,
  }
}

function asSkillReadArgs(value: unknown): SkillReadArgs {
  const args = asRecord(value, 'skill_read')
  return {
    skillId: typeof args.skillId === 'string' ? args.skillId : undefined,
  }
}

function asFutureTaskArgs(value: unknown): FutureTaskArgs {
  const args = asRecord(value, 'future_task')
  return {
    action:
      args.action === 'create' ||
      args.action === 'edit' ||
      args.action === 'delete' ||
      args.action === 'list'
        ? args.action
        : undefined,
    taskId: typeof args.taskId === 'string' ? args.taskId : undefined,
    name: typeof args.name === 'string' ? args.name : undefined,
    note: typeof args.note === 'string' ? args.note : undefined,
    runAt:
      typeof args.runAt === 'string' || typeof args.runAt === 'number' ? args.runAt : undefined,
    cronExpression: typeof args.cronExpression === 'string' ? args.cronExpression : undefined,
    enabled: typeof args.enabled === 'boolean' ? args.enabled : undefined,
  }
}

function asWorkspaceFileArgs(value: unknown): WorkspaceFileArgs {
  const args = asRecord(value, 'workspace_file')
  return {
    action:
      args.action === 'list' ||
      args.action === 'read' ||
      args.action === 'write' ||
      args.action === 'search' ||
      args.action === 'patch'
        ? args.action
        : undefined,
    path: typeof args.path === 'string' ? args.path : undefined,
    recursive: typeof args.recursive === 'boolean' ? args.recursive : undefined,
    maxEntries: isFiniteNumber(args.maxEntries) ? args.maxEntries : undefined,
    maxBytes: isFiniteNumber(args.maxBytes) ? args.maxBytes : undefined,
    content: typeof args.content === 'string' ? args.content : undefined,
    append: typeof args.append === 'boolean' ? args.append : undefined,
    query: typeof args.query === 'string' ? args.query : undefined,
    maxResults: isFiniteNumber(args.maxResults) ? args.maxResults : undefined,
    contextChars: isFiniteNumber(args.contextChars) ? args.contextChars : undefined,
    oldText: typeof args.oldText === 'string' ? args.oldText : undefined,
    newText: typeof args.newText === 'string' ? args.newText : undefined,
    replaceAll: typeof args.replaceAll === 'boolean' ? args.replaceAll : undefined,
  }
}

function asTerminalExecArgs(value: unknown): TerminalExecArgs {
  const args = asRecord(value, 'terminal_exec')
  const env = isStringRecord(args.env) ? args.env : undefined
  return {
    command: typeof args.command === 'string' ? args.command : undefined,
    cwd: typeof args.cwd === 'string' ? args.cwd : undefined,
    timeoutMs: isFiniteNumber(args.timeoutMs) ? args.timeoutMs : undefined,
    maxOutputChars: isFiniteNumber(args.maxOutputChars) ? args.maxOutputChars : undefined,
    background: typeof args.background === 'boolean' ? args.background : undefined,
    pty: typeof args.pty === 'boolean' ? args.pty : undefined,
    env,
    network:
      args.network === 'ask' || args.network === 'allow' || args.network === 'deny'
        ? args.network
        : undefined,
  }
}

function toTerminalRequest(
  args: unknown,
  options: BuiltinToolOptions,
  profile: ToolProfile,
  runId?: string,
  extra: { toolCallId?: string; signal?: AbortSignal } = {}
): TerminalExecRequest {
  const terminalArgs = asTerminalExecArgs(args)
  return {
    sessionId: options.sessionId,
    runId,
    toolCallId: extra.toolCallId,
    profile,
    command: terminalArgs.command ?? '',
    cwd: terminalArgs.cwd,
    timeoutMs: terminalArgs.timeoutMs,
    maxOutputChars: terminalArgs.maxOutputChars,
    background: terminalArgs.background,
    pty: terminalArgs.pty,
    env: terminalArgs.env,
    network: terminalArgs.network,
    signal: extra.signal,
  }
}

function parseToolRunAt(value: string | number | undefined): number | undefined {
  if (value === undefined) {
    return undefined
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.floor(value)
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  throw new Error('future_task runAt must be Unix milliseconds or a parseable date/time string.')
}

function summarizeCronTaskForTool(task: ReturnType<CronManager['list']>['tasks'][number]) {
  return {
    id: task.id,
    name: task.name,
    schedule: task.schedule,
    enabled: task.enabled,
    state: task.state,
    nextRunAt: task.nextRunAt,
    lastStatus: task.lastStatus,
    lastError: task.lastError
      ? {
          code: task.lastError.code,
          message: task.lastError.message,
        }
      : undefined,
  }
}

function futureTaskResult(value: unknown): ReturnType<AgentTool['execute']> {
  return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify(value) }] })
}

function jsonToolResult(value: unknown): ReturnType<AgentTool['execute']> {
  return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify(value) }] })
}

function futureTaskError(code: string, message: string): ReturnType<AgentTool['execute']> {
  return futureTaskResult({
    ok: false,
    error: { code, message },
  })
}

function isCalculatorOperation(value: unknown): value is NonNullable<CalculatorArgs['operation']> {
  return (
    value === 'add' ||
    value === 'subtract' ||
    value === 'multiply' ||
    value === 'divide' ||
    value === 'power'
  )
}

function isMemoryKind(value: unknown): value is CompanionMemoryKind {
  return (
    value === 'profile' ||
    value === 'preference' ||
    value === 'relationship' ||
    value === 'episode' ||
    value === 'plan' ||
    value === 'boundary' ||
    value === 'fact'
  )
}

function isMemoryScope(value: unknown): value is CompanionMemoryScope {
  return (
    value === 'global' ||
    value === 'user' ||
    value === 'companion' ||
    value === 'session' ||
    value === 'character'
  )
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

function latestUserMessageIds(options: BuiltinToolOptions): string[] {
  return options.messages
    .listBySession(options.sessionId)
    .filter((message) => message.role === 'user' && message.status !== 'deleted')
    .slice(-2)
    .map((message) => message.id)
}

function hashToolEvidence(runOrSessionId: string, messageIds: string[]): string {
  return createHash('sha256')
    .update([runOrSessionId, ...messageIds].join(':'))
    .digest('hex')
    .slice(0, 24)
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min
  }
  return Math.min(max, Math.max(min, value))
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
  return ATTACHMENT_PROMPTS.extractedTextWithoutMime({ name: filename, text })
}

function makeSnippet(text: string, index: number, length: number, contextChars: number): string {
  const start = Math.max(0, index - contextChars)
  const end = Math.min(text.length, index + length + contextChars)
  return `${start > 0 ? '...' : ''}${text.slice(start, end)}${end < text.length ? '...' : ''}`
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  return Object.values(value).every((item) => typeof item === 'string')
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Tool execution aborted.', 'AbortError')
  }
}

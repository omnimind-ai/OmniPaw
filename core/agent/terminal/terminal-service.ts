import { dirname, isAbsolute, resolve } from 'node:path'
import type { Logger } from '@core/logging'
import type { ToolProfile } from '@shared/types/chat'
import type {
  LocalAgentTerminalSettings,
  LocalNetworkPolicy,
  LocalProcessSummary,
  LocalToolApprovalPlan,
} from '@shared/types/local-agent'
import type { AgentWorkspaceService } from '../workspace'
import type { ProcessExecutionResult, ProcessSupervisor } from './process-supervisor'

export interface TerminalServiceOptions {
  workspace: AgentWorkspaceService
  supervisor: ProcessSupervisor
  settings: () => LocalAgentTerminalSettings
  logger?: Logger
}

export interface TerminalExecRequest {
  sessionId: string
  runId?: string
  toolCallId?: string
  profile: ToolProfile
  command: string
  cwd?: string
  timeoutMs?: number
  maxOutputChars?: number
  background?: boolean
  pty?: boolean
  env?: Record<string, string>
  network?: LocalNetworkPolicy
  signal?: AbortSignal
}

export interface TerminalExecutionPlan {
  command: string
  cwd: string
  timeoutMs: number
  maxOutputChars: number
  background: boolean
  pty: boolean
  network: LocalNetworkPolicy
  env: Record<string, string>
  envKeys: string[]
  fullAccess: boolean
  accessScope: 'managed-workspace' | 'full-local-access'
}

export class TerminalService {
  private readonly logger?: Logger

  constructor(private readonly options: TerminalServiceOptions) {
    this.logger = options.logger
  }

  async execute(input: TerminalExecRequest): Promise<{
    plan: Omit<TerminalExecutionPlan, 'env'>
    process: LocalProcessSummary
    stdout: string
    stderr: string
    exitCode?: number | null
    signal?: string | null
    timedOut: boolean
    aborted: boolean
    truncated: boolean
  }> {
    const plan = await this.createPlan(input)
    const workspace = await this.options.workspace.getWorkspacePaths(input.sessionId)
    const result = await this.options.supervisor.execute({
      sessionId: input.sessionId,
      runId: input.runId,
      toolCallId: input.toolCallId,
      workspaceId: workspace.id,
      command: plan.command,
      cwd: plan.cwd,
      env: plan.env,
      timeoutMs: plan.timeoutMs,
      maxOutputChars: plan.maxOutputChars,
      background: plan.background,
      signal: input.signal,
    })
    this.logger?.info('Terminal command completed.', {
      sessionId: input.sessionId,
      runId: input.runId,
      profile: input.profile,
      background: plan.background,
      status: result.process.status,
      fullAccess: plan.fullAccess,
      durationMs: result.process.durationMs,
    })
    return {
      plan: stripPlanSecrets(plan),
      process: result.process,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      signal: result.signal,
      timedOut: result.timedOut,
      aborted: result.aborted,
      truncated: result.truncated,
    }
  }

  async createApprovalPlan(
    input: TerminalExecRequest
  ): Promise<Extract<LocalToolApprovalPlan, { kind: 'terminal' }>> {
    const plan = await this.createPlan(input)
    return {
      kind: 'terminal',
      command: plan.command,
      cwd: displayCwd(plan.cwd),
      timeoutMs: plan.timeoutMs,
      background: plan.background,
      pty: plan.pty,
      network: plan.network,
      envKeys: plan.envKeys,
      accessScope: plan.accessScope,
      fullAccess: plan.fullAccess,
    }
  }

  listProcesses(input: { sessionId?: string } = {}): LocalProcessSummary[] {
    return this.options.supervisor.list(input)
  }

  getProcess(processId: string): LocalProcessSummary | null {
    return this.options.supervisor.get(processId)
  }

  killProcess(processId: string): boolean {
    return this.options.supervisor.kill(processId)
  }

  private async createPlan(input: TerminalExecRequest): Promise<TerminalExecutionPlan> {
    const command = input.command.trim()
    if (!command) {
      throw new Error('terminal_exec requires a non-empty command.')
    }
    const settings = this.options.settings()
    if (!settings.enabled) {
      throw new Error('Terminal execution is disabled.')
    }
    const profileSettings = input.profile === 'power' ? settings.power : settings.assistant
    if (input.profile === 'minimal') {
      throw new Error('Terminal execution is not available in minimal profile.')
    }
    if (input.profile === 'assistant' && settings.assistant.approval === 'deny') {
      throw new Error('Terminal execution is denied by the active profile settings.')
    }
    const fullAccess = input.profile === 'power' || profileSettings.fullAccess
    if (!fullAccess && matchesAnyPattern(command, profileSettings.commandDenyPatterns)) {
      throw new Error('Terminal command is denied by assistant command policy.')
    }
    const workspace = await this.options.workspace.getWorkspacePaths(input.sessionId)
    const cwd = await this.resolveCwd(input, fullAccess)
    const timeoutMs = clampInteger(input.timeoutMs, 1000, settings.timeoutMs, settings.timeoutMs)
    const maxOutputChars = clampInteger(
      input.maxOutputChars,
      1000,
      settings.maxOutputChars,
      settings.maxOutputChars
    )
    const background = input.background === true
    const pty = input.pty === true
    const network = input.network ?? profileSettings.network
    const env = buildMinimalEnv({
      keys: settings.minimalEnvKeys,
      workspaceRoot: workspace.root,
      workspaceTmp: workspace.tmp,
      explicitEnv: input.env,
    })
    return {
      command,
      cwd,
      timeoutMs,
      maxOutputChars,
      background,
      pty,
      network,
      env,
      envKeys: Object.keys(env).sort(),
      fullAccess,
      accessScope: fullAccess ? 'full-local-access' : 'managed-workspace',
    }
  }

  private async resolveCwd(input: TerminalExecRequest, fullAccess: boolean): Promise<string> {
    const requested = input.cwd?.trim()
    if (fullAccess && requested && isAbsolute(requested)) {
      return resolve(requested)
    }
    if (fullAccess && requested && requested.startsWith('~')) {
      return resolve(process.env.HOME || process.cwd(), requested.slice(1))
    }
    if (fullAccess && requested && requested.startsWith('.')) {
      return resolve(process.cwd(), requested)
    }
    return this.options.workspace.resolveCwd(input.sessionId, requested)
  }
}

function buildMinimalEnv(input: {
  keys: string[]
  workspaceRoot: string
  workspaceTmp: string
  explicitEnv?: Record<string, string>
}): Record<string, string> {
  const allowed = new Set(input.keys)
  const env: Record<string, string> = {}
  if (allowed.has('PATH') && process.env.PATH) {
    env.PATH = process.env.PATH
  }
  if (allowed.has('HOME')) {
    env.HOME = input.workspaceRoot
  }
  if (allowed.has('TMPDIR')) {
    env.TMPDIR = input.workspaceTmp
  }
  if (allowed.has('TEMP')) {
    env.TEMP = input.workspaceTmp
  }
  if (allowed.has('TMP')) {
    env.TMP = input.workspaceTmp
  }
  for (const [key, value] of Object.entries(input.explicitEnv ?? {})) {
    if (isSafeEnvKey(key) && typeof value === 'string') {
      env[key] = value
    }
  }
  return env
}

function stripPlanSecrets(plan: TerminalExecutionPlan): Omit<TerminalExecutionPlan, 'env'> {
  const { env: _env, ...safe } = plan
  return safe
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  if (!Number.isInteger(value)) return fallback
  return Math.max(min, Math.min(value as number, max))
}

function isSafeEnvKey(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value)
}

function matchesAnyPattern(command: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    const trimmed = pattern.trim()
    if (!trimmed) return false
    const escaped = trimmed.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
    return new RegExp(`^${escaped}$`).test(command)
  })
}

function displayCwd(path: string): string {
  const parent = dirname(path)
  const name = path.slice(parent.length + 1)
  return name || path
}

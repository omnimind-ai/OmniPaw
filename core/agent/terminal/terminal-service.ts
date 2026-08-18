import { dirname, isAbsolute, resolve } from 'node:path'
import type { Logger } from '@core/logging'
import type { ToolProfile } from '@shared/types/chat'
import type {
  InstallTerminalSandboxResponse,
  LocalAgentTerminalSettings,
  LocalAgentWorkspaceSettings,
  LocalNetworkPolicy,
  LocalProcessSummary,
  LocalToolApprovalPlan,
  TerminalSandboxStatus,
} from '@shared/types/local-agent'
import type { AgentWorkspaceService } from '../workspace'
import type { ProcessSupervisor } from './process-supervisor'
import { TerminalSandboxError, type TerminalSandboxRunner } from './sandbox'

export interface TerminalServiceOptions {
  workspace: AgentWorkspaceService
  supervisor: ProcessSupervisor
  settings: () => LocalAgentTerminalSettings
  workspaceSettings: () => LocalAgentWorkspaceSettings
  sandbox?: TerminalSandboxRunner
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
  network: LocalNetworkPolicy
  env: Record<string, string>
  envKeys: string[]
  fullAccess: boolean
  accessScope: 'managed-workspace' | 'full-local-access'
}

export class TerminalPolicyError extends Error {
  readonly code = 'terminal_policy_denied'

  constructor(message: string) {
    super(message)
    this.name = 'TerminalPolicyError'
  }
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
    const execute = (launch?: {
      executable: string
      args: string[]
      env: Record<string, string>
    }) =>
      this.options.supervisor.execute({
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
        launch,
      })
    const result = plan.fullAccess
      ? await execute()
      : await this.executeSandboxed(input, plan, workspace, execute)
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

  killProcess(processId: string): Promise<boolean> {
    return this.options.supervisor.kill(processId)
  }

  cleanupSession(sessionId: string): Promise<number> {
    return this.options.supervisor.cleanupSession(sessionId)
  }

  getSandboxStatus(): Promise<TerminalSandboxStatus> {
    if (this.options.sandbox) {
      return this.options.sandbox.getStatus()
    }
    return Promise.resolve({
      platform: 'unsupported',
      state: 'unsupported',
      supported: false,
      ready: false,
      installed: false,
      implementation: 'none',
      warnings: [],
      errors: ['Terminal sandbox runtime is unavailable.'],
      checkedAt: Date.now(),
    })
  }

  installSandbox(): Promise<InstallTerminalSandboxResponse> {
    if (!this.options.sandbox) {
      throw new TerminalSandboxError(
        'terminal_sandbox_unavailable',
        'Terminal sandbox runtime is unavailable.'
      )
    }
    return this.options.sandbox.install()
  }

  async dispose(): Promise<number> {
    const terminated = await this.options.supervisor.dispose()
    await this.options.sandbox?.dispose()
    return terminated
  }

  resolveNetworkPolicy(
    input: Pick<TerminalExecRequest, 'profile' | 'network'>
  ): LocalNetworkPolicy {
    const profileSettings = this.profileSettings(input.profile, this.options.settings())
    return restrictNetworkPolicy(profileSettings.network, input.network)
  }

  requiresApproval(input: Pick<TerminalExecRequest, 'profile' | 'network'>): boolean {
    return this.resolveNetworkPolicy(input) === 'ask'
  }

  private async createPlan(input: TerminalExecRequest): Promise<TerminalExecutionPlan> {
    const command = input.command.trim()
    if (!command) {
      throw new Error('terminal_exec requires a non-empty command.')
    }
    const settings = this.options.settings()
    const profileSettings = this.profileSettings(input.profile, settings)
    const fullAccess = profileSettings.fullAccess
    if (matchesAnyPattern(command, profileSettings.commandDenyPatterns)) {
      throw new TerminalPolicyError('Terminal command is denied by the active command policy.')
    }
    if (
      profileSettings.commandAllowPatterns.length > 0 &&
      !matchesAnyPattern(command, profileSettings.commandAllowPatterns)
    ) {
      throw new TerminalPolicyError('Terminal command is outside the active command allow list.')
    }
    const background = input.background === true
    if (background && !profileSettings.allowBackground) {
      throw new TerminalPolicyError('Background terminal execution is disabled for this profile.')
    }
    const network = restrictNetworkPolicy(profileSettings.network, input.network)
    if (fullAccess && network === 'deny') {
      throw new TerminalPolicyError('Terminal execution is disabled by the active network policy.')
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
      network,
      env,
      envKeys: Object.keys(env).sort(),
      fullAccess,
      accessScope: fullAccess ? 'full-local-access' : 'managed-workspace',
    }
  }

  private profileSettings(
    profile: ToolProfile,
    settings: LocalAgentTerminalSettings
  ): LocalAgentTerminalSettings['assistant'] | LocalAgentTerminalSettings['power'] {
    if (profile === 'minimal') {
      throw new TerminalPolicyError('Terminal execution is disabled for the minimal profile.')
    }
    return profile === 'power' ? settings.power : settings.assistant
  }

  private async resolveCwd(input: TerminalExecRequest, fullAccess: boolean): Promise<string> {
    const requested = input.cwd?.trim()
    if (fullAccess && requested && isAbsolute(requested)) {
      return resolve(requested)
    }
    if (fullAccess && requested?.startsWith('~')) {
      return resolve(process.env.HOME || process.cwd(), requested.slice(1))
    }
    if (fullAccess && requested?.startsWith('.')) {
      return resolve(process.cwd(), requested)
    }
    return this.options.workspace.resolveCwd(input.sessionId, requested)
  }

  private async executeSandboxed<T>(
    input: TerminalExecRequest,
    plan: TerminalExecutionPlan,
    workspace: Awaited<ReturnType<AgentWorkspaceService['getWorkspacePaths']>>,
    execute: (launch: {
      executable: string
      args: string[]
      env: Record<string, string>
    }) => Promise<T>
  ): Promise<T> {
    const sandbox = this.options.sandbox
    if (!sandbox) {
      throw new TerminalSandboxError(
        'terminal_sandbox_unavailable',
        'A system-enforced terminal sandbox is required for this profile.'
      )
    }
    if (plan.background) {
      throw new TerminalPolicyError(
        'Background terminal execution requires a full local access profile.'
      )
    }
    return sandbox.run(
      {
        command: plan.command,
        commandId: input.toolCallId ?? input.runId ?? crypto.randomUUID(),
        cwd: plan.cwd,
        env: plan.env,
        workspaceRoot: workspace.root,
        workspaceFiles: workspace.files,
        workspaceTmp: workspace.tmp,
        network: plan.network,
        denyPatterns: this.options.workspaceSettings().denyPatterns,
        signal: input.signal,
      },
      execute
    )
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
    return new RegExp(`^${escaped}$`, 'is').test(command)
  })
}

function restrictNetworkPolicy(
  profilePolicy: LocalNetworkPolicy,
  requestedPolicy: LocalNetworkPolicy | undefined
): LocalNetworkPolicy {
  if (!requestedPolicy) return profilePolicy
  const priority: Record<LocalNetworkPolicy, number> = {
    deny: 0,
    ask: 1,
    allow: 2,
  }
  return priority[requestedPolicy] < priority[profilePolicy] ? requestedPolicy : profilePolicy
}

function displayCwd(path: string): string {
  const parent = dirname(path)
  const name = path.slice(parent.length + 1)
  return name || path
}

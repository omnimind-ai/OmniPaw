import type {
  InstallTerminalSandboxResponse,
  LocalNetworkPolicy,
  TerminalSandboxStatus,
} from '@shared/types/local-agent'

export interface TerminalSandboxExecutionInput {
  command: string
  commandId: string
  cwd: string
  env: Record<string, string>
  workspaceRoot: string
  workspaceFiles: string
  workspaceTmp: string
  network: LocalNetworkPolicy
  denyPatterns: string[]
  signal?: AbortSignal
}

export interface TerminalSandboxLaunch {
  executable: string
  args: string[]
  env: Record<string, string>
}

export interface TerminalSandboxRunner {
  getStatus(): Promise<TerminalSandboxStatus>
  install(): Promise<InstallTerminalSandboxResponse>
  run<T>(
    input: TerminalSandboxExecutionInput,
    execute: (launch: TerminalSandboxLaunch) => Promise<T>
  ): Promise<T>
  dispose(): Promise<void>
}

export class TerminalSandboxError extends Error {
  readonly code:
    | 'terminal_sandbox_unavailable'
    | 'terminal_sandbox_setup_required'
    | 'terminal_sandbox_install_failed'

  constructor(
    code: TerminalSandboxError['code'],
    message: string,
    options: { cause?: unknown } = {}
  ) {
    super(message, options)
    this.name = 'TerminalSandboxError'
    this.code = code
  }
}

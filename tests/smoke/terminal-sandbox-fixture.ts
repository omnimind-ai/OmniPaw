import type {
  TerminalSandboxExecutionInput,
  TerminalSandboxRunner,
} from '../../core/agent/terminal'

export function createPassthroughTerminalSandbox(): TerminalSandboxRunner {
  return {
    getStatus: async () => ({
      platform:
        process.platform === 'win32'
          ? 'windows'
          : process.platform === 'darwin'
            ? 'macos'
            : 'linux',
      state: 'ready',
      supported: true,
      ready: true,
      installed: true,
      implementation:
        process.platform === 'win32'
          ? 'srt-windows'
          : process.platform === 'darwin'
            ? 'seatbelt'
            : 'bubblewrap',
      warnings: [],
      errors: [],
      checkedAt: Date.now(),
    }),
    install: async function () {
      return { cancelled: false, status: await this.getStatus() }
    },
    run: <T>(
      input: TerminalSandboxExecutionInput,
      execute: Parameters<TerminalSandboxRunner['run']>[1]
    ) =>
      execute({
        executable:
          process.platform === 'win32'
            ? `${process.env.SystemRoot || 'C:\\Windows'}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
            : '/bin/sh',
        args:
          process.platform === 'win32'
            ? ['-NoProfile', '-NonInteractive', '-Command', input.command]
            : ['-c', input.command],
        env: input.env,
      }) as Promise<T>,
    dispose: async () => {},
  }
}

import { type ChildProcess, spawn } from 'node:child_process'
import type { ProcessTreeController } from '@core/agent/terminal'

const POSIX_TERMINATION_GRACE_MS = 500
const TASKKILL_TIMEOUT_MS = 5_000

interface LocalProcessTreeDependencies {
  signalProcess: (pid: number, signal: NodeJS.Signals | 0) => boolean
  wait: (durationMs: number) => Promise<void>
}

const defaultDependencies: LocalProcessTreeDependencies = {
  signalProcess: (pid, signal) => process.kill(pid, signal),
  wait: (durationMs) => new Promise((resolve) => setTimeout(resolve, durationMs)),
}

export function createLocalProcessTreeController(
  platform: NodeJS.Platform = process.platform,
  dependencies: LocalProcessTreeDependencies = defaultDependencies
): ProcessTreeController {
  return {
    detached: platform !== 'win32',
    terminate: (child) => terminateProcessTree(child, platform, dependencies),
  }
}

async function terminateProcessTree(
  child: ChildProcess,
  platform: NodeJS.Platform,
  dependencies: LocalProcessTreeDependencies
): Promise<{ terminated: boolean; signal: string }> {
  const pid = child.pid
  if (!pid || child.exitCode !== null) {
    return { terminated: false, signal: 'SIGKILL' }
  }

  if (platform === 'win32') {
    if (await runTaskkill(pid)) {
      return { terminated: true, signal: 'SIGKILL' }
    }
    return terminateSingleProcess(child, 'SIGKILL')
  }

  if (!signalProcessGroup(pid, 'SIGTERM', dependencies)) {
    return terminateSingleProcess(child, 'SIGTERM')
  }
  await dependencies.wait(POSIX_TERMINATION_GRACE_MS)
  if (processGroupExists(pid, dependencies) && signalProcessGroup(pid, 'SIGKILL', dependencies)) {
    return { terminated: true, signal: 'SIGKILL' }
  }
  return { terminated: true, signal: 'SIGTERM' }
}

function runTaskkill(pid: number): Promise<boolean> {
  return new Promise((resolve) => {
    const killer = spawn('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
      shell: false,
      stdio: 'ignore',
      windowsHide: true,
    })
    let settled = false
    const finish = (succeeded: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve(succeeded)
    }
    const timeout = setTimeout(() => {
      killer.kill()
      finish(false)
    }, TASKKILL_TIMEOUT_MS)
    killer.once('error', () => finish(false))
    killer.once('close', (exitCode) => finish(exitCode === 0))
  })
}

function signalProcessGroup(
  pid: number,
  signal: NodeJS.Signals,
  dependencies: LocalProcessTreeDependencies
): boolean {
  try {
    return dependencies.signalProcess(-pid, signal)
  } catch {
    return false
  }
}

function processGroupExists(pid: number, dependencies: LocalProcessTreeDependencies): boolean {
  try {
    return dependencies.signalProcess(-pid, 0)
  } catch {
    return false
  }
}

function terminateSingleProcess(
  child: ChildProcess,
  signal: NodeJS.Signals
): { terminated: boolean; signal: string } {
  try {
    return { terminated: child.kill(signal), signal }
  } catch {
    return { terminated: false, signal }
  }
}

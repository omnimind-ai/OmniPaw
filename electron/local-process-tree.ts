import { type ChildProcess, spawn } from 'node:child_process'
import type { ProcessTreeController } from '@core/agent/terminal'

const POSIX_TERMINATION_GRACE_MS = 500
const TASKKILL_TIMEOUT_MS = 5_000

export function createLocalProcessTreeController(
  platform: NodeJS.Platform = process.platform
): ProcessTreeController {
  return {
    detached: platform !== 'win32',
    terminate: (child) => terminateProcessTree(child, platform),
  }
}

async function terminateProcessTree(
  child: ChildProcess,
  platform: NodeJS.Platform
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

  if (!signalProcessGroup(pid, 'SIGTERM')) {
    return terminateSingleProcess(child, 'SIGTERM')
  }
  await delay(POSIX_TERMINATION_GRACE_MS)
  if (processGroupExists(pid) && signalProcessGroup(pid, 'SIGKILL')) {
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

function signalProcessGroup(pid: number, signal: NodeJS.Signals): boolean {
  try {
    process.kill(-pid, signal)
    return true
  } catch {
    return false
  }
}

function processGroupExists(pid: number): boolean {
  try {
    process.kill(-pid, 0)
    return true
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

function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs))
}

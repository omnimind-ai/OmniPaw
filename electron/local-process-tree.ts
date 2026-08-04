import { type ChildProcess, spawnSync } from 'node:child_process'
import type { ProcessTreeController } from '@core/agent/terminal'

export function createLocalProcessTreeController(
  platform: NodeJS.Platform = process.platform
): ProcessTreeController {
  return {
    detached: platform !== 'win32',
    terminate: (child) => terminateProcessTree(child, platform),
  }
}

function terminateProcessTree(
  child: ChildProcess,
  platform: NodeJS.Platform
): { terminated: boolean; signal: string } {
  const pid = child.pid
  if (!pid || child.exitCode !== null) {
    return { terminated: false, signal: 'SIGKILL' }
  }

  if (platform === 'win32') {
    const result = spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    })
    if (result.status === 0) {
      return { terminated: true, signal: 'SIGKILL' }
    }
    return terminateSingleProcess(child)
  }

  try {
    process.kill(-pid, 'SIGKILL')
    return { terminated: true, signal: 'SIGKILL' }
  } catch {
    return terminateSingleProcess(child)
  }
}

function terminateSingleProcess(child: ChildProcess): { terminated: boolean; signal: string } {
  try {
    return { terminated: child.kill('SIGKILL'), signal: 'SIGKILL' }
  } catch {
    return { terminated: false, signal: 'SIGKILL' }
  }
}

import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

function resolvePnpmInvocation(args) {
  if (process.platform === 'win32') {
    const corepackPnpm = join(
      dirname(process.execPath),
      'node_modules',
      'corepack',
      'dist',
      'pnpm.js'
    )

    if (existsSync(corepackPnpm)) {
      return {
        command: process.execPath,
        args: [corepackPnpm, ...args],
        shell: false,
      }
    }

    return { command: 'pnpm', args, shell: true }
  }

  return { command: 'pnpm', args, shell: false }
}

export function spawnPnpm(args, options = {}) {
  const invocation = resolvePnpmInvocation(args)
  return spawn(invocation.command, invocation.args, {
    ...options,
    shell: invocation.shell,
  })
}

export function spawnPnpmSync(args, options = {}) {
  const invocation = resolvePnpmInvocation(args)
  return spawnSync(invocation.command, invocation.args, {
    ...options,
    shell: invocation.shell,
  })
}

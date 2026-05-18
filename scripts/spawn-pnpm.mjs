import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

export function spawnPnpmSync(args, options = {}) {
  if (process.platform === 'win32') {
    const corepackPnpm = join(
      dirname(process.execPath),
      'node_modules',
      'corepack',
      'dist',
      'pnpm.js'
    )

    if (existsSync(corepackPnpm)) {
      return spawnSync(process.execPath, [corepackPnpm, ...args], options)
    }

    return spawnSync('pnpm', args, { ...options, shell: true })
  }

  return spawnSync('pnpm', args, options)
}

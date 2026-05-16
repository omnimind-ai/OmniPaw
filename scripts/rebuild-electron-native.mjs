import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)

for (const packageName of ['better-sqlite3']) {
  const packageDir = dirname(require.resolve(`${packageName}/package.json`))
  rmSync(join(packageDir, 'build', 'Release'), { recursive: true, force: true })
}

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const result = spawnSync(pnpm, ['exec', 'electron-builder', 'install-app-deps'], {
  stdio: 'inherit',
})

if (result.error) {
  throw result.error
}

process.exit(result.status ?? 1)

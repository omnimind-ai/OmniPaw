import { rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { spawnPnpmSync } from './spawn-pnpm.mjs'

const require = createRequire(import.meta.url)

for (const packageName of ['better-sqlite3']) {
  const packageDir = dirname(require.resolve(`${packageName}/package.json`))
  rmSync(join(packageDir, 'build', 'Release'), { recursive: true, force: true })
}

const result = spawnPnpmSync(['exec', 'electron-builder', 'install-app-deps'], {
  stdio: 'inherit',
})

if (result.error) {
  throw result.error
}

process.exit(result.status ?? 1)

import { spawnPnpmSync } from './spawn-pnpm.mjs'

const script = process.argv[2]

if (!script) {
  process.stderr.write('Usage: node scripts/run-electron-node.mjs <script.ts> [...args]\n')
  process.exit(1)
}

const result = spawnPnpmSync(
  ['exec', 'electron', '--import', 'tsx', script, ...process.argv.slice(3)],
  {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
    },
    stdio: 'inherit',
  }
)

if (result.error) {
  throw result.error
}

process.exit(result.status ?? 1)

import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

const smokeDir = 'tests/smoke'
const requestedTests = process.argv.slice(2)
const smokeTests =
  requestedTests.length > 0
    ? requestedTests
    : readdirSync(smokeDir)
        .filter((file) => file.endsWith('-smoke.ts'))
        .sort()
        .map((file) => join(smokeDir, file))

if (smokeTests.length === 0) {
  process.stderr.write(`No smoke tests found in ${smokeDir}.\n`)
  process.exit(1)
}

const failures = []

for (const smokeTest of smokeTests) {
  process.stdout.write(`\n== ${smokeTest} ==\n`)

  const result = spawnSync(process.execPath, ['scripts/run-electron-node.mjs', smokeTest], {
    stdio: 'inherit',
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    failures.push({ smokeTest, status: result.status ?? 1 })
  }
}

if (failures.length > 0) {
  process.stderr.write('\nSmoke test failures:\n')

  for (const failure of failures) {
    process.stderr.write(`- ${failure.smokeTest} exited with status ${failure.status}\n`)
  }

  process.exit(1)
}

process.stdout.write('\nAll smoke tests passed.\n')

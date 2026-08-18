import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SrtTerminalSandbox } from '../../electron/terminal-sandbox'

const adapterSource = readFileSync('electron/terminal-sandbox.ts', 'utf8')
const workerSource = readFileSync('electron/workers/terminal-sandbox.ts', 'utf8')
const viteSource = readFileSync('electron.vite.config.ts', 'utf8')

assert.match(adapterSource, /this\.broker\.prepare/)
assert.doesNotMatch(adapterSource, /SandboxManager\.initialize/)
assert.match(workerSource, /SandboxManager\.initialize/)
assert.match(viteSource, /workers\/terminal-sandbox/)

const sandbox = new SrtTerminalSandbox()

try {
  const status = await sandbox.getStatus()
  assert.equal(status.checkedAt > 0, true)
  assert.equal(status.ready, status.state === 'ready')
  assert.equal(Array.isArray(status.errors), true)
  assert.equal(Array.isArray(status.warnings), true)

  if (process.platform === 'win32') {
    assert.equal(status.platform, 'windows')
    assert.equal(status.supported, true)
    assert.equal(status.implementation, 'srt-windows')
    assert.equal(
      ['ready', 'setup_required', 'error'].includes(status.state),
      true,
      `Unexpected Windows sandbox state: ${status.state}`
    )
  }

  console.log(`Terminal sandbox capability smoke check passed (${status.state})`)
} finally {
  await sandbox.dispose()
}

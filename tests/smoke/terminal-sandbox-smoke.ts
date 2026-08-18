import assert from 'node:assert/strict'
import { SrtTerminalSandbox } from '../../electron/terminal-sandbox'

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

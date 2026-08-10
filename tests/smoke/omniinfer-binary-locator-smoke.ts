import assert from 'node:assert/strict'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { locateOmniInferInstall } from '../../electron/omniinfer/binary-locator'

const root = join(tmpdir(), `omnipaw-omniinfer-locator-${process.pid}`)
const repoRoot = join(root, 'projects', 'omnipaw-electron')
const installDir = join(root, 'omniinfer', 'OmniInfer')
const cliName = process.platform === 'win32' ? 'omniinfer.cmd' : 'omniinfer'
const cliPath = join(installDir, cliName)

try {
  mkdirSync(repoRoot, { recursive: true })
  mkdirSync(installDir, { recursive: true })
  writeFileSync(cliPath, '')

  const located = locateOmniInferInstall({
    app: {
      isPackaged: false,
      getPath: () => join(root, 'OmniPaw.exe'),
    } as never,
    repoRoot,
  })

  const normalize = (value: string | undefined) =>
    process.platform === 'win32' ? value?.toLowerCase() : value
  assert.equal(normalize(located.installDir), normalize(installDir))
  assert.equal(normalize(located.cliPath), normalize(cliPath))
  console.log('OmniInfer binary locator smoke check passed')
} finally {
  rmSync(root, { recursive: true, force: true })
}

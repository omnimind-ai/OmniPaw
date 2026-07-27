import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  omniInferRuntimePlatformDirectory,
  prepareOmniInferDataDirectories,
} from '../../electron/omniinfer/data-directories'
import { buildManagedCliArgs, parseBackendTable } from '../../electron/omniinfer/process'

const tempRoot = mkdtempSync(join(tmpdir(), 'omnipaw-omniinfer-data-'))

try {
  const installDir = join(tempRoot, 'OmniPaw.app', 'Contents', 'Resources', 'omniinfer')
  const legacyRoot = join(installDir, '.local')
  const platformDirectory = omniInferRuntimePlatformDirectory()
  const legacyConfig = join(legacyRoot, 'config', 'state.json')
  const legacyRuntime = join(
    legacyRoot,
    'runtime',
    platformDirectory,
    'llama.cpp-test',
    'prebuilt.json'
  )
  const legacyRunState = join(legacyRoot, 'run', 'serve-19157.json')
  mkdirSync(join(legacyRoot, 'config'), { recursive: true })
  mkdirSync(join(legacyRoot, 'runtime', platformDirectory, 'llama.cpp-test'), {
    recursive: true,
  })
  mkdirSync(join(legacyRoot, 'run'), { recursive: true })
  writeFileSync(legacyConfig, '{"selected_backend":"llama.cpp-mac"}')
  writeFileSync(legacyRuntime, '{"backend":"llama.cpp-test"}')
  writeFileSync(legacyRunState, '{"pid":123}')

  const dataRootPath = join(tempRoot, 'Application Support', 'omnipaw')
  const directories = prepareOmniInferDataDirectories({ dataRootPath, installDir })
  assert.equal(directories.stateRoot, join(dataRootPath, 'omniinfer'))
  assert.equal(
    directories.runtimeRoot,
    join(dataRootPath, 'omniinfer', 'runtime', platformDirectory)
  )
  assert.equal(directories.logsDir, join(dataRootPath, 'omniinfer', 'logs'))
  assert.equal(
    readFileSync(join(directories.stateRoot, 'config', 'state.json'), 'utf8'),
    '{"selected_backend":"llama.cpp-mac"}'
  )
  assert.equal(
    readFileSync(join(directories.runtimeRoot, 'llama.cpp-test', 'prebuilt.json'), 'utf8'),
    '{"backend":"llama.cpp-test"}'
  )
  assert.equal(existsSync(join(directories.stateRoot, 'run')), false)

  writeFileSync(join(directories.stateRoot, 'config', 'state.json'), '{"preserved":true}')
  prepareOmniInferDataDirectories({ dataRootPath, installDir })
  assert.equal(
    readFileSync(join(directories.stateRoot, 'config', 'state.json'), 'utf8'),
    '{"preserved":true}'
  )

  assert.deepEqual(
    buildManagedCliArgs('/data/state', '/data/runtime', ['serve', '--port', '19157']),
    ['--state-root', '/data/state', '--runtime-root', '/data/runtime', 'serve', '--port', '19157']
  )
  assert.deepEqual(
    parseBackendTable(`Compatible backends
Backend         Selected  Runtime
--------------  --------  ---------
llama.cpp-mac             installed
mlx-mac                   missing
Install a runtime: omniinfer backend install <backend>
`),
    ['llama.cpp-mac', 'mlx-mac']
  )
  assert.deepEqual(
    parseBackendTable(`Installed backends
Backend  Selected  Runtime
-------  --------  -------
`),
    []
  )

  console.log('OmniInfer data directory smoke check passed')
} finally {
  rmSync(tempRoot, { recursive: true, force: true })
}

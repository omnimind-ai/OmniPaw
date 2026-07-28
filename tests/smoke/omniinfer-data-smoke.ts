import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  omniInferRuntimePlatformDirectory,
  prepareOmniInferDataDirectories,
} from '../../electron/omniinfer/data-directories'
import {
  buildManagedCliArgs,
  parseAdvisorSystemOutput,
  parseBackendInstallProgress,
  parseBackendTable,
  supportsBackendInstallCommand,
  supportsManagedDataDirectories,
} from '../../electron/omniinfer/process'

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
  const bundledCpuManifest = join(installDir, 'bootstrap-runtime', 'llama.cpp-cpu', 'prebuilt.json')
  mkdirSync(join(legacyRoot, 'config'), { recursive: true })
  mkdirSync(join(legacyRoot, 'runtime', platformDirectory, 'llama.cpp-test'), {
    recursive: true,
  })
  mkdirSync(join(legacyRoot, 'run'), { recursive: true })
  mkdirSync(join(installDir, 'bootstrap-runtime', 'llama.cpp-cpu'), { recursive: true })
  writeFileSync(legacyConfig, '{"selected_backend":"llama.cpp-mac"}')
  writeFileSync(legacyRuntime, '{"backend":"llama.cpp-test"}')
  writeFileSync(legacyRunState, '{"pid":123}')
  writeFileSync(bundledCpuManifest, '{"backend":"llama.cpp-cpu","bundled":true}')

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
  assert.equal(
    readFileSync(join(directories.runtimeRoot, 'llama.cpp-cpu', 'prebuilt.json'), 'utf8'),
    '{"backend":"llama.cpp-cpu","bundled":true}'
  )
  assert.equal(existsSync(join(directories.stateRoot, 'run')), false)

  writeFileSync(join(directories.stateRoot, 'config', 'state.json'), '{"preserved":true}')
  writeFileSync(
    join(directories.runtimeRoot, 'llama.cpp-cpu', 'prebuilt.json'),
    '{"preserved":true}'
  )
  prepareOmniInferDataDirectories({ dataRootPath, installDir })
  assert.equal(
    readFileSync(join(directories.stateRoot, 'config', 'state.json'), 'utf8'),
    '{"preserved":true}'
  )
  assert.equal(
    readFileSync(join(directories.runtimeRoot, 'llama.cpp-cpu', 'prebuilt.json'), 'utf8'),
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
  assert.deepEqual(
    parseBackendTable(`Installed backends
Backend         Selected  Installed
--------------  --------  ---------
llama.cpp-cuda  yes       yes
`),
    ['llama.cpp-cuda']
  )
  assert.deepEqual(
    parseBackendTable(`Compatible backends
Backend            Selected  Installed
-----------------  --------  ---------
llama.cpp-cpu
llama.cpp-cuda     yes       yes
llama.cpp-vulkan
`),
    ['llama.cpp-cpu', 'llama.cpp-cuda', 'llama.cpp-vulkan']
  )
  assert.equal(
    supportsManagedDataDirectories(`
options:
  --state-root STATE_ROOT
  --runtime-root RUNTIME_ROOT
`),
    true
  )
  assert.equal(
    supportsManagedDataDirectories(`
options:
  --port PORT
`),
    false
  )
  assert.equal(
    supportsBackendInstallCommand(`
positional arguments:
  {list,install,select,stop}
`),
    true
  )
  assert.equal(
    supportsBackendInstallCommand(`
positional arguments:
  {list,select,stop}
`),
    false
  )
  assert.deepEqual(
    parseAdvisorSystemOutput(
      JSON.stringify({
        backends: [
          {
            id: 'llama.cpp-cpu',
            installed: true,
            compatibility: 'compatible',
            hardware_compatible: true,
            prebuilt_installable: true,
          },
          {
            id: 'llama.cpp-cuda',
            installed: false,
            compatibility: 'compatible',
            hardware_compatible: true,
            prebuilt_installable: true,
          },
          {
            id: 'ik_llama.cpp-cuda',
            installed: false,
            compatibility: 'compatible',
            hardware_compatible: true,
            prebuilt_installable: false,
          },
        ],
        summary: {
          installed_backends: ['llama.cpp-cpu'],
          recommended_backend_to_install: 'llama.cpp-cuda',
          recommended_installed_backend: 'llama.cpp-cpu',
        },
      }),
      'llama.cpp-cpu'
    ),
    {
      baseBackend: 'llama.cpp-cpu',
      baseBackendInstalled: true,
      recommendedBackend: 'llama.cpp-cuda',
      recommendedInstalledBackend: 'llama.cpp-cpu',
      compatibleBackends: ['llama.cpp-cpu', 'llama.cpp-cuda'],
      installedBackends: ['llama.cpp-cpu'],
    }
  )
  assert.deepEqual(
    parseBackendInstallProgress(
      '{"event":"download_progress","backend":"llama.cpp-cuda","asset_count":1,"asset_index":1,"bytes_downloaded":50,"bytes_total":100}'
    ),
    {
      event: 'download_progress',
      backend: 'llama.cpp-cuda',
      assetCount: 1,
      assetIndex: 1,
      bytesDownloaded: 50,
      bytesTotal: 100,
      message: undefined,
    }
  )

  console.log('OmniInfer data directory smoke check passed')
} finally {
  rmSync(tempRoot, { recursive: true, force: true })
}

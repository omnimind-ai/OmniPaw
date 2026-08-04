import assert from 'node:assert/strict'
import { join, resolve } from 'node:path'
import { resolveOmniPawDataPaths } from '../../core/utils/data-paths'
import { resolveApplicationDataRoot } from '../../electron/application-data'

const appDataPath = resolve('tmp', 'omnipaw-data-paths-smoke')

const packagedRoot = resolveApplicationDataRoot({
  appDataPath,
  isPackaged: true,
})
assert.equal(packagedRoot, join(appDataPath, 'omnipaw'))

const developmentRoot = resolveApplicationDataRoot({
  appDataPath,
  isPackaged: false,
})
assert.equal(developmentRoot, join(appDataPath, 'omnipaw-dev'))
assert.equal(
  resolveOmniPawDataPaths({ dataRootPath: developmentRoot }).configRoot,
  join(appDataPath, 'omnipaw-dev', 'config')
)

assert.equal(
  resolveApplicationDataRoot({
    appDataPath,
    isPackaged: false,
    overridePath: '   ',
  }),
  developmentRoot
)

const overrideRoot = resolveApplicationDataRoot({
  appDataPath,
  isPackaged: false,
  overridePath: join(appDataPath, 'custom-data'),
})
assert.equal(overrideRoot, join(appDataPath, 'custom-data'))

console.log('Application data paths smoke check passed')

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  isVersionNewer,
  parseUpdateCheckResponseDocument,
  parseUpdateInfoDocument,
} from '../../core/update/update-info'

const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }
const versionDocument = JSON.parse(
  readFileSync('workers/app-update-worker/version.json', 'utf8')
) as unknown
const updateInfo = parseUpdateInfoDocument(versionDocument)

assert.equal(updateInfo.version, packageJson.version)
assert.equal(isVersionNewer('0.1.0', '0.1.1'), true)
assert.equal(isVersionNewer('0.2.0', '0.1.9'), false)

const updateResult = parseUpdateCheckResponseDocument(
  {
    ok: true,
    currentVersion: '0.1.0',
    latestVersion: '0.2.0',
    hasUpdate: true,
    release: {
      version: '0.2.0',
      release_date: '2026-08-01',
      changelog: ['Example update'],
      downloads: {
        github: 'https://example.com/releases/v0.2.0',
      },
    },
  },
  '0.1.0'
)

assert.equal(updateResult.currentVersion, '0.1.0')
assert.equal(updateResult.version, '0.2.0')
assert.equal(updateResult.hasUpdate, true)

assert.throws(
  () =>
    parseUpdateCheckResponseDocument(
      {
        ok: true,
        currentVersion: '0.1.0',
        latestVersion: '0.2.0',
        hasUpdate: false,
        release: {
          version: '0.2.0',
          changelog: [],
          downloads: {},
        },
      },
      '0.1.0'
    ),
  /hasUpdate is inconsistent/
)

console.log('Update information smoke check passed')

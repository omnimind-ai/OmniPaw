import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'

import { createElectronLogSink, createProjectLogger } from '../../core/logging'

const tempDir = mkdtempSync(join(tmpdir(), 'openomniclaw-logging-smoke-'))

try {
  const sink = createElectronLogSink({
    logDir: tempDir,
    appName: 'OpenOmniClawSmoke',
    fileName: 'smoke.log',
    runtime: 'test',
    maxFileBytes: 256 * 1024,
  })
  const logger = createProjectLogger({
    sink,
    scope: 'smoke',
    meta: {
      pid: process.pid,
      processType: 'test',
      appVersion: 'test',
      platform: process.platform,
    },
  })

  const circular: Record<string, unknown> = { name: 'circular' }
  circular.self = circular
  const nestedMap = new Map<string, unknown>([
    ['apiKey', 'map-secret'],
    ['safe', { password: 'nested-secret' }],
  ])

  logger.info('Logging smoke request.', {
    apiKey: 'top-secret',
    authorization: 'Bearer raw-token',
    url: 'https://user:pass@example.test/path?token=raw-query&safe=1',
    nestedMap,
    circular,
    payload: 'x'.repeat(20_000),
  })

  logger.warn('Logging smoke warning.', {
    error: new Error('Bearer raw-warning-token'),
  })

  const logFile = join(tempDir, 'smoke.log')
  assert.equal(existsSync(logFile), true)
  const content = readFileSync(logFile, 'utf8')
  assert.match(content, /"level":"info"/)
  assert.match(content, /"scope":"smoke"/)
  assert.match(content, /\[redacted\]/)
  assert.match(content, /\[truncated\]/)
  assert.equal(content.includes('top-secret'), false)
  assert.equal(content.includes('raw-token'), false)
  assert.equal(content.includes('raw-query'), false)
  assert.equal(content.includes('nested-secret'), false)
  assert.equal(content.includes('map-secret'), false)

  const invalidLogDir = join(tempDir, 'blocked.log')
  writeFileSync(invalidLogDir, 'not-a-directory')
  const failingSink = createElectronLogSink({
    logDir: invalidLogDir,
    appName: 'OpenOmniClawSmoke',
    fileName: 'failure.log',
    runtime: 'test',
  })
  const failingLogger = createProjectLogger({
    sink: failingSink,
    scope: 'smoke.failure',
  })
  failingLogger.error('Dropped write smoke.', { error: new Error('should not throw') })
  const failingStatus = failingSink.status()
  assert.equal(failingStatus.available, false)
  assert.ok(failingStatus.failedWriteCount > 0)
  assert.ok(failingStatus.droppedCount > 0)

  assertNoConsoleErrorUsage(['electron', 'core', 'shared', 'src', 'scripts'])

  console.log('Logging smoke check passed')
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}

function assertNoConsoleErrorUsage(paths: string[]): void {
  const forbidden = ['console', 'error'].join('.')
  const matches: string[] = []

  for (const root of paths) {
    walk(join(process.cwd(), root))
  }

  if (matches.length) {
    const label = ['console', 'error'].join('.')
    throw new Error(`${label} found in runtime sources:\n${matches.join('\n')}`)
  }

  function walk(current: string): void {
    if (!existsSync(current)) {
      return
    }

    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const fullPath = join(current, entry.name)
      if (entry.isDirectory()) {
        if (shouldSkipDirectory(entry.name)) {
          continue
        }
        walk(fullPath)
        continue
      }
      if (!isRelevantFile(entry.name)) {
        continue
      }
      const content = readFileSync(fullPath, 'utf8')
      if (content.includes(forbidden)) {
        matches.push(relative(process.cwd(), fullPath))
      }
    }
  }
}

function shouldSkipDirectory(name: string): boolean {
  return name === 'node_modules' || name === 'dist' || name === 'out' || name === '.git'
}

function isRelevantFile(name: string): boolean {
  return (
    name.endsWith('.ts') ||
    name.endsWith('.tsx') ||
    name.endsWith('.js') ||
    name.endsWith('.mjs') ||
    name.endsWith('.vue')
  )
}

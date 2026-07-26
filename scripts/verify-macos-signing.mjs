#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import process from 'node:process'

const options = parseArguments(process.argv.slice(2))
const releaseDir = resolve(options.releaseDir ?? 'release')

if (process.platform !== 'darwin') {
  fail('macOS signing verification must run on macOS')
}
if (!existsSync(releaseDir)) {
  fail(`Release directory does not exist: ${releaseDir}`)
}

const appBundles = findAppBundles(releaseDir)
if (appBundles.length === 0) {
  fail(`No OmniPaw.app bundle was found under ${releaseDir}`)
}

for (const appBundle of appBundles) {
  run('codesign', ['--verify', '--deep', '--strict', '--verbose=4', appBundle])

  const signature = run('codesign', ['--display', '--verbose=4', appBundle], {
    capture: true,
  })
  const isAdHoc = /(?:^|\n)Signature=adhoc(?:\n|$)/.test(signature.stderr)

  if (options.requireNotarization) {
    if (isAdHoc) {
      fail(`${appBundle} has an ad-hoc signature; a Developer ID signature is required`)
    }
    run('spctl', ['--assess', '--type', 'execute', '--verbose=4', appBundle])
    run('xcrun', ['stapler', 'validate', appBundle])
  }

  const omniInfer = join(appBundle, 'Contents', 'Resources', 'omniinfer', 'omniinfer')
  if (existsSync(omniInfer)) {
    run('codesign', ['--verify', '--strict', '--verbose=4', omniInfer])
    run(omniInfer, ['--version'])
  }

  process.stdout.write(
    `[mac-signing] verified ${appBundle} (${isAdHoc ? 'ad-hoc development' : 'Developer ID'})\n`
  )
}

function parseArguments(args) {
  const parsed = {
    releaseDir: undefined,
    requireNotarization: false,
  }

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--release-dir') {
      const value = args[index + 1]
      if (!value || value.startsWith('--')) {
        fail('--release-dir requires a value')
      }
      parsed.releaseDir = value
      index += 1
      continue
    }
    if (argument === '--require-notarization') {
      parsed.requireNotarization = true
      continue
    }
    if (argument === '--help') {
      process.stdout.write(
        [
          'Usage: node scripts/verify-macos-signing.mjs [options]',
          '',
          'Options:',
          '  --release-dir <directory>  Release output directory (default: release)',
          '  --require-notarization     Require Developer ID, Gatekeeper, and stapler checks',
          '',
        ].join('\n')
      )
      process.exit(0)
    }
    fail(`Unknown argument: ${argument}`)
  }

  return parsed
}

function findAppBundles(root) {
  const found = []
  const pending = [root]

  while (pending.length > 0) {
    const directory = pending.pop()
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const path = join(directory, entry.name)
      if (entry.name === 'OmniPaw.app') {
        found.push(path)
      } else if (!entry.name.endsWith('.app')) {
        pending.push(path)
      }
    }
  }

  return found.sort((left, right) => basename(left).localeCompare(basename(right)))
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  })
  if (result.error) {
    fail(`Failed to launch ${command}: ${result.error.message}`)
  }
  if (result.status !== 0) {
    const details = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
    fail(
      `${command} ${args.join(' ')} exited with status ${result.status}${
        details ? `:\n${details}` : ''
      }`
    )
  }
  return result
}

function fail(message) {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}

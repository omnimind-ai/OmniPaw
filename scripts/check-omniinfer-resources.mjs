#!/usr/bin/env node
// Pre-build guard: ensure resources/omniinfer/ contains a usable binary when bundling.
// Skip silently when OMNIPAW_BUNDLE_OMNIINFER=0 (slim variant) or when called without it
// in dev (build:slim opt-out).

import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

const flag = (process.env.OMNIPAW_BUNDLE_OMNIINFER ?? '1').trim()
const bundleOmniInfer = flag !== '0' && flag.toLowerCase() !== 'false'

if (!bundleOmniInfer) {
  console.log('[omniinfer] OMNIPAW_BUNDLE_OMNIINFER=0; skipping resource check.')
  process.exit(0)
}

const ROOT = process.cwd()
const RESOURCE_DIR = join(ROOT, 'resources', 'omniinfer')
const BINARY_NAMES_WINDOWS = ['OmniInfer.exe', 'omniinfer.exe', 'omniinfer-cli.exe']
const BINARY_NAMES_POSIX = ['OmniInfer', 'omniinfer', 'omniinfer-cli']
const expected = process.platform === 'win32' ? BINARY_NAMES_WINDOWS : BINARY_NAMES_POSIX

if (!existsSync(RESOURCE_DIR)) {
  console.error(
    `[omniinfer] resources/omniinfer/ does not exist.\n` +
      `  Either set OMNIPAW_BUNDLE_OMNIINFER=0 to build a slim variant, or place an\n` +
      `  OmniInfer release into resources/omniinfer/ and retry.`
  )
  process.exit(2)
}

const entries = readdirSync(RESOURCE_DIR).filter((name) => name !== '.gitkeep')
if (entries.length === 0) {
  console.error('[omniinfer] resources/omniinfer/ is empty.')
  process.exit(2)
}

const present = entries.some((name) => {
  const candidate = join(RESOURCE_DIR, name)
  return expected.includes(name) && statSync(candidate).isFile()
})

if (!present) {
  console.warn(
    `[omniinfer] No expected binary (${expected.join('/')}) found in resources/omniinfer/.\n` +
      `  The bundled package will install but the OmniInfer runtime will report "not_bundled".\n` +
      `  Continuing build.`
  )
} else {
  console.log('[omniinfer] resources/omniinfer/ contents look ready for bundling.')
}
process.exit(0)

#!/usr/bin/env node
// Cross-platform wrapper that sets OMNICLAW_BUNDLE_OMNIINFER then runs the build pipeline:
//   pnpm rebuild:electron && pnpm build && electron-builder --config electron-builder.config.cjs
//
// Usage:
//   node scripts/build-with-omniinfer-variant.mjs full
//   node scripts/build-with-omniinfer-variant.mjs slim

import { spawn } from 'node:child_process'
import process from 'node:process'

const variant = process.argv[2]
if (variant !== 'full' && variant !== 'slim') {
  console.error('Usage: node scripts/build-with-omniinfer-variant.mjs <full|slim>')
  process.exit(64)
}

const env = {
  ...process.env,
  OMNICLAW_BUNDLE_OMNIINFER: variant === 'full' ? '1' : '0',
}

const isWindows = process.platform === 'win32'
const pnpmCmd = isWindows ? 'pnpm.cmd' : 'pnpm'
const builderCmd = isWindows ? 'electron-builder.cmd' : 'electron-builder'

const sequence = [
  variant === 'full'
    ? { cmd: process.execPath, args: ['scripts/check-omniinfer-resources.mjs'] }
    : null,
  { cmd: pnpmCmd, args: ['rebuild:electron'] },
  { cmd: pnpmCmd, args: ['build'] },
  { cmd: builderCmd, args: ['--config', 'electron-builder.config.cjs'] },
].filter(Boolean)

let i = 0

function runNext() {
  if (i >= sequence.length) {
    process.exit(0)
  }
  const step = sequence[i++]
  console.log(`[build:${variant}]`, step.cmd, step.args.join(' '))
  const child = spawn(step.cmd, step.args, { stdio: 'inherit', env, shell: false })
  child.on('error', (error) => {
    console.error(`[build:${variant}] failed to launch:`, error.message)
    process.exit(1)
  })
  child.on('exit', (code) => {
    if (code !== 0) {
      console.error(`[build:${variant}] step exited with ${code}`)
      process.exit(code ?? 1)
    }
    runNext()
  })
}

runNext()

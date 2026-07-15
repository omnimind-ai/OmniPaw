#!/usr/bin/env node
// Cross-platform wrapper that sets OMNIPAW_BUNDLE_OMNIINFER then runs the build pipeline:
//   pnpm rebuild:electron && pnpm build && pnpm exec electron-builder --config electron-builder.config.cjs
//
// Usage:
//   node scripts/build-with-omniinfer-variant.mjs full
//   node scripts/build-with-omniinfer-variant.mjs slim

import { spawn } from 'node:child_process'
import process from 'node:process'

import { spawnPnpm } from './spawn-pnpm.mjs'

const variant = process.argv[2]
if (variant !== 'full' && variant !== 'slim') {
  console.error('Usage: node scripts/build-with-omniinfer-variant.mjs <full|slim>')
  process.exit(64)
}

const env = {
  ...process.env,
  OMNIPAW_BUNDLE_OMNIINFER: variant === 'full' ? '1' : '0',
}

const sequence = [
  variant === 'full'
    ? { cmd: process.execPath, args: ['scripts/check-omniinfer-resources.mjs'] }
    : null,
  { pnpmArgs: ['rebuild:electron'] },
  { pnpmArgs: ['build'] },
  { pnpmArgs: ['exec', 'electron-builder', '--config', 'electron-builder.config.cjs'] },
].filter(Boolean)

let i = 0

function runNext() {
  if (i >= sequence.length) {
    process.exit(0)
  }
  const step = sequence[i++]
  const command = step.pnpmArgs
    ? `pnpm ${step.pnpmArgs.join(' ')}`
    : `${step.cmd} ${step.args.join(' ')}`
  console.log(`[build:${variant}]`, command)
  const child = step.pnpmArgs
    ? spawnPnpm(step.pnpmArgs, { stdio: 'inherit', env })
    : spawn(step.cmd, step.args, { stdio: 'inherit', env, shell: false })
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

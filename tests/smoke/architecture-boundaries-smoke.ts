import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

function listTypeScriptFiles(root: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) {
      files.push(...listTypeScriptFiles(path))
    } else if (entry.isFile() && path.endsWith('.ts')) {
      files.push(path)
    }
  }
  return files
}

for (const file of listTypeScriptFiles('core')) {
  const source = readFileSync(file, 'utf8')
  assert.doesNotMatch(source, /from ['"]electron(?:\/[^'"]*)?['"]/, `${file} imports Electron`)
  assert.doesNotMatch(
    source,
    /from ['"]electron-log(?:\/[^'"]*)?['"]/,
    `${file} imports electron-log`
  )
}

assert.equal(existsSync('core/chat/stream-handler.ts'), false)
assert.equal(existsSync('core/logging/electron-log-adapter.ts'), false)
assert.equal(existsSync('electron/logging/electron-log-adapter.ts'), true)

const sharedBridge = readFileSync('shared/types/bridge.ts', 'utf8')
const rendererBridge = readFileSync('src/bridge/app.ts', 'utf8')
const windowTypes = readFileSync('src/types/window.d.ts', 'utf8')
const preload = readFileSync('electron/preload.ts', 'utf8')

assert.match(sharedBridge, /export interface OmniPawBridge/)
assert.match(rendererBridge, /import type \{ OmniPawBridge \} from '@shared\/types\/bridge'/)
assert.match(rendererBridge, /export const appBridge: OmniPawBridge/)
assert.doesNotMatch(rendererBridge, /interface RendererOmniPawBridge/)
assert.match(windowTypes, /import type \{ OmniPawBridge \} from '@shared\/types\/bridge'/)
assert.match(preload, /const bridge: OmniPawBridge/)

console.log('Architecture boundary smoke check passed')

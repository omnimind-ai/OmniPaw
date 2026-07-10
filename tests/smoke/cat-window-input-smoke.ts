import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { IPC_CHANNELS } from '../../shared/constants'

const main = readFileSync('electron/cat-window.ts', 'utf8')
const preload = readFileSync('electron/preload.ts', 'utf8')
const bridgeTypes = readFileSync('shared/types/bridge.ts', 'utf8')
const renderWindow = readFileSync('src/catwindow/cat-window.ts', 'utf8')
const hitWindow = readFileSync('src/catwindow/cat-hit-window.ts', 'utf8')
const viteConfig = readFileSync('electron.vite.config.ts', 'utf8')

assert.equal(IPC_CHANNELS.cat.setHitArea, 'cat:set-hit-area')
assert.equal(IPC_CHANNELS.cat.setInteractionState, 'cat:set-interaction-state')

assert.match(main, /function createCatHitWindow/)
assert.match(main, /catWindow\.setIgnoreMouseEvents\(true\)/)
assert.match(main, /catHitWindow\.setIgnoreMouseEvents\(false\)/)
assert.match(main, /window\.setShape/)
assert.match(main, /screen\.getCursorScreenPoint\(\)/)
assert.match(main, /catTopmostWatchdogMs/)
assert.match(main, /event\.sender\.id === catWindow\.webContents\.id/)
assert.match(main, /event\.sender\.id === catHitWindow\.webContents\.id/)

assert.match(preload, /IPC_CHANNELS\.cat\.setHitArea/)
assert.match(preload, /IPC_CHANNELS\.cat\.setInteractionState/)
assert.match(bridgeTypes, /setHitArea:/)
assert.match(bridgeTypes, /setInteractionState:/)
assert.match(viteConfig, /cat-hit-window\.html/)

assert.doesNotMatch(renderWindow, /addEventListener\('pointerdown'/)
assert.match(renderWindow, /appBridge\.cat\.setHitArea/)
assert.match(hitWindow, /requestAnimationFrame/)
assert.match(hitWindow, /appBridge\.cat\.dragMove\(\)/)
assert.match(hitWindow, /addEventListener\('drop'/)

console.log('Cat window input layering smoke check passed')

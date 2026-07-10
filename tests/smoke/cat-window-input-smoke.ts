import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { IPC_CHANNELS } from '../../shared/constants'

const main = readFileSync('packages/desktop-pet/electron/controller.ts', 'utf8')
const preload = readFileSync('electron/preload.ts', 'utf8')
const bridgeTypes = readFileSync('shared/types/bridge.ts', 'utf8')
const renderEntry = readFileSync('packages/desktop-pet/renderer/visual/index.ts', 'utf8')
const renderHtml = readFileSync('packages/desktop-pet/entries/cat-window.html', 'utf8')
const renderStateMachine = readFileSync(
  'packages/desktop-pet/renderer/visual/state-machine.ts',
  'utf8'
)
const renderView = readFileSync('packages/desktop-pet/renderer/visual/view.ts', 'utf8')
const hitEntry = readFileSync('packages/desktop-pet/renderer/input/index.ts', 'utf8')
const hitHtml = readFileSync('packages/desktop-pet/entries/cat-hit-window.html', 'utf8')
const pointerDrag = readFileSync(
  'packages/desktop-pet/renderer/input/pointer-drag-controller.ts',
  'utf8'
)
const fileDrop = readFileSync('packages/desktop-pet/renderer/input/file-drop-controller.ts', 'utf8')
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
assert.match(viteConfig, /packages\/desktop-pet\/entries\/cat-hit-window\.html/)

assert.doesNotMatch(renderEntry, /addEventListener\('pointerdown'/)
assert.doesNotMatch(renderEntry, /import ['"]\.\/styles\.css['"]/)
assert.match(renderHtml, /href="\.\.\/renderer\/visual\/styles\.css"/)
assert.match(renderEntry, /appBridge\.cat\.setHitArea/)
assert.match(renderStateMachine, /createCatVisualStateMachine/)
assert.doesNotMatch(renderStateMachine, /querySelector|classList/)
assert.match(renderView, /getBoundingClientRect/)
assert.match(hitEntry, /createPointerDragController/)
assert.match(hitEntry, /createFileDropController/)
assert.doesNotMatch(hitEntry, /import ['"]\.\/styles\.css['"]/)
assert.match(hitHtml, /href="\.\.\/renderer\/input\/styles\.css"/)
assert.match(pointerDrag, /requestAnimationFrame/)
assert.match(pointerDrag, /appBridge\.cat\.dragMove\(\)/)
assert.match(fileDrop, /addEventListener\('drop'/)

console.log('Cat window input layering smoke check passed')

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolveCatDockTargetX } from '../../packages/desktop-pet/electron/hit-geometry'
import {
  findAlphaContentBounds,
  normalizeAlphaBoundsForContain,
  resolveNormalizedHitArea,
  unionNormalizedBounds,
} from '../../packages/desktop-pet/renderer/visual/alpha-hit-area'
import { IPC_CHANNELS } from '../../shared/constants'

const main = readFileSync('packages/desktop-pet/electron/controller.ts', 'utf8')
const electronMain = readFileSync('electron/main.ts', 'utf8')
const preload = readFileSync('electron/preload.ts', 'utf8')
const bridgeTypes = readFileSync('shared/types/bridge.ts', 'utf8')
const renderEntry = readFileSync('packages/desktop-pet/renderer/visual/index.ts', 'utf8')
const renderHtml = readFileSync('packages/desktop-pet/entries/cat-window.html', 'utf8')
const renderStateMachine = readFileSync(
  'packages/desktop-pet/renderer/visual/state-machine.ts',
  'utf8'
)
const renderView = readFileSync('packages/desktop-pet/renderer/visual/view.ts', 'utf8')
const renderStyles = readFileSync('packages/desktop-pet/renderer/visual/styles.css', 'utf8')
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
assert.match(main, /function getCatDockSide/)
assert.match(main, /dockSide: getCatDockSide\(catWindow\.getBounds\(\)\)/)
assert.match(main, /resolveCatDockTargetX\(workArea, dockSide, catVisualAreas\[dockSide\]\)/)
assert.match(main, /function setCatHitGeometry/)
assert.match(main, /catTopmostWatchdogMs/)
assert.match(electronMain, /scheme: CAT_APPEARANCE_ASSET_PROTOCOL[\s\S]*?corsEnabled: true/)
assert.match(electronMain, /'Access-Control-Allow-Origin': '\*'/)
assert.match(main, /event\.sender\.id === catWindow\.webContents\.id/)
assert.match(main, /event\.sender\.id === catHitWindow\.webContents\.id/)

assert.match(preload, /IPC_CHANNELS\.cat\.setHitArea/)
assert.match(preload, /IPC_CHANNELS\.cat\.setInteractionState/)
assert.match(bridgeTypes, /setHitArea:/)
assert.match(bridgeTypes, /CatHitGeometry/)
assert.match(bridgeTypes, /setInteractionState:/)
assert.match(viteConfig, /packages\/desktop-pet\/entries\/cat-hit-window\.html/)

assert.doesNotMatch(renderEntry, /addEventListener\('pointerdown'/)
assert.doesNotMatch(renderEntry, /import ['"]\.\/styles\.css['"]/)
assert.match(renderHtml, /href="\.\.\/renderer\/visual\/styles\.css"/)
assert.match(renderEntry, /appBridge\.cat\.setHitArea/)
assert.match(renderEntry, /view\.applyDockSide\(event\.dockSide\)/)
assert.match(renderStateMachine, /createCatVisualStateMachine/)
assert.doesNotMatch(renderStateMachine, /querySelector|classList/)
assert.match(renderView, /getBoundingClientRect/)
assert.match(renderView, /image\.addEventListener\('load', handleImageLoad\)/)
assert.match(renderView, /findAlphaContentBounds/)
assert.match(renderView, /unionNormalizedBounds/)
assert.match(renderView, /visualAreas/)
assert.match(renderView, /maxMeasurementDimension = 512/)
assert.match(renderView, /surface\.classList\.toggle\('is-docked-left', side === 'left'\)/)
assert.match(renderStyles, /scaleX\(var\(--cat-facing-scale-x, 1\)\)/)
assert.match(hitEntry, /createPointerDragController/)
assert.match(hitEntry, /createFileDropController/)
assert.doesNotMatch(hitEntry, /import ['"]\.\/styles\.css['"]/)
assert.match(hitHtml, /href="\.\.\/renderer\/input\/styles\.css"/)
assert.match(pointerDrag, /requestAnimationFrame/)
assert.match(pointerDrag, /appBridge\.cat\.dragMove\(\)/)
assert.match(fileDrop, /addEventListener\('drop'/)

const alphaPixels = new Uint8ClampedArray(100 * 100 * 4)
for (let y = 10; y < 90; y += 1) {
  for (let x = 20; x < 80; x += 1) {
    alphaPixels[(y * 100 + x) * 4 + 3] = 255
  }
}
alphaPixels[3] = 255
assert.deepEqual(findAlphaContentBounds(alphaPixels, 100, 100), {
  x: 20,
  y: 10,
  width: 60,
  height: 80,
})

const faintPixels = new Uint8ClampedArray(4 * 4 * 4)
faintPixels[3] = 23
assert.equal(findAlphaContentBounds(faintPixels, 4, 4), null)

const containedBounds = normalizeAlphaBoundsForContain(
  { x: 50, y: 0, width: 100, height: 100 },
  200,
  100
)
assert.deepEqual(containedBounds, { x: 0.25, y: 0.25, width: 0.5, height: 0.5 })
assert.deepEqual(
  unionNormalizedBounds(containedBounds ?? undefined, {
    x: 0.1,
    y: 0.4,
    width: 0.2,
    height: 0.4,
  }),
  { x: 0.1, y: 0.25, width: 0.65, height: 0.55 }
)

const frame = { left: 10, top: 20, width: 80, height: 80 }
const viewport = { width: 116, height: 116 }
const normalized = { x: 0.1, y: 0.2, width: 0.4, height: 0.5 }
assert.deepEqual(resolveNormalizedHitArea(normalized, frame, viewport, { padding: 2 }), {
  x: 16,
  y: 34,
  width: 36,
  height: 44,
})
assert.deepEqual(
  resolveNormalizedHitArea(normalized, frame, viewport, { mirrored: true, padding: 2 }),
  { x: 48, y: 34, width: 36, height: 44 }
)

const workArea = { x: 0, y: 0, width: 1920, height: 1040 }
const visualArea = { x: 38, y: 20, width: 60, height: 70 }
assert.equal(resolveCatDockTargetX(workArea, 'left', visualArea), -38)
assert.equal(resolveCatDockTargetX(workArea, 'right', visualArea), 1822)

console.log('Cat window input layering smoke check passed')

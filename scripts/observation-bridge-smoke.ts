import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { IPC_CHANNELS } from '../shared/constants'

const preload = readFileSync('electron/preload.ts', 'utf8')
const bridgeTypes = readFileSync('shared/types/bridge.ts', 'utf8')
const rendererBridge = readFileSync('src/bridge/app.ts', 'utf8')
const observationCore = readFileSync('core/observation/manager.ts', 'utf8')

assert.equal(IPC_CHANNELS.observation.permissionStatus, 'observation:permission-status')
assert.equal(IPC_CHANNELS.observation.status, 'observation:status')
assert.equal(IPC_CHANNELS.observation.start, 'observation:start')
assert.equal(IPC_CHANNELS.observation.stop, 'observation:stop')
assert.equal(IPC_CHANNELS.observation.trigger, 'observation:trigger')
assert.equal(IPC_CHANNELS.observation.changed, 'observation:changed')
assert.equal(IPC_CHANNELS.cat.observationReaction, 'cat:observation-reaction')

for (const channel of ['permissionStatus', 'status', 'start', 'stop', 'trigger', 'onChanged']) {
  assert.match(bridgeTypes, new RegExp(`${channel}:`))
  assert.match(rendererBridge, new RegExp(`${channel}:`))
}

assert.match(preload, /IPC_CHANNELS\.observation\.start/)
assert.match(preload, /IPC_CHANNELS\.observation\.changed/)
assert.match(preload, /IPC_CHANNELS\.cat\.observationReaction/)
assert.match(rendererBridge, /rejectFallbackPersistence<ObservationState>\('observation\.start'\)/)
assert.doesNotMatch(observationCore, /from 'electron'|from "electron"/)
assert.doesNotMatch(rendererBridge, /desktopCapturer/)

console.log('Observation bridge smoke check passed')

import assert from 'node:assert/strict'

import type { CatWindowState } from '@shared/types/cat'
import type { CatVisualAppearance } from '../../packages/desktop-pet/renderer/visual/appearance'
import {
  type CatVisualFrame,
  createCatVisualStateMachine,
} from '../../packages/desktop-pet/renderer/visual/state-machine'

interface Scheduled {
  id: number
  at: number
  callback: () => void
}

let now = 0
let nextTimerId = 1
const scheduled: Scheduled[] = []

const fakeWindow = {
  performance: {
    now: () => now,
  },
  setTimeout(callback: () => void, delay: number) {
    const id = nextTimerId++
    scheduled.push({ id, at: now + delay, callback })
    return id
  },
  clearTimeout(id: number) {
    const index = scheduled.findIndex((timer) => timer.id === id)
    if (index >= 0) scheduled.splice(index, 1)
  },
}

Object.defineProperty(globalThis, 'window', {
  value: fakeWindow,
  configurable: true,
})

function advance(milliseconds: number): void {
  const target = now + milliseconds
  while (true) {
    scheduled.sort((left, right) => left.at - right.at || left.id - right.id)
    const timer = scheduled[0]
    if (!timer || timer.at > target) break
    scheduled.shift()
    now = timer.at
    timer.callback()
  }
  now = target
}

const appearance: CatVisualAppearance = {
  assets: {
    show: 'show',
    showFallback: 'show-fallback',
    idle: 'idle',
    dragTransition: 'drag-transition',
    drag: 'drag',
    dragFallback: 'drag-fallback',
    startDoing: 'start-doing',
    doing: 'doing',
    doingFallback: 'doing-fallback',
    endDoing: 'end-doing',
    finish: 'finish',
  },
  durations: {
    appearing: 100,
    dragTransition: 110,
    preparing: 130,
    runningLoop: 160,
    completedEnd: 90,
    completedFinish: 150,
  },
  layout: {
    scale: 1,
  },
}

const frames: CatVisualFrame[] = []
const states: CatWindowState[] = []
const machine = createCatVisualStateMachine({
  appearance,
  render: (frame) => frames.push(frame),
  reportState: (state) => states.push(state),
  now: () => now,
})

machine.handleCommand({ state: 'idle' })
assert.equal(frames.at(-1)?.source, 'show')
advance(100)
assert.equal(frames.at(-1)?.source, 'idle')

machine.handleCommand({ state: 'preparing' })
machine.handleCommand({ state: 'running' })
machine.handleCommand({ state: 'completed' })
assert.equal(frames.at(-1)?.source, 'start-doing')

machine.applyAppearance({
  ...appearance,
  assets: {
    ...appearance.assets,
    idle: 'changed-idle',
  },
})
assert.equal(frames.at(-1)?.source, 'start-doing')
assert.equal(frames.at(-1)?.transition, 'fade-out-in')

advance(130)
assert.equal(frames.at(-1)?.source, 'doing')
advance(159)
assert.equal(frames.at(-1)?.source, 'doing')
advance(1)
assert.equal(frames.at(-1)?.source, 'end-doing')
advance(90)
assert.equal(frames.at(-1)?.source, 'finish')
advance(150)
assert.equal(frames.at(-1)?.source, 'changed-idle')
assert.equal(states.at(-1), 'idle')

machine.dispose()
assert.equal(scheduled.length, 0)

console.log('Cat visual state-machine continuity smoke check passed')

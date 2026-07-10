import type { CatCommandEvent, CatWindowState } from '@shared/types/cat'
import type { CatVisualAppearance } from './appearance'

export interface CatVisualFrame {
  state: CatWindowState
  source: string
  fallback: string
}

interface CatVisualStateMachineOptions {
  appearance: CatVisualAppearance
  render: (frame: CatVisualFrame) => void
  reportState: (state: CatWindowState) => void
}

export interface CatVisualStateMachine {
  applyAppearance: (appearance: CatVisualAppearance) => void
  handleCommand: (event: CatCommandEvent) => void
  dispose: () => void
}

const validStates = new Set<CatWindowState>([
  'hidden',
  'appearing',
  'idle',
  'dragging',
  'preparing',
  'running',
  'completed',
])

export function createCatVisualStateMachine(
  options: CatVisualStateMachineOptions
): CatVisualStateMachine {
  let appearance = options.appearance
  let currentState: CatWindowState = 'hidden'
  let firstShow = true
  let stateTimer: ReturnType<typeof window.setTimeout> | undefined

  function clearStateTimer(): void {
    if (stateTimer === undefined) return
    window.clearTimeout(stateTimer)
    stateTimer = undefined
  }

  function render(source: string, fallback = appearance.assets.idle): void {
    options.render({ state: currentState, source, fallback })
  }

  function schedule(delayMs: number, callback: () => void): void {
    stateTimer = window.setTimeout(callback, delayMs)
  }

  function enterState(state: CatWindowState): void {
    if (!validStates.has(state)) return

    clearStateTimer()
    currentState = state
    options.reportState(state)

    switch (state) {
      case 'hidden':
      case 'idle':
        render(appearance.assets.idle)
        break
      case 'appearing':
        render(appearance.assets.show, appearance.assets.showFallback)
        schedule(appearance.durations.appearing, () => {
          firstShow = false
          enterState('idle')
        })
        break
      case 'dragging':
        if (!appearance.assets.dragTransition) {
          render(appearance.assets.drag, appearance.assets.dragFallback)
          break
        }
        render(appearance.assets.dragTransition, appearance.assets.dragFallback)
        schedule(appearance.durations.dragTransition, () => {
          if (currentState === 'dragging') {
            render(appearance.assets.drag, appearance.assets.dragFallback)
          }
        })
        break
      case 'preparing':
        render(appearance.assets.startDoing, appearance.assets.doingFallback)
        schedule(appearance.durations.preparing, () => {
          if (currentState === 'preparing') {
            render(appearance.assets.doingFallback)
          }
        })
        break
      case 'running':
        render(appearance.assets.doing, appearance.assets.doingFallback)
        break
      case 'completed':
        render(appearance.assets.endDoing, appearance.assets.doingFallback)
        schedule(appearance.durations.completedEnd, () => {
          if (currentState !== 'completed') return
          render(appearance.assets.finish, appearance.assets.idle)
          schedule(appearance.durations.completedFinish, () => {
            if (currentState === 'completed') enterState('idle')
          })
        })
        break
    }
  }

  return {
    applyAppearance(nextAppearance) {
      appearance = nextAppearance
      enterState(currentState)
    },
    handleCommand(event) {
      if (!validStates.has(event.state)) return
      if (event.state === 'idle' && firstShow && currentState === 'hidden') {
        enterState('appearing')
        return
      }
      enterState(event.state)
    },
    dispose() {
      clearStateTimer()
    },
  }
}

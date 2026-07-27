import type { CatCommandEvent, CatWindowState } from '@shared/types/cat'
import type { CatVisualAppearance } from './appearance'

export interface CatVisualFrame {
  state: CatWindowState
  source: string
  fallback: string
  transition: CatVisualTransition
}

export type CatVisualTransition = 'replace' | 'fade-out-in'

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

  function render(
    source: string,
    fallback = appearance.assets.idle,
    transition: CatVisualTransition = 'replace'
  ): void {
    options.render({ state: currentState, source, fallback, transition })
  }

  function schedule(delayMs: number, callback: () => void): void {
    stateTimer = window.setTimeout(callback, delayMs)
  }

  function enterState(state: CatWindowState, transition: CatVisualTransition = 'replace'): void {
    if (!validStates.has(state)) return

    clearStateTimer()
    currentState = state
    options.reportState(state)

    switch (state) {
      case 'hidden':
      case 'idle':
        render(appearance.assets.idle, appearance.assets.idle, transition)
        break
      case 'appearing':
        render(appearance.assets.show, appearance.assets.showFallback, transition)
        schedule(appearance.durations.appearing, () => {
          firstShow = false
          enterState('idle')
        })
        break
      case 'dragging':
        if (!appearance.assets.dragTransition) {
          render(appearance.assets.drag, appearance.assets.dragFallback, transition)
          break
        }
        render(appearance.assets.dragTransition, appearance.assets.dragFallback, transition)
        schedule(appearance.durations.dragTransition, () => {
          if (currentState === 'dragging') {
            render(appearance.assets.drag, appearance.assets.dragFallback)
          }
        })
        break
      case 'preparing':
        render(appearance.assets.startDoing, appearance.assets.doingFallback, transition)
        schedule(appearance.durations.preparing, () => {
          if (currentState === 'preparing') {
            render(appearance.assets.doingFallback)
          }
        })
        break
      case 'running':
        render(appearance.assets.doing, appearance.assets.doingFallback, transition)
        break
      case 'completed':
        render(appearance.assets.endDoing, appearance.assets.doingFallback, transition)
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
      const assetsChanged = catVisualAssetsChanged(appearance, nextAppearance)
      appearance = nextAppearance
      if (!assetsChanged) return
      enterState(currentState, 'fade-out-in')
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

export function catVisualAssetsChanged(
  current: CatVisualAppearance,
  next: CatVisualAppearance
): boolean {
  const assetKeys = new Set([...Object.keys(current.assets), ...Object.keys(next.assets)])
  return [...assetKeys].some(
    (key) =>
      current.assets[key as keyof CatVisualAppearance['assets']] !==
      next.assets[key as keyof CatVisualAppearance['assets']]
  )
}

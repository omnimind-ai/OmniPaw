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
  now?: () => number
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
  let pendingTaskState: Extract<CatWindowState, 'running' | 'completed'> | undefined
  let preparingTransitionComplete = false
  let runningStartedAt: number | undefined
  const now = options.now ?? (() => performance.now())

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

  function queueCompletionAtLoopBoundary(): void {
    if (currentState !== 'running') return

    pendingTaskState = 'completed'
    clearStateTimer()
    const loopDuration = appearance.durations.runningLoop
    if (loopDuration <= 0 || runningStartedAt === undefined) {
      enterState('completed')
      return
    }

    const elapsed = Math.max(0, now() - runningStartedAt)
    const phase = elapsed % loopDuration
    const remaining = phase < 1 ? loopDuration : loopDuration - phase
    schedule(remaining, () => {
      if (currentState !== 'running' || pendingTaskState !== 'completed') return
      enterState('completed')
    })
  }

  function enterState(state: CatWindowState, transition: CatVisualTransition = 'replace'): void {
    if (!validStates.has(state)) return

    clearStateTimer()
    pendingTaskState = undefined
    preparingTransitionComplete = false
    if (state !== 'running') runningStartedAt = undefined
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
          if (currentState !== 'preparing') return
          preparingTransitionComplete = true
          const requestedState = pendingTaskState
          pendingTaskState = undefined
          if (requestedState === 'running') {
            enterState('running')
            return
          }
          if (requestedState === 'completed') {
            enterState('running')
            queueCompletionAtLoopBoundary()
            return
          }
          render(appearance.assets.doingFallback)
        })
        break
      case 'running':
        runningStartedAt = now()
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
      const queuedTaskState = pendingTaskState
      appearance = nextAppearance
      if (!assetsChanged) return
      enterState(currentState, 'fade-out-in')
      if (currentState === 'preparing') {
        pendingTaskState = queuedTaskState
      } else if (currentState === 'running' && queuedTaskState === 'completed') {
        queueCompletionAtLoopBoundary()
      }
    },
    handleCommand(event) {
      if (!validStates.has(event.state)) return
      if (event.state === 'idle' && firstShow && currentState === 'hidden') {
        enterState('appearing')
        return
      }
      if (event.state === currentState) return
      if (
        currentState === 'preparing' &&
        (event.state === 'running' || event.state === 'completed')
      ) {
        if (preparingTransitionComplete) {
          enterState('running')
          if (event.state === 'completed') queueCompletionAtLoopBoundary()
        } else {
          pendingTaskState = event.state
        }
        return
      }
      if (currentState === 'running' && event.state === 'completed') {
        queueCompletionAtLoopBoundary()
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

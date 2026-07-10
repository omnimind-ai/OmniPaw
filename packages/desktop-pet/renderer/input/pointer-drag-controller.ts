import type { CatTaskState } from '@shared/types/cat'
import { appBridge } from '@/bridge/app'

interface PointerDragControllerOptions {
  area: HTMLElement
  stableState: () => CatTaskState
}

export interface PointerDragController {
  dispose: () => void
}

interface DragSession {
  pointerId: number
  startClientX: number
  startClientY: number
  active: boolean
  startPromise: Promise<unknown>
}

const dragThreshold = 4

export function createPointerDragController(
  options: PointerDragControllerOptions
): PointerDragController {
  const { area } = options
  let dragMoveScheduled = false
  let dragMoveInFlight = false
  let dragMovePending = false
  let dragSession: DragSession | undefined

  function queueDragMove(): void {
    dragMovePending = true
    if (dragMoveScheduled || dragMoveInFlight) return

    dragMoveScheduled = true
    window.requestAnimationFrame(async () => {
      dragMoveScheduled = false
      if (!dragSession?.active) {
        dragMovePending = false
        return
      }

      dragMovePending = false
      dragMoveInFlight = true
      try {
        await appBridge.cat.dragMove()
      } finally {
        dragMoveInFlight = false
        if (dragMovePending && dragSession?.active) queueDragMove()
      }
    })
  }

  async function stopPointerDrag(pointerId?: number): Promise<void> {
    if (!dragSession || (pointerId !== undefined && dragSession.pointerId !== pointerId)) return

    const session = dragSession
    dragSession = undefined
    dragMovePending = false
    area.classList.remove('is-dragging')

    try {
      await session.startPromise
    } catch {
      return
    }

    await appBridge.cat.dragEnd().catch(() => null)
    if (session.active) {
      await appBridge.cat.setInteractionState(options.stableState()).catch(() => undefined)
    }
  }

  function handlePointerDown(event: PointerEvent): void {
    if (event.button !== 0 || dragSession) return
    area.setPointerCapture(event.pointerId)
    dragSession = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      active: false,
      startPromise: appBridge.cat.dragStart(),
    }
  }

  function handlePointerMove(event: PointerEvent): void {
    if (!dragSession || dragSession.pointerId !== event.pointerId) return

    const deltaX = Math.abs(event.clientX - dragSession.startClientX)
    const deltaY = Math.abs(event.clientY - dragSession.startClientY)
    if (!dragSession.active && Math.max(deltaX, deltaY) > dragThreshold) {
      dragSession.active = true
      area.classList.add('is-dragging')
      void appBridge.cat.setInteractionState('dragging')
    }
    if (dragSession.active) queueDragMove()
  }

  function handlePointerUp(event: PointerEvent): void {
    if (event.button === 0) void stopPointerDrag(event.pointerId)
  }

  function handlePointerEnd(event: PointerEvent): void {
    void stopPointerDrag(event.pointerId)
  }

  function handleWindowBlur(): void {
    void stopPointerDrag()
  }

  area.addEventListener('pointerdown', handlePointerDown)
  document.addEventListener('pointermove', handlePointerMove)
  document.addEventListener('pointerup', handlePointerUp)
  area.addEventListener('pointercancel', handlePointerEnd)
  area.addEventListener('lostpointercapture', handlePointerEnd)
  window.addEventListener('blur', handleWindowBlur)

  return {
    dispose() {
      area.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('pointerup', handlePointerUp)
      area.removeEventListener('pointercancel', handlePointerEnd)
      area.removeEventListener('lostpointercapture', handlePointerEnd)
      window.removeEventListener('blur', handleWindowBlur)
      void stopPointerDrag()
    },
  }
}

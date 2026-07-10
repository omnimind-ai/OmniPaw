import type { CatCommandEvent, CatTaskState } from '@shared/types/cat'
import { appBridge } from '@/bridge/app'
import { createFileDropController } from './file-drop-controller'
import { createPointerDragController } from './pointer-drag-controller'

const area = document.querySelector<HTMLElement>('#cat-hit-area')
if (!area) throw new Error('Desktop pet input area is missing')

const taskStates = new Set<CatTaskState>(['idle', 'preparing', 'running', 'completed'])
let stableState: CatTaskState = 'idle'

function handleCommand(event: CatCommandEvent): void {
  if (taskStates.has(event.state as CatTaskState)) stableState = event.state as CatTaskState
}

function handleContextMenu(event: MouseEvent): void {
  event.preventDefault()
  void appBridge.cat.togglePanel()
}

const controllerOptions = {
  area,
  stableState: () => stableState,
}
const pointerDragController = createPointerDragController(controllerOptions)
const fileDropController = createFileDropController(controllerOptions)
const unsubscribeCommand = appBridge.cat.onCommand(handleCommand)

area.addEventListener('contextmenu', handleContextMenu)
window.addEventListener(
  'beforeunload',
  () => {
    area.removeEventListener('contextmenu', handleContextMenu)
    unsubscribeCommand()
    pointerDragController.dispose()
    fileDropController.dispose()
  },
  { once: true }
)

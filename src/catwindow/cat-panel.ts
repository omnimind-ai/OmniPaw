import { appBridge } from '@/bridge/app'
import type { CatPanelPlacement, CatTaskState } from '@shared/types/cat'

const panel = document.querySelector<HTMLElement>('#cat-panel')
const sideNode = document.querySelector<HTMLElement>('#panel-side')

const sideLabels: Record<NonNullable<CatPanelPlacement['side']>, string> = {
  left: '左侧',
  right: '右侧',
}

function applyPlacement(placement: CatPanelPlacement) {
  if (!panel || !sideNode) {
    return
  }

  const side = placement.side === 'left' ? 'left' : 'right'

  panel.dataset.side = side
  sideNode.textContent = sideLabels[side]
}

function setCatState(state: CatTaskState) {
  void appBridge.cat.setState(state)
}

panel?.querySelectorAll<HTMLButtonElement>('[data-cat-state]').forEach((button) => {
  button.addEventListener('click', () => {
    const state = button.dataset.catState as CatTaskState | undefined
    if (!state) {
      return
    }

    setCatState(state)
  })
})

panel?.querySelectorAll<HTMLButtonElement>('[data-cat-action="hide"]').forEach((button) => {
  button.addEventListener('click', () => {
    void appBridge.cat.hide()
  })
})

appBridge.catPanel.onPlacement(applyPlacement)

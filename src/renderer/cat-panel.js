const panelApi = window.openOmniClaw?.catPanel
const panel = document.querySelector('#cat-panel')
const sideNode = document.querySelector('#panel-side')

const sideLabels = {
  left: '左侧',
  right: '右侧',
}

function applyPlacement(placement = {}) {
  const side = placement.side === 'left' ? 'left' : 'right'

  panel.dataset.side = side
  sideNode.textContent = sideLabels[side]
}

panelApi?.onPlacement?.(applyPlacement)

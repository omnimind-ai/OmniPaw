async function hydrateRuntimeInfo() {
  const versionNode = document.querySelector('#app-version')

  if (!versionNode || !window.openOmniClaw) {
    return
  }

  try {
    const version = await window.openOmniClaw.getVersion()
    versionNode.textContent = `v${version}`
  } catch {
    versionNode.textContent = 'Unavailable'
  }
}

function formatBounds(bounds) {
  if (!bounds) {
    return '--'
  }

  return `${bounds.x}, ${bounds.y}, ${bounds.width}x${bounds.height}`
}

function updateCatStatus(status = {}) {
  const visibleNode = document.querySelector('#cat-visible')
  const stateNode = document.querySelector('#cat-state')
  const boundsNode = document.querySelector('#cat-bounds')

  if (visibleNode) {
    visibleNode.textContent = status.visible ? 'Visible' : 'Hidden'
  }

  if (stateNode) {
    stateNode.textContent = status.state || 'hidden'
  }

  if (boundsNode) {
    boundsNode.textContent = formatBounds(status.bounds)
  }
}

function bindCatDemoControls() {
  const catApi = window.openOmniClaw?.cat

  if (!catApi) {
    updateCatStatus({ state: 'unavailable', visible: false })
    return
  }

  document.querySelectorAll('[data-cat-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      const action = button.dataset.catAction
      const result = action === 'hide' ? await catApi.hide() : await catApi.show()

      updateCatStatus(result)
    })
  })

  document.querySelectorAll('[data-cat-state]').forEach((button) => {
    button.addEventListener('click', async () => {
      const result = await catApi.setState(button.dataset.catState)

      updateCatStatus(result)
    })
  })

  catApi.onStateChanged((status) => {
    updateCatStatus(status)
  })
}

hydrateRuntimeInfo()
bindCatDemoControls()

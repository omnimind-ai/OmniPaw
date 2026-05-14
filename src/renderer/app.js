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

hydrateRuntimeInfo()

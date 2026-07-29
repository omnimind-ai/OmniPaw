import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { InstalledModelRegistry } from '../../core/omniinfer/installed-models'
import type { OmniInferProcessController } from '../../core/omniinfer/process-controller'
import { OmniInferRuntimeClient } from '../../core/omniinfer/runtime-client'
import { OmniInferRuntimeService } from '../../core/omniinfer/runtime-service'
import type {
  OmniInferBackendSetupStatus,
  OmniInferProcessSnapshot,
} from '../../shared/types/omniinfer'

let now = 0
let gatewayReady = false

const client = new OmniInferRuntimeClient({
  fetch: async (input) => {
    const path = new URL(String(input)).pathname
    if (path === '/health') {
      return Response.json({
        status: gatewayReady ? 'ok' : 'starting',
        omni: {
          backend: 'llama.cpp-cuda',
          backend_ready: gatewayReady,
        },
      })
    }
    if (path === '/omni/thinking') {
      return Response.json({ default_enabled: false })
    }
    if (path === '/omni/backends') {
      return Response.json({
        data: [
          {
            id: 'llama.cpp-cuda',
            selected: true,
            binary_exists: true,
            compatibility: 'installed',
          },
        ],
      })
    }
    return Response.json({})
  },
})

const processEvents = new EventEmitter()
let processSnapshot: OmniInferProcessSnapshot = {
  state: 'stopped',
  installDir: 'C:\\OmniInfer',
  modelsDir: 'C:\\OmniInfer\\models',
  lastUpdatedAt: now,
}
const backendSetup: OmniInferBackendSetupStatus = {
  baseBackend: 'llama.cpp-cpu',
  baseBackendInstalled: true,
  compatibleBackends: ['llama.cpp-cpu', 'llama.cpp-cuda'],
  installedBackends: ['llama.cpp-cpu', 'llama.cpp-cuda'],
}

function transitionProcess(patch: Partial<OmniInferProcessSnapshot>): void {
  const previousState = processSnapshot.state
  processSnapshot = {
    ...processSnapshot,
    ...patch,
    previousState,
    lastUpdatedAt: now,
  }
  processEvents.emit('state', { ...processSnapshot })
}

const processController: OmniInferProcessController = {
  async start() {
    transitionProcess({ state: 'starting', pid: undefined })
    transitionProcess({ state: 'running', pid: 4242 })
    return { ...processSnapshot }
  },
  async stop() {
    transitionProcess({ state: 'stopped', pid: undefined })
    return { ...processSnapshot }
  },
  getState() {
    return { ...processSnapshot }
  },
  getDefaultBackendId() {
    return 'llama.cpp-cpu'
  },
  async inspectBackends() {
    return backendSetup
  },
  async installBackend() {
    return backendSetup
  },
  onLog(listener) {
    processEvents.on('log', listener)
    return () => processEvents.off('log', listener)
  },
  onExit(listener) {
    processEvents.on('exit', listener)
    return () => processEvents.off('exit', listener)
  },
  onStateChanged(listener) {
    processEvents.on('state', listener)
    return () => processEvents.off('state', listener)
  },
  getLogsPath() {
    return undefined
  },
}

const installedModels = new InstalledModelRegistry({
  storagePath: join(tmpdir(), `omnipaw-omniinfer-runtime-service-${process.pid}.json`),
  modelsDir: join(tmpdir(), 'omnipaw-omniinfer-runtime-service-models'),
  now: () => now,
})

const service = new OmniInferRuntimeService({
  client,
  process: processController,
  installedModels,
  now: () => now,
})

try {
  await service.start()
  await delay(1_800)

  assert.equal(
    service.getSnapshot().process.state,
    'running',
    'managed process should remain running while the gateway initializes within the startup window'
  )
  assert.equal(service.getSnapshot().server.online, false)

  now = 30_001
  await delay(700)
  assert.equal(
    service.getSnapshot().process.state,
    'unhealthy',
    'managed process should become unhealthy after the startup window expires'
  )

  gatewayReady = true
  await delay(700)
  const recovered = service.getSnapshot()
  assert.equal(recovered.process.state, 'running')
  assert.equal(recovered.server.online, true)
  assert.equal(recovered.backends[0]?.id, 'llama.cpp-cuda')
} finally {
  service.dispose()
}

console.log('OmniInfer runtime service smoke check passed')

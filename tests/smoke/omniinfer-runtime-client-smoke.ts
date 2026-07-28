import assert from 'node:assert/strict'
import {
  OmniInferControlException,
  OmniInferRuntimeClient,
} from '../../core/omniinfer/runtime-client'

const requests: Array<{ path: string; init?: RequestInit }> = []
const client = new OmniInferRuntimeClient({
  baseUrl: 'http://127.0.0.1:19157/v1',
  fetch: async (input, init) => {
    const url = new URL(String(input))
    requests.push({ path: url.pathname, init })
    if (url.pathname === '/omni/backends') {
      return Response.json({
        data: [
          { id: 'llama.cpp-cpu', selected: false },
          { id: 'llama.cpp-cuda', selected: true },
        ],
      })
    }
    return Response.json({})
  },
})

await client.selectBackend(' llama.cpp-cuda ')
assert.equal(requests[0]?.path, '/omni/backend/select')
assert.equal(requests[0]?.init?.method, 'POST')
assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
  backend: 'llama.cpp-cuda',
})

assert.deepEqual(await client.listBackends(), [
  { id: 'llama.cpp-cpu', selected: false },
  { id: 'llama.cpp-cuda', selected: true },
])

await assert.rejects(
  () => client.selectBackend('  '),
  (error: unknown) =>
    error instanceof OmniInferControlException &&
    error.code === 'VALIDATION_ERROR' &&
    error.path === '/omni/backend/select'
)

console.log('OmniInfer runtime client smoke check passed')

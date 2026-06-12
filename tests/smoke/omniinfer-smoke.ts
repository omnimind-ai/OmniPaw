import assert from 'node:assert/strict'

import { normalizeCatalogModels, platformFromNodePlatform } from '../../core/omniinfer/catalog'

const existing = new Set(['/models/Qwen3-4B-Q4_K_M.gguf'])
const models = await normalizeCatalogModels(
  {
    best: {
      small: {
        id: 'qwen3-4b-q4',
        name: 'Qwen3 4B',
        family: 'qwen3',
        quantization: 'Q4_K_M',
        backend: 'llama.cpp-metal',
        download: 'https://example.test/models/Qwen3-4B-Q4_K_M.gguf',
        size: 2.7,
        context_window: 32768,
      },
      vision: {
        id: 'qwen2.5-vl',
        name: 'Qwen2.5 VL',
        family: 'qwen2.5-vl',
        download_url: 'https://example.test/models/qwen2.5-vl.gguf',
        mmproj: {
          download: 'https://example.test/models/mmproj-qwen2.5-vl.gguf',
          size: '0.6 GiB',
        },
      },
    },
  },
  {
    modelDir: '/models',
    fileExists: async (path) => existing.has(path),
  }
)

assert.equal(platformFromNodePlatform('darwin'), 'mac')
assert.equal(platformFromNodePlatform('win32'), 'windows')
assert.equal(platformFromNodePlatform('linux'), 'linux')

assert.equal(models.length, 2)
assert.equal(models[0]?.id, 'qwen3-4b-q4')
assert.equal(models[0]?.filename, 'Qwen3-4B-Q4_K_M.gguf')
assert.equal(models[0]?.installed, true)
assert.equal(models[0]?.sizeBytes, 2899102925)
assert.equal(models[0]?.sizeGiB, 2.7)
assert.deepEqual(models[0]?.input, ['text'])
assert.equal(models[0]?.contextWindow, 32768)

assert.equal(models[1]?.id, 'qwen2.5-vl')
assert.equal(models[1]?.visionFilename, 'mmproj-qwen2.5-vl.gguf')
assert.equal(models[1]?.visionSizeBytes, 644245094)
assert.deepEqual(models[1]?.input, ['text', 'image'])

console.log('OmniInfer smoke check passed')

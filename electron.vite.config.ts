import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

const packageJson = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')) as {
  version?: string
}
const appVersion = packageJson.version || '0.1.1'
const buildTime = process.env.OMNIPAW_BUILD_TIME || new Date().toISOString()
const gitCommit = process.env.OMNIPAW_GIT_COMMIT || readGitCommit()
const bundleOmniInferRaw = (process.env.OMNIPAW_BUNDLE_OMNIINFER ?? '1').trim()
const omniInferPackaged = bundleOmniInferRaw !== '0' && bundleOmniInferRaw.toLowerCase() !== 'false'
const buildDefines = {
  __APP_VERSION__: JSON.stringify(appVersion),
  __BUILD_TIME__: JSON.stringify(buildTime),
  __GIT_COMMIT__: JSON.stringify(gitCommit),
  __OMNIINFER_PACKAGED__: JSON.stringify(omniInferPackaged),
}

function readGitCommit(): string {
  try {
    return execSync('git rev-parse --short HEAD', {
      cwd: __dirname,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return ''
  }
}

export default defineConfig({
  main: {
    define: buildDefines,
    plugins: [externalizeDepsPlugin({ exclude: ['electron-log'] })],
    build: {
      rollupOptions: {
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs',
        },
        input: {
          main: resolve(__dirname, 'electron/main.ts'),
          'workers/image-encoder': resolve(__dirname, 'electron/workers/image-encoder.ts'),
        },
      },
    },
    resolve: {
      alias: {
        '@core': resolve(__dirname, 'core'),
        '@shared': resolve(__dirname, 'shared'),
      },
    },
  },
  preload: {
    define: buildDefines,
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs',
        },
        input: {
          preload: resolve(__dirname, 'electron/preload.ts'),
        },
      },
    },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'shared'),
      },
    },
  },
  renderer: {
    root: '.',
    define: buildDefines,
    plugins: [vue(), tailwindcss()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'index.html'),
          'cat-window': resolve(__dirname, 'cat-window.html'),
          'cat-hit-window': resolve(__dirname, 'cat-hit-window.html'),
          'cat-panel': resolve(__dirname, 'cat-panel.html'),
          'cat-bubble': resolve(__dirname, 'cat-bubble.html'),
        },
      },
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@shared': resolve(__dirname, 'shared'),
      },
    },
  },
})

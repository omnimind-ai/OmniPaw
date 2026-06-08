import { resolve } from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['electron-log'] })],
    build: {
      rollupOptions: {
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs',
        },
        input: {
          main: resolve(__dirname, 'electron/main.ts'),
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
    plugins: [vue(), tailwindcss()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'index.html'),
          'cat-window': resolve(__dirname, 'cat-window.html'),
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

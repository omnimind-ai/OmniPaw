import { resolve } from 'node:path'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@shared': resolve(__dirname, 'shared'),
    },
  },
  optimizeDeps: {
    entries: ['index.html'],
  },
})

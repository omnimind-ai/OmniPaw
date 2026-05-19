import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const packageJsonPath = require.resolve('electron-vite/package.json')
const binPath = resolve(dirname(packageJsonPath), 'bin/electron-vite.js')

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const child = spawn(process.execPath, [binPath, ...process.argv.slice(2)], {
  env,
  stdio: 'inherit',
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.exit(1)
    return
  }

  process.exit(code ?? 0)
})

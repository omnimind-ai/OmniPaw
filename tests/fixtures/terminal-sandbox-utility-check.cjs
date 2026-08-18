const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const { existsSync, mkdirSync, rmSync } = require('node:fs')
const { homedir, tmpdir } = require('node:os')
const { delimiter, join, resolve } = require('node:path')
const { app, utilityProcess } = require('electron')

const pending = new Map()
let child

function request(type, fields = {}) {
  const id = crypto.randomUUID()
  return new Promise((resolveRequest, rejectRequest) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      rejectRequest(new Error(`worker ${type} timed out`))
    }, 120_000)
    pending.set(id, {
      resolve: (message) => {
        clearTimeout(timer)
        if (message.ok) resolveRequest(message)
        else rejectRequest(new Error(message.error))
      },
    })
    child.postMessage({ id, type, ...fields })
  })
}

async function runLaunch(launch, cwd) {
  return new Promise((resolveRun, rejectRun) => {
    const command = spawn(launch.executable, launch.args, {
      cwd,
      env: launch.env,
      shell: false,
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    command.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8')
    })
    command.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8')
    })
    command.once('error', rejectRun)
    command.once('close', (code) => resolveRun({ code, stdout, stderr }))
  })
}

app
  .whenReady()
  .then(async () => {
    const root = join(tmpdir(), `omnipaw-sandbox-utility-${process.pid}`)
    const files = join(root, 'files')
    const temp = join(root, 'tmp')
    mkdirSync(files, { recursive: true })
    mkdirSync(temp, { recursive: true })

    try {
      const worker = process.env.OMNIPAW_SANDBOX_CHECK_WORKER
        ? resolve(process.env.OMNIPAW_SANDBOX_CHECK_WORKER)
        : resolve('out/main/workers/terminal-sandbox.cjs')
      const helperArch = process.arch === 'arm64' ? 'arm64' : 'x64'
      const helper = process.env.OMNIPAW_SANDBOX_CHECK_HELPER
        ? resolve(process.env.OMNIPAW_SANDBOX_CHECK_HELPER)
        : resolve(
            `node_modules/@anthropic-ai/sandbox-runtime/vendor/srt-win/${helperArch}/srt-win.exe`
          )
      assert.equal(existsSync(worker), true)
      assert.equal(existsSync(helper), true)

      child = utilityProcess.fork(worker, [], { serviceName: 'omnipaw-terminal-sandbox-check' })
      child.on('message', (message) => {
        const handler = pending.get(message.id)
        if (!handler) return
        pending.delete(message.id)
        handler.resolve(message)
      })
      await new Promise((resolveSpawn, rejectSpawn) => {
        child.once('spawn', resolveSpawn)
        child.once('exit', (code) => rejectSpawn(new Error(`worker exited with ${code}`)))
      })

      let ticks = 0
      const ticker = setInterval(() => {
        ticks += 1
      }, 10)
      const startedAt = Date.now()
      const prepared = await request('prepare', {
        runtimeConfig: {
          network: {
            allowedDomains: [],
            deniedDomains: [],
            strictAllowlist: true,
            allowLocalBinding: false,
          },
          filesystem: {
            denyRead: [],
            allowRead: [
              root,
              ...String(process.env.PATH || '')
                .split(delimiter)
                .map((entry) => entry.replace(/^"|"$/g, ''))
                .filter(
                  (entry) =>
                    entry &&
                    existsSync(entry) &&
                    entry.toLowerCase().startsWith(`${homedir().toLowerCase()}\\`)
                ),
            ],
            allowWrite: [files, temp],
            denyWrite: [],
          },
          allowPty: false,
          enableWeakerNestedSandbox: false,
          windows: { srtWin: { path: helper } },
        },
        allowNetwork: false,
        command: 'echo sandbox-worker-ok',
        commandId: 'utility-check',
        cwd: files,
      })
      const preparationMs = Date.now() - startedAt
      clearInterval(ticker)
      assert.ok(prepared.launch)
      if (preparationMs >= 100) assert.ok(ticks >= 3)

      const result = await runLaunch(prepared.launch, files)
      assert.equal(result.code, 0, result.stderr)
      assert.match(result.stdout, /sandbox-worker-ok/)
      await request('cleanup')
      process.stdout.write(
        `${JSON.stringify({ preparationMs, mainLoopTicks: ticks, stdout: result.stdout.trim() })}\n`
      )
    } finally {
      try {
        if (child) await request('dispose')
      } catch {}
      child?.kill()
      rmSync(root, { recursive: true, force: true })
      app.quit()
    }
  })
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
    process.exitCode = 1
    app.quit()
  })

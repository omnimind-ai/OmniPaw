import type { Logger } from '@core/logging'
import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { chmod, mkdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { platform } from 'node:process'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const INSTALLER_BASE_URL =
  'https://raw.githubusercontent.com/omnimind-ai/OmniInfer/main/scripts'

export interface OmniInferRuntimeBootstrapOptions {
  installDir: string
  fetchImpl?: typeof fetch
  logger?: Logger
}

export interface OmniInferRuntimeResolution {
  runtimePath: string
  installed: boolean
}

interface RunCommand {
  command: string
  args: string[]
}

export async function ensureOmniInferRuntime(
  options: OmniInferRuntimeBootstrapOptions
): Promise<OmniInferRuntimeResolution> {
  const existing = await findInstalledRuntime(options.installDir)
  if (existing) {
    return { runtimePath: existing, installed: false }
  }

  await installOmniInferRuntime(options)

  const runtimePath = await findInstalledRuntime(options.installDir)
  if (!runtimePath) {
    throw new Error(`OmniInfer installer completed but no runtime was found in ${options.installDir}.`)
  }
  return { runtimePath, installed: true }
}

export async function findInstalledRuntime(installDir: string): Promise<string | undefined> {
  const candidates =
    platform === 'win32'
      ? [join(installDir, 'omniinfer.py'), join(installDir, 'omniinfer.cmd')]
      : [join(installDir, 'omniinfer'), join(installDir, 'omniinfer.py')]

  for (const candidate of candidates) {
    if (await isFile(candidate)) {
      return candidate
    }
  }
  return undefined
}

export function buildInstallerCommand(scriptPath: string, installDir: string): RunCommand {
  if (platform === 'win32') {
    return {
      command: 'powershell.exe',
      args: [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        scriptPath,
        '-InstallDir',
        installDir,
        '-NoModel',
        '-NonInteractive',
        '-Prebuilt',
      ],
    }
  }

  return {
    command: 'bash',
    args: [
      scriptPath,
      '--install-dir',
      installDir,
      '--no-model',
      '--non-interactive',
      '--prebuilt',
      '--no-install-system-deps',
    ],
  }
}

async function installOmniInferRuntime(
  options: OmniInferRuntimeBootstrapOptions
): Promise<void> {
  const bootstrapDir = join(options.installDir, '..', '.bootstrap')
  await mkdir(bootstrapDir, { recursive: true })
  const scriptPath = join(bootstrapDir, platform === 'win32' ? 'install.ps1' : 'install.sh')
  await downloadInstaller(scriptPath, options.fetchImpl)
  if (platform !== 'win32') {
    await chmod(scriptPath, 0o755).catch(() => undefined)
  }

  const command = buildInstallerCommand(scriptPath, options.installDir)
  options.logger?.info('Installing OmniInfer runtime from GitHub.', {
    installDir: options.installDir,
    command: command.command,
  })
  await runInstaller(command, options.logger)
}

async function downloadInstaller(scriptPath: string, fetchImpl?: typeof fetch): Promise<void> {
  const file = platform === 'win32' ? 'install.ps1' : 'install.sh'
  const response = await (fetchImpl ?? fetch)(`${INSTALLER_BASE_URL}/${file}`, {
    headers: { Accept: 'text/plain' },
  })
  if (!response.ok || !response.body) {
    throw new Error(`OmniInfer installer download failed with HTTP ${response.status}.`)
  }

  await pipeline(
    Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
    createWriteStream(scriptPath)
  )
}

async function runInstaller(command: RunCommand, logger?: Logger): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command.command, command.args, {
      stdio: 'pipe',
      env: { ...process.env },
    })
    const outputTail: string[] = []
    const remember = (stream: 'stdout' | 'stderr', chunk: Buffer) => {
      const text = chunk.toString('utf8').trim()
      if (!text) {
        return
      }
      outputTail.push(text)
      if (outputTail.length > 20) {
        outputTail.shift()
      }
      logger?.debug(`OmniInfer installer ${stream}.`, { chunk: text })
    }
    child.stdout.on('data', (chunk: Buffer) => remember('stdout', chunk))
    child.stderr.on('data', (chunk: Buffer) => remember('stderr', chunk))
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(
        new Error(
          `OmniInfer installer failed with code ${code ?? 'unknown'} signal ${
            signal ?? 'none'
          }: ${outputTail.join('\n')}`
        )
      )
    })
  })
}

async function isFile(path: string): Promise<boolean> {
  return stat(path)
    .then((stats) => stats.isFile())
    .catch(() => false)
}

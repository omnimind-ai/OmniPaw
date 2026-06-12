import { type SpawnOptions, spawn } from 'node:child_process'
import type { Logger } from '@core/logging'

const CLEANUP_SCRIPT = `
$exe = (($env:OMNICLAW_GATEWAY_EXE -as [string]) -replace '^\\\\\\\\\\?\\\\', '')
$port = [regex]::Escape(($env:OMNICLAW_GATEWAY_PORT -as [string]))
if ([string]::IsNullOrWhiteSpace($exe) -or [string]::IsNullOrWhiteSpace($port)) {
  exit 0
}
$names = @('omniinfer.exe', 'omniinfer-cli.exe', 'OmniInfer.exe', 'omniinfer_gateway.exe')
$stopped = 0
Get-CimInstance Win32_Process |
  Where-Object {
    $path = (($_.ExecutablePath -as [string]) -replace '^\\\\\\\\\\?\\\\', '')
    $names -contains $_.Name -and
    $path -ieq $exe -and
    (($_.CommandLine -as [string]) -match "(^|\\s)--port\\s+$port(\\s|$)")
  } |
  ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    $script:stopped += 1
  }
Write-Output "stopped=$stopped"
exit 0
`

const CREATE_NO_WINDOW = 0x0800_0000

export interface CleanupStaleOmniInferOptions {
  binaryPath: string
  port: number
  logger?: Logger
}

/**
 * Windows-only: stop any leftover OmniInfer processes that point at the same binary and port.
 * Mirrors `runtime_gateway.rs::cleanup_stale_gateway_processes` from OmniStudio.
 */
export async function cleanupStaleOmniInferProcesses(
  options: CleanupStaleOmniInferOptions
): Promise<void> {
  if (process.platform !== 'win32') return
  const spawnOptions: SpawnOptions & { creationFlags?: number } = {
    env: {
      ...process.env,
      OMNICLAW_GATEWAY_EXE: options.binaryPath,
      OMNICLAW_GATEWAY_PORT: String(options.port),
    },
    windowsHide: true,
    creationFlags: CREATE_NO_WINDOW,
  }
  await new Promise<void>((resolvePromise) => {
    const child = spawn(
      'powershell',
      [
        '-NoProfile',
        '-WindowStyle',
        'Hidden',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        CLEANUP_SCRIPT,
      ],
      spawnOptions
    )
    child.on('error', (error: Error) => {
      options.logger?.warn?.('OmniInfer Windows cleanup failed to launch PowerShell.', { error })
      resolvePromise()
    })
    child.on('close', (code: number | null) => {
      if (code !== 0) {
        options.logger?.warn?.('OmniInfer Windows cleanup exited non-zero.', { code })
      }
      resolvePromise()
    })
  })
}

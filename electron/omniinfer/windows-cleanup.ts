import { type SpawnOptions, spawn } from 'node:child_process'
import type { Logger } from '@core/logging'

const CLEANUP_SCRIPT = `
$matchPaths = (($env:OMNIPAW_GATEWAY_MATCH_PATHS -as [string]) -split '\\|') |
  Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
  ForEach-Object { ($_ -replace '^\\\\\\\\\\?\\\\', '') }
$port = [regex]::Escape(($env:OMNIPAW_GATEWAY_PORT -as [string]))
if ($matchPaths.Count -eq 0 -or [string]::IsNullOrWhiteSpace($port)) {
  exit 0
}
$escapedPaths = @($matchPaths | ForEach-Object { [regex]::Escape($_) })
$stopped = 0
Get-CimInstance Win32_Process |
  Where-Object {
    $path = (($_.ExecutablePath -as [string]) -replace '^\\\\\\\\\\?\\\\', '')
    $commandLine = ($_.CommandLine -as [string])
    $matched = $false
    foreach ($escapedPath in $escapedPaths) {
      if ($path -match $escapedPath -or $commandLine -match $escapedPath) {
        $matched = $true
        break
      }
    }
    $matched -and
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
  cliPath: string
  installDir?: string
  port: number
  logger?: Logger
}

/**
 * Windows-only: stop any leftover OmniInfer processes that point at the same CLI script and port.
 * Mirrors `runtime_gateway.rs::cleanup_stale_gateway_processes` from OmniStudio.
 */
export async function cleanupStaleOmniInferProcesses(
  options: CleanupStaleOmniInferOptions
): Promise<void> {
  if (process.platform !== 'win32') return
  const matchPaths = [
    options.cliPath,
    options.installDir ? `${options.installDir}\\omniinfer.py` : undefined,
    options.installDir ? `${options.installDir}\\omniinfer.ps1` : undefined,
    options.installDir ? `${options.installDir}\\omniinfer.cmd` : undefined,
    options.installDir ? `${options.installDir}\\omniinfer.bat` : undefined,
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join('|')
  const spawnOptions: SpawnOptions & { creationFlags?: number } = {
    env: {
      ...process.env,
      OMNIPAW_GATEWAY_MATCH_PATHS: matchPaths,
      OMNIPAW_GATEWAY_PORT: String(options.port),
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

import type { SandboxRuntimeConfig } from '@anthropic-ai/sandbox-runtime'

export interface TerminalSandboxWorkerPrepareRequest {
  id: string
  type: 'prepare'
  runtimeConfig: SandboxRuntimeConfig
  allowNetwork: boolean
  command: string
  commandId: string
  cwd: string
}

export interface TerminalSandboxWorkerCleanupRequest {
  id: string
  type: 'cleanup'
}

export interface TerminalSandboxWorkerDisposeRequest {
  id: string
  type: 'dispose'
}

export type TerminalSandboxWorkerRequest =
  | TerminalSandboxWorkerPrepareRequest
  | TerminalSandboxWorkerCleanupRequest
  | TerminalSandboxWorkerDisposeRequest

export interface TerminalSandboxWorkerSuccessResponse {
  id: string
  ok: true
  launch?: {
    executable: string
    args: string[]
    env: Record<string, string>
  }
}

export interface TerminalSandboxWorkerErrorResponse {
  id: string
  ok: false
  error: string
}

export type TerminalSandboxWorkerResponse =
  | TerminalSandboxWorkerSuccessResponse
  | TerminalSandboxWorkerErrorResponse

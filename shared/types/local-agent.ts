import type { ToolProfile } from './chat'

export type LocalCommandSandboxLevel =
  | 'policy-only'
  | 'non-sandboxed'
  | 'macos-seatbelt'
  | 'linux-bubblewrap'
  | 'windows-restricted'

export interface LocalCommandSandbox {
  level: LocalCommandSandboxLevel
  label: string
  enforced: boolean
  fullAccess?: boolean
  protections?: {
    filesystem?: 'workspace-only' | 'external-grants' | 'full-access'
    network?: 'deny' | 'ask' | 'allow'
  }
}

export type LocalPermissionMode = 'ask' | 'allow' | 'deny'
export type LocalNetworkPolicy = 'ask' | 'allow' | 'deny'
export type WorkspaceRootStrategy = 'managed-user-data'
export type ExternalRootAccessMode = 'read' | 'write' | 'read-write'
export type ExternalRootGrantScope = 'session' | 'profile' | 'global'

export interface ExternalRootGrant {
  id: string
  path: string
  access: ExternalRootAccessMode
  scope: ExternalRootGrantScope
  sessionId?: string
  profile?: ToolProfile
  enabled: boolean
  createdAt: number
  updatedAt: number
}

export interface LocalAgentWorkspaceSettings {
  enabled: boolean
  rootStrategy: WorkspaceRootStrategy
  retentionDays: number
  cleanupOnSessionDelete: boolean
  maxFileBytes: number
  maxReadBytes: number
  maxWriteBytes: number
  maxSearchResults: number
  maxToolResultChars: number
  denyPatterns: string[]
  externalRoots: ExternalRootGrant[]
}

export interface LocalTerminalProfileSettings {
  approval: LocalPermissionMode
  network: LocalNetworkPolicy
  allowBackground: boolean
  allowPty: boolean
  fullAccess: boolean
  commandAllowPatterns: string[]
  commandDenyPatterns: string[]
}

export interface LocalAgentTerminalSettings {
  enabled: boolean
  sandbox: LocalCommandSandboxLevel
  timeoutMs: number
  maxOutputChars: number
  maxForegroundProcesses: number
  maxBackgroundProcesses: number
  backgroundMaxLifetimeMs: number
  minimalEnvKeys: string[]
  assistant: LocalTerminalProfileSettings
  power: LocalTerminalProfileSettings
}

export type LocalToolApprovalPlan =
  | {
      kind: 'workspace'
      action: 'write' | 'patch' | 'delete' | 'export'
      targetPath: string
      scope: 'managed-workspace' | 'external-root'
      sizeBytes?: number
      writeScope?: string
    }
  | {
      kind: 'terminal'
      command: string
      cwd: string
      timeoutMs: number
      background: boolean
      pty: boolean
      network: LocalNetworkPolicy
      sandbox: LocalCommandSandbox
      envKeys: string[]
      accessScope: 'managed-workspace' | 'full-local-access'
      fullAccess: boolean
    }

export interface LocalAgentOperationError {
  code:
    | 'local_capability_unavailable'
    | 'workspace_not_found'
    | 'path_denied'
    | 'sensitive_path_denied'
    | 'file_too_large'
    | 'invalid_request'
    | 'process_not_found'
    | 'process_failed'
  message: string
  recoverable: boolean
}

export interface AgentWorkspaceStatusRequest {
  sessionId: string
}

export interface AgentWorkspaceStatus {
  id: string
  sessionId: string
  rootName: string
  rootPath: string
  filesPath: string
  fileCount: number
  sizeBytes: number
  createdAt: number
  updatedAt: number
  policy: {
    enabled: boolean
    rootStrategy: WorkspaceRootStrategy
    maxFileBytes: number
    maxReadBytes: number
    sandbox: LocalCommandSandboxLevel
  }
}

export type AgentWorkspaceFileKind = 'file' | 'directory'

export interface AgentWorkspaceFileEntry {
  name: string
  path: string
  kind: AgentWorkspaceFileKind
  sizeBytes: number
  updatedAt: number
}

export interface ListWorkspaceFilesRequest {
  sessionId: string
  path?: string
  recursive?: boolean
  maxEntries?: number
}

export interface ListWorkspaceFilesResponse {
  sessionId: string
  path: string
  entries: AgentWorkspaceFileEntry[]
  truncated: boolean
}

export interface ReadWorkspaceFileRequest {
  sessionId: string
  path: string
  maxBytes?: number
}

export interface ReadWorkspaceFileResponse {
  sessionId: string
  path: string
  content: string
  sizeBytes: number
  truncated: boolean
  binary: boolean
}

export interface ExportWorkspaceFileRequest {
  sessionId: string
  path: string
}

export interface ExportWorkspaceFileResponse {
  sessionId: string
  path: string
  destinationPath?: string
  canceled?: boolean
}

export interface DeleteWorkspaceFileRequest {
  sessionId: string
  path: string
}

export interface DeleteWorkspaceFileResponse {
  sessionId: string
  path: string
  deleted: boolean
}

export interface CleanupWorkspaceRequest {
  sessionId: string
}

export interface CleanupWorkspaceResponse {
  sessionId: string
  deleted: boolean
}

export type LocalProcessStatus = 'running' | 'exited' | 'failed' | 'killed' | 'timed-out'

export interface LocalProcessSummary {
  id: string
  sessionId: string
  runId?: string
  toolCallId?: string
  workspaceId?: string
  command: string
  cwd: string
  status: LocalProcessStatus
  background: boolean
  sandbox: LocalCommandSandbox
  startedAt: number
  finishedAt?: number
  durationMs?: number
  exitCode?: number | null
  signal?: string | null
  stdoutTail: string
  stderrTail: string
  truncated: boolean
}

export interface ListLocalProcessesRequest {
  sessionId?: string
}

export interface GetLocalProcessRequest {
  processId: string
}

export interface KillLocalProcessRequest {
  processId: string
}

export interface KillLocalProcessResponse {
  processId: string
  killed: boolean
}

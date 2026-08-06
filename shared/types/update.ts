export interface UpdateInfo {
  version: string
  releaseDate: string
  changelog: string[]
  downloads: Record<string, string>
}

export interface UpdateCheckResult extends UpdateInfo {
  currentVersion: string
  hasUpdate: boolean
}

export type AppUpdatePhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'error'

export interface AppUpdateProgress {
  percent: number
  transferred: number
  total: number
  bytesPerSecond: number
}

export interface AppUpdateState {
  supported: boolean
  phase: AppUpdatePhase
  currentVersion: string
  availableVersion?: string
  checkedAt?: number
  progress?: AppUpdateProgress
  error?: string
}

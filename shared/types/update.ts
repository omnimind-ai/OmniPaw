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

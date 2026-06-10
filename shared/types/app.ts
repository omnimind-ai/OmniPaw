export interface AppInfo {
  name: string
  version: string
  platform: string
}

export interface OpenDirectoryResponse {
  opened: boolean
  path?: string
}

export interface OpenChatSessionRequest {
  sessionId: string
  kind?: 'chat' | 'tavern' | 'cat' | 'vision'
}

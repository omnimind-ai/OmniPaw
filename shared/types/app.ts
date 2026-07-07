export interface AppInfo {
  name: string
  version: string
  buildTime: string
  commit: string
  isPackaged: boolean
  omniInferPackaged: boolean
  platform: string
}

export interface OpenDirectoryResponse {
  opened: boolean
  path?: string
}

export interface OpenChatSessionRequest {
  sessionId: string
  kind?: 'chat' | 'cat' | 'vision'
}

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool'

export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export interface Session {
  id: string
  title: string
  providerId: string
  modelId: string
  systemPrompt?: string
  createdAt: number
  updatedAt: number
}

export interface Message {
  id: string
  sessionId: string
  role: MessageRole
  content: string
  toolCalls?: ToolCall[]
  toolCallId?: string
  tokenCount?: number
  createdAt: number
}

export interface SendMessageRequest {
  sessionId: string
  content: string
}

export interface SendMessageResponse {
  messageId: string
  accepted: boolean
}

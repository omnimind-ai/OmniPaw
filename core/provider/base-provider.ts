import type { Message } from '@shared/types/chat'

export interface ChatCompletionChunk {
  content: string
  done: boolean
}

export interface ChatCompletionRequest {
  modelId: string
  messages: Message[]
}

export interface BaseProvider {
  id: string
  streamChat: (request: ChatCompletionRequest) => AsyncIterable<ChatCompletionChunk>
}

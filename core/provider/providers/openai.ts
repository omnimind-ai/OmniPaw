import type { BaseProvider, ChatCompletionRequest } from '../base-provider'

export class OpenAICompatibleProvider implements BaseProvider {
  readonly id: string

  constructor(id: string) {
    this.id = id
  }

  async *streamChat(_request: ChatCompletionRequest) {
    yield {
      content: 'Provider skeleton is ready. Connect an OpenAI-compatible endpoint next.',
      done: false,
    }

    yield {
      content: '',
      done: true,
    }
  }
}

import type { ChatRun, SendMessageResponse } from '@shared/types/chat'

export function responseFromRun(run: ChatRun): SendMessageResponse {
  return {
    runId: run.id,
    userMessageId: run.userMessageId,
    assistantMessageId: run.assistantMessageId,
    messageId: run.assistantMessageId,
    accepted: true,
  }
}

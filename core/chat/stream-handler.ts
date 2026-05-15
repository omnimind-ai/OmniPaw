import type { WebContents } from 'electron'

import { IPC_CHANNELS } from '@shared/constants'
import type { ChatStreamEvent } from '@shared/types/chat'

export class StreamHandler {
  pushEvent(webContents: WebContents, event: ChatStreamEvent): void {
    webContents.send(IPC_CHANNELS.chat.streamEvent, event)
  }

  pushToken(webContents: WebContents, token: string): void {
    webContents.send(IPC_CHANNELS.chat.streamToken, token)
  }

  pushDone(webContents: WebContents): void {
    webContents.send(IPC_CHANNELS.chat.streamDone)
  }
}

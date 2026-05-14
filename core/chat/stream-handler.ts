import type { WebContents } from 'electron'

import { IPC_CHANNELS } from '@shared/constants'

export class StreamHandler {
  pushToken(webContents: WebContents, token: string): void {
    webContents.send(IPC_CHANNELS.chat.streamToken, token)
  }

  pushDone(webContents: WebContents): void {
    webContents.send(IPC_CHANNELS.chat.streamDone)
  }
}

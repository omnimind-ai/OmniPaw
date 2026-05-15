import type { WebContents } from 'electron'

import type { ChatStreamEvent } from '@shared/types/chat'
import type { ChatRunRepo } from '@core/db/repos'

export interface ActiveRun {
  runId: string
  controller: AbortController
  webContents: WebContents
  seq: number
}

export class RunManager {
  private readonly activeRuns = new Map<string, ActiveRun>()

  constructor(private readonly runs: ChatRunRepo) {}

  getExistingIdempotentRun(idempotencyKey?: string) {
    return idempotencyKey ? this.runs.getByIdempotencyKey(idempotencyKey) : undefined
  }

  start(runId: string, webContents: WebContents): AbortSignal {
    const controller = new AbortController()
    this.activeRuns.set(runId, {
      runId,
      controller,
      webContents,
      seq: 0,
    })
    return controller.signal
  }

  nextSeq(runId: string): number {
    const active = this.activeRuns.get(runId)
    if (!active) {
      return 0
    }
    active.seq += 1
    return active.seq
  }

  emit(event: ChatStreamEvent): void {
    const active = this.activeRuns.get(event.runId)
    active?.webContents.send('chat:stream-event', event)
  }

  abort(runId: string, reason?: string): boolean {
    const active = this.activeRuns.get(runId)
    if (!active) {
      return false
    }
    active.controller.abort(reason)
    return true
  }

  finish(runId: string): void {
    this.activeRuns.delete(runId)
  }
}

import type { ChatRunRepo } from '@core/db/repos'

import type { ChatStreamEvent, ToolApprovalRequest, ToolApprovalResponse } from '@shared/types/chat'
import type { WebContents } from 'electron'

export interface ActiveRun {
  runId: string
  controller: AbortController
  webContents: WebContents
  seq: number
}

interface PendingToolApproval {
  runId: string
  toolCallId: string
  resolve: (approved: boolean) => void
  reject: (error: unknown) => void
  cleanup: () => void
}

export class RunManager {
  private readonly activeRuns = new Map<string, ActiveRun>()
  private readonly pendingToolApprovals = new Map<string, PendingToolApproval>()

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
    this.rejectPendingApprovalsForRun(runId, new DOMException('Run aborted.', 'AbortError'))
    return true
  }

  finish(runId: string): void {
    this.rejectPendingApprovalsForRun(runId, new DOMException('Run finished.', 'AbortError'))
    this.activeRuns.delete(runId)
  }

  waitForToolApproval(input: {
    runId: string
    toolCallId: string
    signal?: AbortSignal
  }): Promise<boolean> {
    const key = approvalKey(input.runId, input.toolCallId)
    const existing = this.pendingToolApprovals.get(key)
    if (existing) {
      existing.reject(new DOMException('Tool approval was superseded.', 'AbortError'))
      existing.cleanup()
      this.pendingToolApprovals.delete(key)
    }

    if (input.signal?.aborted) {
      return Promise.reject(new DOMException('Run aborted.', 'AbortError'))
    }

    return new Promise<boolean>((resolve, reject) => {
      const cleanup = () => {
        input.signal?.removeEventListener('abort', abort)
      }
      const abort = () => {
        cleanup()
        this.pendingToolApprovals.delete(key)
        reject(new DOMException('Run aborted.', 'AbortError'))
      }

      input.signal?.addEventListener('abort', abort, { once: true })
      this.pendingToolApprovals.set(key, {
        runId: input.runId,
        toolCallId: input.toolCallId,
        resolve: (approved) => {
          cleanup()
          this.pendingToolApprovals.delete(key)
          resolve(approved)
        },
        reject: (error) => {
          cleanup()
          this.pendingToolApprovals.delete(key)
          reject(error)
        },
        cleanup,
      })
    })
  }

  resolveToolApproval(request: ToolApprovalRequest): ToolApprovalResponse {
    const runId = String(request.runId || '')
    const toolCallId = String(request.toolCallId || '')
    const action = request.action === 'reject' ? 'reject' : 'approve'
    if (!runId || !toolCallId) {
      return {
        accepted: false,
        runId,
        toolCallId,
        action,
        reason: 'runId and toolCallId are required.',
      }
    }

    const key = approvalKey(runId, toolCallId)
    const pending = this.pendingToolApprovals.get(key)
    if (!pending) {
      return {
        accepted: false,
        runId,
        toolCallId,
        action,
        reason: 'Tool approval request is no longer pending.',
      }
    }

    pending.resolve(action === 'approve')
    return {
      accepted: true,
      runId,
      toolCallId,
      action,
    }
  }

  private rejectPendingApprovalsForRun(runId: string, error: unknown): void {
    for (const pending of this.pendingToolApprovals.values()) {
      if (pending.runId !== runId) {
        continue
      }
      pending.reject(error)
    }
  }
}

function approvalKey(runId: string, toolCallId: string): string {
  return `${runId}:${toolCallId}`
}

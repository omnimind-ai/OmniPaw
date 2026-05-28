import type { ChatRunRepo } from '@core/db/repos'

import { IPC_CHANNELS } from '@shared/constants'
import type { ChatStreamEvent, ToolApprovalRequest, ToolApprovalResponse } from '@shared/types/chat'

export interface ChatRunEventTarget {
  send(channel: string, event: unknown): void
}

export type ChatRunTerminalEvent = Extract<ChatStreamEvent, { type: 'final' | 'error' }>

export interface ActiveRun {
  runId: string
  controller: AbortController
  target: ChatRunEventTarget
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
  private readonly terminalWaiters = new Map<
    string,
    Array<{
      resolve: (event: ChatRunTerminalEvent) => void
      reject: (error: unknown) => void
      cleanup: () => void
    }>
  >()

  constructor(private readonly runs: ChatRunRepo) {}

  getExistingIdempotentRun(idempotencyKey?: string) {
    return idempotencyKey ? this.runs.getByIdempotencyKey(idempotencyKey) : undefined
  }

  start(runId: string, target: ChatRunEventTarget): AbortSignal {
    const controller = new AbortController()
    this.activeRuns.set(runId, {
      runId,
      controller,
      target,
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
    active?.target.send(IPC_CHANNELS.chat.streamEvent, event)
    if (event.type === 'final' || event.type === 'error') {
      this.resolveTerminalWaiters(event)
    }
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
    this.rejectTerminalWaiters(
      runId,
      new DOMException('Run finished without a terminal event.', 'AbortError')
    )
    this.activeRuns.delete(runId)
  }

  waitForTerminalEvent(runId: string, signal?: AbortSignal): Promise<ChatRunTerminalEvent> {
    if (signal?.aborted) {
      return Promise.reject(new DOMException('Run aborted.', 'AbortError'))
    }

    return new Promise<ChatRunTerminalEvent>((resolve, reject) => {
      const cleanup = () => {
        signal?.removeEventListener('abort', abort)
      }
      const abort = () => {
        cleanup()
        this.removeTerminalWaiter(runId, waiter)
        reject(new DOMException('Run aborted.', 'AbortError'))
      }
      const waiter = { resolve, reject, cleanup }
      signal?.addEventListener('abort', abort, { once: true })
      const waiters = this.terminalWaiters.get(runId) ?? []
      waiters.push(waiter)
      this.terminalWaiters.set(runId, waiters)
    })
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

  private resolveTerminalWaiters(event: ChatRunTerminalEvent): void {
    const waiters = this.terminalWaiters.get(event.runId)
    if (!waiters?.length) {
      return
    }
    this.terminalWaiters.delete(event.runId)
    for (const waiter of waiters) {
      waiter.cleanup()
      waiter.resolve(event)
    }
  }

  private rejectTerminalWaiters(runId: string, error: unknown): void {
    const waiters = this.terminalWaiters.get(runId)
    if (!waiters?.length) {
      return
    }
    this.terminalWaiters.delete(runId)
    for (const waiter of waiters) {
      waiter.cleanup()
      waiter.reject(error)
    }
  }

  private removeTerminalWaiter(
    runId: string,
    waiter: {
      resolve: (event: ChatRunTerminalEvent) => void
      reject: (error: unknown) => void
      cleanup: () => void
    }
  ): void {
    const waiters = this.terminalWaiters.get(runId)
    if (!waiters?.length) {
      return
    }
    const next = waiters.filter((item) => item !== waiter)
    if (next.length) {
      this.terminalWaiters.set(runId, next)
    } else {
      this.terminalWaiters.delete(runId)
    }
  }
}

function approvalKey(runId: string, toolCallId: string): string {
  return `${runId}:${toolCallId}`
}

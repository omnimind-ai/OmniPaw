import type { Logger } from '@core/logging'
import type { ProviderToolCall } from '@core/provider/base-provider'
import { normalizeProviderError } from '@core/provider/errors'
import type { ToolCallDisplay, ToolRisk } from '@shared/types/chat'
import { decideToolUse, type ToolPolicy } from './policy'
import {
  type AgentTool,
  displayArguments,
  type NormalizedToolResult,
  parseToolArguments,
  toolResultToText,
} from './types'

export interface ExecuteToolInput {
  toolCall: ProviderToolCall
  tools: AgentTool[]
  policy: ToolPolicy
  runId?: string
  sessionId?: string
  signal?: AbortSignal
  approval?: {
    request: (display: ToolCallDisplay) => Promise<boolean>
    update: (display: ToolCallDisplay) => void
  }
}

export interface ExecuteToolOutput {
  display: ToolCallDisplay
  result: NormalizedToolResult
}

export interface ToolExecutorOptions {
  logger?: Logger
}

export class ToolExecutor {
  private readonly logger?: Logger

  constructor(options: ToolExecutorOptions = {}) {
    this.logger = options.logger
  }

  async execute(input: ExecuteToolInput): Promise<ExecuteToolOutput> {
    const startedAt = Date.now()
    const name = input.toolCall.function.name
    const logger = this.logger?.child({ scope: 'execute', toolName: name })
    const tool = input.tools.find((item) => item.name === name)
    const argsDisplay = displayArguments(input.toolCall.function.arguments)
    const baseDisplay: ToolCallDisplay = {
      id: input.toolCall.id,
      runId: input.runId,
      sessionId: input.sessionId,
      name,
      args: argsDisplay,
      arguments: argsDisplay,
      status: 'running',
      startedAt,
      ts: startedAt / 1000,
    }

    const decision = decideToolUse(tool, input.policy)
    if (!tool) {
      const message = decision.reason ?? `Tool "${name}" is not allowed.`
      logger?.warn('Tool execution denied.', {
        status: 'denied',
        approvalRequired: decision.approvalRequired,
        durationMs: Date.now() - startedAt,
      })
      return {
        display: finishDisplay(baseDisplay, 'denied', message),
        result: {
          status: 'denied',
          resultText: message,
          error: {
            code: decision.approvalRequired ? 'approval_required' : 'tool_denied',
            message,
          },
        },
      }
    }

    if (!decision.allowed) {
      let approvalGranted = false
      if (decision.approvalRequired && input.approval) {
        const approved = await waitForApproval({
          approval: input.approval,
          baseDisplay,
          risk: tool.risk,
          reason: decision.reason ?? `Tool "${name}" requires approval.`,
          logger,
          startedAt,
          signal: input.signal,
        })
        if (approved === 'approved') {
          input.approval.update(
            approvalDisplay(baseDisplay, tool.risk, decision.reason, 'approved')
          )
          approvalGranted = true
        } else if (approved === 'rejected') {
          const message = `Tool "${name}" was rejected by the user.`
          logger?.warn('Tool execution rejected by user.', {
            status: 'denied',
            durationMs: Date.now() - startedAt,
          })
          return {
            display: finishDisplay(
              approvalDisplay(baseDisplay, tool.risk, decision.reason, 'rejected'),
              'denied',
              message
            ),
            result: {
              status: 'denied',
              resultText: message,
              error: { code: 'tool_rejected', message },
            },
          }
        } else {
          const message = 'Tool approval was aborted.'
          logger?.info('Tool approval aborted.', {
            status: 'aborted',
            durationMs: Date.now() - startedAt,
          })
          return {
            display: finishDisplay(baseDisplay, 'aborted', message),
            result: {
              status: 'aborted',
              resultText: message,
              error: { code: 'aborted', message },
            },
          }
        }
      }
      if (approvalGranted) {
        logger?.info('Tool execution approved by user.', {
          status: 'running',
          durationMs: Date.now() - startedAt,
        })
      } else {
        const message = decision.reason ?? `Tool "${name}" is not allowed.`
        logger?.warn('Tool execution denied.', {
          status: 'denied',
          approvalRequired: decision.approvalRequired,
          durationMs: Date.now() - startedAt,
        })
        return {
          display: finishDisplay(baseDisplay, 'denied', message),
          result: {
            status: 'denied',
            resultText: message,
            error: {
              code: decision.approvalRequired ? 'approval_required' : 'tool_denied',
              message,
            },
          },
        }
      }
    }

    let args: unknown
    try {
      args = parseToolArguments(input.toolCall.function.arguments)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tool arguments are not valid JSON.'
      logger?.warn('Tool arguments invalid.', {
        status: 'error',
        errorCode: 'tool_arguments_invalid',
        durationMs: Date.now() - startedAt,
        error,
      })
      return {
        display: finishDisplay(baseDisplay, 'error', message),
        result: {
          status: 'error',
          resultText: message,
          error: { code: 'tool_arguments_invalid', message },
        },
      }
    }

    try {
      throwIfAborted(input.signal)
      const result = await withTimeout(
        (signal) => tool.execute(input.toolCall.id, args, signal),
        tool.timeoutMs ?? 30_000,
        input.signal
      )
      const text = toolResultToText(result)
      logger?.info('Tool execution completed.', {
        status: 'complete',
        source: tool.source,
        risk: tool.risk,
        durationMs: Date.now() - startedAt,
      })
      return {
        display: finishDisplay(baseDisplay, 'complete', text),
        result: {
          status: 'complete',
          resultText: text,
          details: result.details,
        },
      }
    } catch (error) {
      if (error instanceof ToolTimeoutError) {
        const message = error.message
        logger?.warn('Tool execution timed out.', {
          status: 'error',
          errorCode: 'tool_timeout',
          durationMs: Date.now() - startedAt,
          error,
        })
        return {
          display: finishDisplay(baseDisplay, 'error', message),
          result: {
            status: 'error',
            resultText: message,
            error: { code: 'tool_timeout', message },
          },
        }
      }
      if (isAbortError(error) || input.signal?.aborted) {
        const message = 'Tool execution was aborted.'
        logger?.info('Tool execution aborted.', {
          status: 'aborted',
          durationMs: Date.now() - startedAt,
        })
        return {
          display: finishDisplay(baseDisplay, 'aborted', message),
          result: {
            status: 'aborted',
            resultText: message,
            error: { code: 'aborted', message },
          },
        }
      }
      const normalized = normalizeProviderError(error)
      logger?.warn('Tool execution failed.', {
        status: 'error',
        errorCode: normalized.code,
        retryable: normalized.retryable,
        durationMs: Date.now() - startedAt,
        error: {
          code: normalized.code,
          message: normalized.message,
          retryable: normalized.retryable,
          providerStatus: normalized.providerStatus,
        },
      })
      return {
        display: finishDisplay(baseDisplay, 'error', normalized.message),
        result: {
          status: 'error',
          resultText: normalized.message,
          error: { code: normalized.code, message: normalized.message },
        },
      }
    }
  }
}

async function waitForApproval(input: {
  approval: NonNullable<ExecuteToolInput['approval']>
  baseDisplay: ToolCallDisplay
  risk: ToolRisk
  reason?: string
  logger?: Logger
  startedAt: number
  signal?: AbortSignal
}): Promise<'approved' | 'rejected' | 'aborted'> {
  try {
    input.logger?.info('Tool execution waiting for approval.', {
      status: 'pending',
      risk: input.risk,
      durationMs: Date.now() - input.startedAt,
    })
    const approved = await input.approval.request(
      approvalDisplay(input.baseDisplay, input.risk, input.reason, 'pending')
    )
    if (input.signal?.aborted) {
      return 'aborted'
    }
    return approved ? 'approved' : 'rejected'
  } catch (error) {
    if (isAbortError(error) || input.signal?.aborted) {
      return 'aborted'
    }
    throw error
  }
}

function approvalDisplay(
  display: ToolCallDisplay,
  risk: ToolRisk,
  reason: string | undefined,
  state: 'pending' | 'approved' | 'rejected'
): ToolCallDisplay {
  return {
    ...display,
    status: state === 'pending' ? 'pending' : 'running',
    approval: {
      required: true,
      state,
      risk,
      reason,
    },
  }
}

function finishDisplay(
  display: ToolCallDisplay,
  status: NonNullable<ToolCallDisplay['status']>,
  value: unknown
): ToolCallDisplay {
  const finishedAt = Date.now()
  return {
    ...display,
    status,
    finishedAt,
    finished_ts: finishedAt / 1000,
    ...(status === 'complete' ? { result: value } : { error: value, result: value }),
  }
}

async function withTimeout<T>(
  execute: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  parentSignal?: AbortSignal
): Promise<T> {
  const controller = new AbortController()
  let timeout: NodeJS.Timeout | undefined
  const abortParent = () => controller.abort(parentSignal?.reason)
  try {
    if (parentSignal) {
      if (parentSignal.aborted) {
        abortParent()
      } else {
        parentSignal.addEventListener('abort', abortParent, { once: true })
      }
    }
    return await Promise.race([
      execute(controller.signal),
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort(new ToolTimeoutError(`Tool execution timed out after ${timeoutMs}ms.`))
          reject(new ToolTimeoutError(`Tool execution timed out after ${timeoutMs}ms.`))
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timeout) {
      clearTimeout(timeout)
    }
    parentSignal?.removeEventListener('abort', abortParent)
  }
}

class ToolTimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ToolTimeoutError'
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Tool execution aborted.', 'AbortError')
  }
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  )
}

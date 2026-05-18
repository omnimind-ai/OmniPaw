import { normalizeProviderError } from '@core/provider/errors'
import type { ProviderToolCall } from '@core/provider/base-provider'
import type { ToolCallDisplay } from '@shared/types/chat'
import {
  displayArguments,
  parseToolArguments,
  toolResultToText,
  type AgentTool,
  type NormalizedToolResult,
} from './tool'
import { decideToolUse, type ToolPolicy } from './tool-policy'

export interface ExecuteToolInput {
  toolCall: ProviderToolCall
  tools: AgentTool[]
  policy: ToolPolicy
  signal?: AbortSignal
}

export interface ExecuteToolOutput {
  display: ToolCallDisplay
  result: NormalizedToolResult
}

export class ToolExecutor {
  async execute(input: ExecuteToolInput): Promise<ExecuteToolOutput> {
    const startedAt = Date.now()
    const name = input.toolCall.function.name
    const tool = input.tools.find((item) => item.name === name)
    const argsDisplay = displayArguments(input.toolCall.function.arguments)
    const baseDisplay: ToolCallDisplay = {
      id: input.toolCall.id,
      name,
      args: argsDisplay,
      arguments: argsDisplay,
      status: 'running',
      startedAt,
      ts: startedAt / 1000,
    }

    const decision = decideToolUse(tool, input.policy)
    if (!decision.allowed || !tool) {
      const message = decision.reason ?? `Tool "${name}" is not allowed.`
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

    let args: unknown
    try {
      args = parseToolArguments(input.toolCall.function.arguments)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tool arguments are not valid JSON.'
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

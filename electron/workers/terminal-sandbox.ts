import { SandboxManager } from '@anthropic-ai/sandbox-runtime'
import type {
  TerminalSandboxWorkerPrepareRequest,
  TerminalSandboxWorkerRequest,
  TerminalSandboxWorkerResponse,
} from '../terminal-sandbox-protocol'

const port = process.parentPort
if (!port) {
  throw new Error('terminal-sandbox worker must be spawned via utilityProcess.fork')
}

let active = false
let queue = Promise.resolve()

port.on('message', (event) => {
  const request = event.data as TerminalSandboxWorkerRequest
  queue = queue.then(
    () => handleRequest(request),
    () => handleRequest(request)
  )
})

async function handleRequest(request: TerminalSandboxWorkerRequest): Promise<void> {
  try {
    if (request.type === 'prepare') {
      const launch = await prepare(request)
      respond({ id: request.id, ok: true, launch })
      return
    }

    const cleanupError = await cleanupSandboxRuntime()
    if (cleanupError) throw cleanupError
    respond({ id: request.id, ok: true })
  } catch (error) {
    respond({
      id: request.id,
      ok: false,
      error: safeErrorMessage(error, 'Terminal sandbox worker operation failed.'),
    })
  }
}

async function prepare(
  request: TerminalSandboxWorkerPrepareRequest
): Promise<{ executable: string; args: string[]; env: Record<string, string> }> {
  if (active) {
    throw new Error('Terminal sandbox worker already owns an active command.')
  }

  try {
    await SandboxManager.initialize(
      request.runtimeConfig,
      request.allowNetwork ? async () => true : undefined
    )
    const wrapped = await SandboxManager.wrapWithSandboxArgv(
      request.command,
      undefined,
      undefined,
      undefined,
      request.cwd,
      {
        commandId: request.commandId,
        commandText: request.command,
      }
    )
    const executable = wrapped.argv[0]
    if (!executable) {
      throw new Error('Terminal sandbox returned an empty executable.')
    }
    active = true
    return {
      executable,
      args: wrapped.argv.slice(1),
      env: normalizeEnvironment(wrapped.env),
    }
  } catch (error) {
    const cleanupError = await cleanupSandboxRuntime()
    if (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'Terminal sandbox preparation and cleanup both failed.'
      )
    }
    throw error
  }
}

async function cleanupSandboxRuntime(): Promise<unknown | undefined> {
  let cleanupError: unknown
  try {
    SandboxManager.cleanupAfterCommand()
  } catch (error) {
    cleanupError = error
  }
  try {
    await SandboxManager.reset()
  } catch (error) {
    cleanupError ??= error
  }
  active = false
  return cleanupError
}

function respond(response: TerminalSandboxWorkerResponse): void {
  port.postMessage(response)
}

function normalizeEnvironment(env: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  )
}

function safeErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof AggregateError) {
    const details = error.errors
      .map((entry) => (entry instanceof Error ? entry.message : String(entry)))
      .filter(Boolean)
    return details.length ? `${error.message} ${details.join(' ')}` : error.message
  }
  return error instanceof Error && error.message.trim() ? error.message : fallback
}

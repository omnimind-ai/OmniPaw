import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ProcessSupervisor, TerminalService } from '../core/agent/terminal'
import { createBuiltinTools } from '../core/agent/tools/builtin-tools'
import { ToolExecutor } from '../core/agent/tools/executor'
import { defaultToolPolicy } from '../core/agent/tools/policy'
import { AgentWorkspaceError, AgentWorkspaceService } from '../core/agent/workspace'
import { cloneDefaultConfig } from '../core/config/schema'
import type { ProviderToolCall } from '../core/provider/base-provider'

const tempDir = mkdtempSync(join(tmpdir(), 'openomniclaw-local-agent-smoke-'))

try {
  const config = cloneDefaultConfig()
  const workspace = new AgentWorkspaceService({
    userDataPath: tempDir,
    settings: () => config.tools.workspace,
  })
  const supervisor = new ProcessSupervisor({
    maxForegroundProcesses: () => config.tools.terminal.maxForegroundProcesses,
    maxBackgroundProcesses: () => config.tools.terminal.maxBackgroundProcesses,
    backgroundMaxLifetimeMs: () => config.tools.terminal.backgroundMaxLifetimeMs,
  })
  const terminal = new TerminalService({
    workspace,
    supervisor,
    settings: () => config.tools.terminal,
  })

  const status = await workspace.getStatus('session-1')
  assert.match(status.filesPath, /agent-workspaces/)

  await workspace.writeFile({
    sessionId: 'session-1',
    path: 'notes/result.txt',
    content: 'hello workspace',
  })
  const read = await workspace.readFile({ sessionId: 'session-1', path: 'notes/result.txt' })
  assert.equal(read.content, 'hello workspace')

  await assert.rejects(
    () => workspace.readFile({ sessionId: 'session-1', path: '../escape.txt' }),
    AgentWorkspaceError
  )
  await assert.rejects(
    () => workspace.writeFile({ sessionId: 'session-1', path: '.env', content: 'SECRET=1' }),
    AgentWorkspaceError
  )
  await assert.rejects(
    () =>
      workspace.writeFile({
        sessionId: 'session-1',
        path: 'too-large.txt',
        content: 'x'.repeat(config.tools.workspace.maxWriteBytes + 1),
      }),
    AgentWorkspaceError
  )

  const exportPath = join(tempDir, 'exported.txt')
  await workspace.exportFile({
    sessionId: 'session-1',
    path: 'notes/result.txt',
    destinationPath: exportPath,
  })
  assert.equal(await readFile(exportPath, 'utf8'), 'hello workspace')

  process.env.OPENOMNICLAW_SECRET_TEST = 'must-not-leak'
  const envResult = await terminal.execute({
    sessionId: 'session-1',
    profile: 'power',
    command: `node -e "process.stdout.write(process.env.OPENOMNICLAW_SECRET_TEST || '')"`,
    timeoutMs: 5_000,
  })
  assert.equal(envResult.stdout, '')
  assert.equal(envResult.plan.fullAccess, true)

  const timeoutResult = await terminal.execute({
    sessionId: 'session-1',
    profile: 'power',
    command: `node -e "setTimeout(() => {}, 1000)"`,
    timeoutMs: 50,
  })
  assert.equal(timeoutResult.timedOut, true)

  const truncationResult = await terminal.execute({
    sessionId: 'session-1',
    profile: 'power',
    command: `node -e "process.stdout.write('x'.repeat(5000))"`,
    maxOutputChars: 16,
  })
  assert.equal(truncationResult.truncated, true)
  assert.equal(truncationResult.stdout.length <= truncationResult.plan.maxOutputChars, true)

  const backgroundResult = await terminal.execute({
    sessionId: 'session-1',
    profile: 'power',
    command: `node -e "setTimeout(() => {}, 1000)"`,
    background: true,
  })
  assert.equal(backgroundResult.process.background, true)
  assert.equal(terminal.listProcesses({ sessionId: 'session-1' }).length > 0, true)
  assert.equal(terminal.killProcess(backgroundResult.process.id), true)

  const controller = new AbortController()
  const abortPromise = terminal.execute({
    sessionId: 'session-1',
    profile: 'power',
    command: `node -e "setTimeout(() => {}, 1000)"`,
    signal: controller.signal,
  })
  setTimeout(() => controller.abort(), 20)
  const abortResult = await abortPromise
  assert.equal(abortResult.aborted, true)

  const tools = createBuiltinTools({
    messages: {} as never,
    attachments: {} as never,
    sessionId: 'session-1',
    workspaceService: workspace,
    terminalService: terminal,
    toolSettings: () => config.tools,
    policy: defaultToolPolicy('assistant'),
  })
  assert.equal(
    tools.filter((tool) => ['workspace_file', 'terminal_exec'].includes(tool.name)).length,
    2
  )

  const executor = new ToolExecutor()
  let approvalRequested = false
  const writeCall: ProviderToolCall = {
    id: 'tool-1',
    type: 'function',
    function: {
      name: 'workspace_file',
      arguments: JSON.stringify({ action: 'write', path: 'approved.txt', content: 'ok' }),
    },
  }
  const writeResult = await executor.execute({
    toolCall: writeCall,
    tools,
    policy: defaultToolPolicy('assistant'),
    sessionId: 'session-1',
    runId: 'run-1',
    approval: {
      request: async (display) => {
        approvalRequested = true
        assert.equal(display.approval?.plan?.kind, 'workspace')
        return true
      },
      update: () => {},
    },
  })
  assert.equal(approvalRequested, true)
  assert.equal(writeResult.result.status, 'complete')

  const terminalReject = await executor.execute({
    toolCall: {
      id: 'tool-2',
      type: 'function',
      function: {
        name: 'terminal_exec',
        arguments: JSON.stringify({ command: 'echo no' }),
      },
    },
    tools,
    policy: defaultToolPolicy('assistant'),
    sessionId: 'session-1',
    runId: 'run-1',
    approval: {
      request: async (display) => {
        assert.equal(display.approval?.plan?.kind, 'terminal')
        return false
      },
      update: () => {},
    },
  })
  assert.equal(terminalReject.result.status, 'denied')

  await writeFile(join(status.filesPath, 'binary.bin'), Buffer.from([0, 1, 2, 3]))
  const binary = await workspace.readFile({ sessionId: 'session-1', path: 'binary.bin' })
  assert.equal(binary.binary, true)

  await workspace.cleanupWorkspace('session-1')
  console.log('Local agent workspace and terminal smoke check passed')
} finally {
  delete process.env.OPENOMNICLAW_SECRET_TEST
  rmSync(tempDir, { recursive: true, force: true })
}

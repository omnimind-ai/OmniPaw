import assert from 'node:assert/strict'
import type { ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ProcessSupervisor, TerminalService } from '../../core/agent/terminal'
import { createBuiltinTools } from '../../core/agent/tools/builtin-tools'
import { ToolExecutor } from '../../core/agent/tools/executor'
import { defaultToolPolicy } from '../../core/agent/tools/policy'
import { AgentWorkspaceError, AgentWorkspaceService } from '../../core/agent/workspace'
import { cloneDefaultConfig } from '../../core/config/schema'
import type { ProviderToolCall } from '../../core/provider/base-provider'
import { createLocalProcessTreeController } from '../../electron/local-process-tree'
import { createPassthroughTerminalSandbox } from './terminal-sandbox-fixture'

const tempDir = mkdtempSync(join(tmpdir(), 'omnipaw-local-agent-smoke-'))

try {
  const macSignals: Array<{ pid: number; signal: NodeJS.Signals | 0 }> = []
  const macWaits: number[] = []
  const macProcessTree = createLocalProcessTreeController('darwin', {
    signalProcess: (pid, signal) => {
      macSignals.push({ pid, signal })
      return true
    },
    wait: async (durationMs) => {
      macWaits.push(durationMs)
    },
  })
  const macTermination = await macProcessTree.terminate({
    pid: 42_424,
    exitCode: null,
  } as ChildProcess)
  assert.equal(macProcessTree.detached, true)
  assert.deepEqual(macWaits, [500])
  assert.deepEqual(macSignals, [
    { pid: -42_424, signal: 'SIGTERM' },
    { pid: -42_424, signal: 0 },
    { pid: -42_424, signal: 'SIGKILL' },
  ])
  assert.deepEqual(macTermination, { terminated: true, signal: 'SIGKILL' })

  const config = cloneDefaultConfig()
  const workspace = new AgentWorkspaceService({
    userDataPath: tempDir,
    settings: () => config.tools.workspace,
    isFullAccessProfile: (profile) =>
      profile !== 'minimal' && config.tools.terminal[profile].fullAccess,
  })
  const terminatedProcessIds: number[] = []
  const processTree = createLocalProcessTreeController()
  const supervisor = new ProcessSupervisor({
    maxForegroundProcesses: () => config.tools.terminal.maxForegroundProcesses,
    maxBackgroundProcesses: () => config.tools.terminal.maxBackgroundProcesses,
    backgroundMaxLifetimeMs: () => config.tools.terminal.backgroundMaxLifetimeMs,
    processTree: {
      detached: processTree.detached,
      terminate: (child) => {
        if (child.pid) terminatedProcessIds.push(child.pid)
        return processTree.terminate(child)
      },
    },
  })
  const terminal = new TerminalService({
    workspace,
    supervisor,
    settings: () => config.tools.terminal,
    workspaceSettings: () => config.tools.workspace,
    sandbox: createPassthroughTerminalSandbox(),
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

  const externalReadRoot = join(tempDir, 'external-read')
  const externalWriteRoot = join(tempDir, 'external-read-write')
  const outsideGrantRoot = join(tempDir, 'outside-grant')
  await Promise.all([mkdir(externalReadRoot), mkdir(externalWriteRoot), mkdir(outsideGrantRoot)])
  const externalReadPath = join(externalReadRoot, 'read-only.txt')
  const externalWritePath = join(externalWriteRoot, 'editable.txt')
  const outsideSecretPath = join(outsideGrantRoot, 'outside.txt')
  await Promise.all([
    writeFile(externalReadPath, 'authorized read'),
    writeFile(externalWritePath, 'before patch'),
    writeFile(outsideSecretPath, 'outside grant'),
    writeFile(join(externalReadRoot, '.env'), 'SECRET=1'),
  ])
  await symlink(
    outsideGrantRoot,
    join(externalWriteRoot, 'escape-link'),
    process.platform === 'win32' ? 'junction' : 'dir'
  )
  config.tools.workspace.externalRoots = [
    {
      id: 'session-read',
      path: externalReadRoot,
      access: 'read',
      scope: 'session',
      sessionId: 'session-1',
      enabled: true,
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: 'power-read-write',
      path: externalWriteRoot,
      access: 'read-write',
      scope: 'profile',
      profile: 'power',
      enabled: true,
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: 'global-read',
      path: outsideGrantRoot,
      access: 'read',
      scope: 'global',
      enabled: true,
      createdAt: 1,
      updatedAt: 1,
    },
  ]
  const powerExternalAccess = { profile: 'power' as const }
  const externalRead = await workspace.readFile({
    sessionId: 'session-1',
    path: externalReadPath,
    access: powerExternalAccess,
  })
  assert.equal(externalRead.content, 'authorized read')
  const globalRead = await workspace.readFile({
    sessionId: 'another-session',
    path: outsideSecretPath,
    access: powerExternalAccess,
  })
  assert.equal(globalRead.content, 'outside grant')
  await assert.rejects(
    () =>
      workspace.writeFile({
        sessionId: 'session-1',
        path: join(externalReadRoot, 'denied.txt'),
        content: 'denied',
        access: powerExternalAccess,
      }),
    AgentWorkspaceError
  )
  await assert.rejects(
    () =>
      workspace.readFile({
        sessionId: 'another-session',
        path: externalReadPath,
        access: powerExternalAccess,
      }),
    AgentWorkspaceError
  )
  config.tools.terminal.power.fullAccess = false
  await assert.rejects(
    () =>
      workspace.readFile({
        sessionId: 'session-1',
        path: externalReadPath,
        access: powerExternalAccess,
      }),
    AgentWorkspaceError
  )
  config.tools.terminal.power.fullAccess = true
  await assert.rejects(
    () =>
      workspace.readFile({
        sessionId: 'session-1',
        path: externalWritePath,
        access: { profile: 'assistant' },
      }),
    AgentWorkspaceError
  )
  await assert.rejects(
    () =>
      workspace.readFile({
        sessionId: 'session-1',
        path: join(externalReadRoot, '.env'),
        access: powerExternalAccess,
      }),
    AgentWorkspaceError
  )
  await workspace.writeFile({
    sessionId: 'session-1',
    path: externalWritePath,
    content: 'before patch',
    access: powerExternalAccess,
  })
  await workspace.patchFile({
    sessionId: 'session-1',
    path: externalWritePath,
    oldText: 'before',
    newText: 'after',
    access: powerExternalAccess,
  })
  assert.equal(await readFile(externalWritePath, 'utf8'), 'after patch')
  const externalSearch = await workspace.searchFiles({
    sessionId: 'session-1',
    path: externalWriteRoot,
    query: 'after',
    access: powerExternalAccess,
  })
  assert.equal(externalSearch.matches[0]?.path, externalWritePath.replace(/\\/g, '/'))
  await assert.rejects(
    () =>
      workspace.readFile({
        sessionId: 'session-1',
        path: join(externalWriteRoot, 'escape-link', 'outside.txt'),
        access: powerExternalAccess,
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

  process.env.OMNIPAW_SECRET_TEST = 'must-not-leak'
  const envResult = await terminal.execute({
    sessionId: 'session-1',
    profile: 'power',
    command: `node -e "process.stdout.write(process.env.OMNIPAW_SECRET_TEST || '')"`,
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

  const treeChildPidPath = join(status.filesPath, 'tree-child.pid')
  const descendantCode = 'setInterval(() => {}, 1000)'
  const parentCode = [
    "const { spawn } = require('node:child_process')",
    "const { writeFileSync } = require('node:fs')",
    `const child = spawn(process.execPath, ['-e', ${JSON.stringify(descendantCode)}], { stdio: 'ignore' })`,
    `writeFileSync(${JSON.stringify(treeChildPidPath)}, String(child.pid))`,
    'setInterval(() => {}, 1000)',
  ].join(';')
  const encodedParentCode = Buffer.from(parentCode, 'utf8').toString('base64')
  const backgroundResult = await terminal.execute({
    sessionId: 'session-1',
    profile: 'power',
    command: `node -e "eval(Buffer.from('${encodedParentCode}','base64').toString('utf8'))"`,
    background: true,
  })
  assert.equal(backgroundResult.process.background, true)
  assert.equal(terminal.listProcesses({ sessionId: 'session-1' }).length > 0, true)
  await waitFor(async () => {
    const value = await readFile(treeChildPidPath, 'utf8').catch(() => '')
    return /^\d+$/.test(value.trim())
  })
  const treeChildPid = Number((await readFile(treeChildPidPath, 'utf8')).trim())
  const terminationCountBefore = terminatedProcessIds.length
  const terminationResults = await Promise.all([
    terminal.killProcess(backgroundResult.process.id),
    terminal.killProcess(backgroundResult.process.id),
  ])
  assert.deepEqual(terminationResults, [true, true])
  assert.equal(terminatedProcessIds.length, terminationCountBefore + 1)
  await waitFor(() => !isProcessAlive(treeChildPid))

  const sessionOneBackground = await terminal.execute({
    sessionId: 'session-1',
    profile: 'power',
    command: `node -e "setTimeout(() => {}, 5000)"`,
    background: true,
  })
  const sessionTwoBackground = await terminal.execute({
    sessionId: 'session-2',
    profile: 'power',
    command: `node -e "setTimeout(() => {}, 5000)"`,
    background: true,
  })
  assert.equal(sessionOneBackground.process.status, 'running')
  assert.equal(sessionTwoBackground.process.status, 'running')
  assert.equal((await terminal.cleanupSession('session-1')) >= 1, true)
  assert.equal(terminal.listProcesses({ sessionId: 'session-1' }).length, 0)
  assert.equal(terminal.listProcesses({ sessionId: 'session-2' }).length, 1)

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
  const workspaceTool = tools.find((tool) => tool.name === 'workspace_file')
  const externalApprovalPlan = await workspaceTool?.approvalPlan?.(
    { action: 'write', path: externalWritePath, content: 'tool write' },
    { sessionId: 'session-1', runId: 'run-1', policyProfile: 'power' }
  )
  assert.equal(externalApprovalPlan?.kind, 'workspace')
  assert.equal(
    externalApprovalPlan?.kind === 'workspace' ? externalApprovalPlan.scope : undefined,
    'external-root'
  )

  const executor = new ToolExecutor()
  const externalToolRead = await executor.execute({
    toolCall: {
      id: 'tool-external-read',
      type: 'function',
      function: {
        name: 'workspace_file',
        arguments: JSON.stringify({ action: 'read', path: externalReadPath }),
      },
    },
    tools,
    policy: defaultToolPolicy('power'),
    sessionId: 'session-1',
    runId: 'run-1',
  })
  assert.equal(externalToolRead.result.status, 'complete')
  assert.match(externalToolRead.result.resultText, /authorized read/)
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

  const terminalFailure = await executor.execute({
    toolCall: {
      id: 'tool-3',
      type: 'function',
      function: {
        name: 'terminal_exec',
        arguments: JSON.stringify({
          command: `node -e "process.stderr.write('missing converter'); process.exit(2)"`,
        }),
      },
    },
    tools,
    policy: defaultToolPolicy('assistant'),
    sessionId: 'session-1',
    runId: 'run-1',
    approval: {
      request: async (display) => {
        assert.equal(display.approval?.plan?.kind, 'terminal')
        return true
      },
      update: () => {},
    },
  })
  assert.equal(terminalFailure.result.status, 'complete')
  assert.match(terminalFailure.result.resultText, /"status":"failed"/)
  assert.match(terminalFailure.result.resultText, /missing converter/)

  await writeFile(join(status.filesPath, 'binary.bin'), Buffer.from([0, 1, 2, 3]))
  const binary = await workspace.readFile({ sessionId: 'session-1', path: 'binary.bin' })
  assert.equal(binary.binary, true)

  assert.equal((await terminal.dispose()) >= 1, true)
  assert.equal(terminal.listProcesses().length, 0)
  assert.equal(terminatedProcessIds.length >= 4, true)
  await workspace.cleanupWorkspace('session-1')
  console.log('Local agent workspace and terminal smoke check passed')
} finally {
  delete process.env.OMNIPAW_SECRET_TEST
  rmSync(tempDir, { recursive: true, force: true })
}

async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 5_000
): Promise<void> {
  const startedAt = Date.now()
  while (!(await predicate())) {
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error(`Timed out waiting for local process state after ${timeoutMs}ms.`)
    }
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

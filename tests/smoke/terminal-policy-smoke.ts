import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ProcessSupervisor, TerminalPolicyError, TerminalService } from '../../core/agent/terminal'
import {
  createBuiltinTools,
  listBuiltinToolDefinitions,
} from '../../core/agent/tools/builtin-tools'
import { ToolExecutor } from '../../core/agent/tools/executor'
import { defaultToolPolicy } from '../../core/agent/tools/policy'
import { AgentWorkspaceService } from '../../core/agent/workspace'
import { cloneDefaultConfig, normalizeConfig } from '../../core/config/schema'
import { createPassthroughTerminalSandbox } from './terminal-sandbox-fixture'

const tempDir = mkdtempSync(join(tmpdir(), 'omnipaw-terminal-policy-smoke-'))

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
    workspaceSettings: () => config.tools.workspace,
    sandbox: createPassthroughTerminalSandbox(),
  })

  const terminalDefinition = listBuiltinToolDefinitions().find(
    (definition) => definition.name === 'terminal_exec'
  )
  assert.ok(terminalDefinition)
  assert.equal('pty' in terminalDefinition.parameters.properties, false)

  const legacyConfig = cloneDefaultConfig() as ReturnType<typeof cloneDefaultConfig> & {
    tools: {
      terminal: {
        assistant: { allowPty?: boolean }
        power: { allowPty?: boolean }
      }
    }
  }
  legacyConfig.tools.terminal.assistant.allowPty = false
  legacyConfig.tools.terminal.power.allowPty = true
  const normalizedLegacyConfig = normalizeConfig(legacyConfig).config
  assert.equal('allowPty' in normalizedLegacyConfig.tools.terminal.assistant, false)
  assert.equal('allowPty' in normalizedLegacyConfig.tools.terminal.power, false)

  await assert.rejects(
    terminal.createApprovalPlan({
      sessionId: 'policy-session',
      profile: 'assistant',
      command: 'echo background',
      background: true,
    }),
    isTerminalPolicyError('Background terminal execution is disabled')
  )

  config.tools.terminal.assistant.allowBackground = true
  const assistantBackgroundPlan = await terminal.createApprovalPlan({
    sessionId: 'policy-session',
    profile: 'assistant',
    command: 'echo background',
    background: true,
  })
  assert.equal(assistantBackgroundPlan.background, true)
  config.tools.terminal.assistant.allowBackground = false

  config.tools.terminal.power.allowBackground = false
  await assert.rejects(
    terminal.createApprovalPlan({
      sessionId: 'policy-session',
      profile: 'power',
      command: 'echo background',
      background: true,
    }),
    isTerminalPolicyError('Background terminal execution is disabled')
  )
  config.tools.terminal.power.allowBackground = true

  config.tools.terminal.assistant.commandAllowPatterns = ['echo allowed*']
  const allowedCommandPlan = await terminal.createApprovalPlan({
    sessionId: 'policy-session',
    profile: 'assistant',
    command: 'echo allowed command',
  })
  assert.equal(allowedCommandPlan.command, 'echo allowed command')
  await assert.rejects(
    terminal.createApprovalPlan({
      sessionId: 'policy-session',
      profile: 'assistant',
      command: 'echo outside-list',
    }),
    isTerminalPolicyError('outside the active command allow list')
  )
  config.tools.terminal.assistant.commandAllowPatterns = []

  config.tools.terminal.assistant.commandDenyPatterns = ['*blocked-command*']
  await assert.rejects(
    terminal.createApprovalPlan({
      sessionId: 'policy-session',
      profile: 'assistant',
      command: 'echo BLOCKED-COMMAND',
    }),
    isTerminalPolicyError('denied by the active command policy')
  )
  config.tools.terminal.assistant.commandDenyPatterns = []

  config.tools.terminal.power.commandDenyPatterns = ['*blocked-power*']
  await assert.rejects(
    terminal.createApprovalPlan({
      sessionId: 'policy-session',
      profile: 'power',
      command: 'echo blocked-power',
    }),
    isTerminalPolicyError('denied by the active command policy')
  )
  config.tools.terminal.power.commandDenyPatterns = []

  config.tools.terminal.power.fullAccess = false
  const restrictedPowerPlan = await terminal.createApprovalPlan({
    sessionId: 'policy-session',
    profile: 'power',
    command: 'echo restricted',
  })
  assert.equal(restrictedPowerPlan.fullAccess, false)
  assert.equal(restrictedPowerPlan.accessScope, 'managed-workspace')

  config.tools.terminal.power.fullAccess = true
  const fullAccessPowerPlan = await terminal.createApprovalPlan({
    sessionId: 'policy-session',
    profile: 'power',
    command: 'echo full-access',
  })
  assert.equal(fullAccessPowerPlan.fullAccess, true)
  assert.equal(fullAccessPowerPlan.accessScope, 'full-local-access')

  config.tools.terminal.assistant.network = 'deny'
  const offlinePlan = await terminal.createApprovalPlan({
    sessionId: 'policy-session',
    profile: 'assistant',
    command: 'echo denied-network',
  })
  assert.equal(offlinePlan.network, 'deny')

  config.tools.terminal.assistant.network = 'ask'
  assert.equal(
    terminal.resolveNetworkPolicy({ profile: 'assistant', network: 'allow' }),
    'ask',
    'A request must not widen the profile network policy.'
  )
  const assistantAskPlan = await terminal.createApprovalPlan({
    sessionId: 'policy-session',
    profile: 'assistant',
    command: 'echo ask-network',
    network: 'allow',
  })
  assert.equal(assistantAskPlan.network, 'ask')

  config.tools.terminal.power.network = 'allow'
  assert.equal(terminal.resolveNetworkPolicy({ profile: 'power', network: 'ask' }), 'ask')
  await assert.rejects(
    terminal.createApprovalPlan({
      sessionId: 'policy-session',
      profile: 'power',
      command: 'echo request-deny',
      network: 'deny',
    }),
    isTerminalPolicyError('disabled by the active network policy')
  )

  config.tools.terminal.power.network = 'ask'
  config.tools.terminal.power.fullAccess = false
  const powerPolicy = defaultToolPolicy('power')
  const powerTools = createBuiltinTools({
    messages: {} as never,
    attachments: {} as never,
    sessionId: 'policy-session',
    workspaceService: workspace,
    terminalService: terminal,
    toolSettings: () => config.tools,
    policy: powerPolicy,
  })
  const powerTerminalTool = powerTools.find((tool) => tool.name === 'terminal_exec')
  assert.equal(powerTerminalTool?.localCapability?.fullAccess, false)

  let approvalRequested = false
  const approvedResult = await new ToolExecutor().execute({
    toolCall: {
      id: 'terminal-policy-approved',
      type: 'function',
      function: {
        name: 'terminal_exec',
        arguments: JSON.stringify({
          command: `node -e "process.stdout.write('approved')"`,
        }),
      },
    },
    tools: powerTools,
    policy: powerPolicy,
    sessionId: 'policy-session',
    runId: 'policy-run',
    approval: {
      request: async (display) => {
        approvalRequested = true
        assert.equal(display.approval?.risk, 'network')
        assert.equal(display.approval?.plan?.kind, 'terminal')
        if (display.approval?.plan?.kind === 'terminal') {
          assert.equal(display.approval.plan.network, 'ask')
        }
        return true
      },
      update: () => {},
    },
  })
  assert.equal(approvalRequested, true)
  assert.equal(approvedResult.result.status, 'complete')
  assert.match(approvedResult.result.resultText, /approved/)

  config.tools.terminal.power.network = 'allow'
  config.tools.terminal.power.commandDenyPatterns = ['*blocked-by-tool-policy*']
  const deniedResult = await new ToolExecutor().execute({
    toolCall: {
      id: 'terminal-policy-denied',
      type: 'function',
      function: {
        name: 'terminal_exec',
        arguments: JSON.stringify({ command: 'echo blocked-by-tool-policy' }),
      },
    },
    tools: powerTools,
    policy: powerPolicy,
    sessionId: 'policy-session',
    runId: 'policy-run',
  })
  assert.equal(deniedResult.result.status, 'denied')
  assert.equal(deniedResult.result.error?.code, 'tool_denied')

  await assert.rejects(
    terminal.createApprovalPlan({
      sessionId: 'policy-session',
      profile: 'minimal',
      command: 'echo minimal',
    }),
    isTerminalPolicyError('disabled for the minimal profile')
  )

  await terminal.dispose()
  await workspace.cleanupWorkspace('policy-session')
  console.log('Terminal execution policy smoke check passed')
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}

function isTerminalPolicyError(messageFragment: string): (error: unknown) => boolean {
  return (error) => {
    assert.equal(error instanceof TerminalPolicyError, true)
    assert.match((error as Error).message, new RegExp(messageFragment))
    return true
  }
}

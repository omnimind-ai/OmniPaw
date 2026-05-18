import assert from 'node:assert/strict'

import { AgentRunner } from '../core/agent/agent-runner'
import { ToolExecutor } from '../core/agent/tool-executor'
import { defaultToolPolicy } from '../core/agent/tool-policy'
import type { AgentTool } from '../core/agent/tool'
import type { ChatCompletionChunk, ChatCompletionRequest, ProviderToolCall } from '../core/provider/base-provider'
import type { ChatMessage, ChatMessagePart, ChatRun, ChatSession } from '../shared/types/chat'
import type { ProviderConfig, ProviderModel } from '../shared/types/provider'

async function runSmoke(): Promise<void> {
  await testAgentRunnerPlainReply()
  await testAgentRunnerToolLoop()
  await testAgentRunnerToolLoopPreservesReasoningContent()
  await testAgentRunnerMcpToolLoop()
  await testAgentRunnerMaxSteps()
  await testToolExecutorSuccess()
  await testToolExecutorMcpApprovalDenied()
  await testToolExecutorDenied()
  await testToolExecutorInvalidArguments()
  await testToolExecutorTimeout()

  console.log('Agent runtime smoke check passed')
}

async function testAgentRunnerPlainReply(): Promise<void> {
  const harness = createRunnerHarness([
    [
      { type: 'delta', content: 'plain answer', done: false },
      { type: 'final', done: true, finishReason: 'stop', usage: { total: 3 } },
    ],
  ])

  await harness.runner.run(harness.input())

  const assistant = harness.messageRepo.get('assistant-1')
  assert.equal(assistant?.status, 'complete')
  assert.equal((assistant?.parts[0] as { text?: string } | undefined)?.text, 'plain answer')
  assert.equal(harness.runRepo.get('run-1')?.status, 'complete')
  assert.equal(harness.finishedRuns.includes('run-1'), true)
}

async function testAgentRunnerToolLoop(): Promise<void> {
  const harness = createRunnerHarness([
    [
      {
        type: 'tool_call_final',
        done: false,
        toolCalls: [toolCall('call_time', 'system_time', {})],
        finishReason: 'tool_calls',
      },
      { type: 'final', done: true, finishReason: 'tool_calls' },
    ],
    [
      { type: 'delta', content: 'time checked', done: false },
      { type: 'final', done: true, finishReason: 'stop' },
    ],
  ])

  await harness.runner.run(harness.input())

  const assistant = harness.messageRepo.get('assistant-1')
  const toolPart = assistant?.parts.find((part) => part.type === 'tool_call')
  assert.equal(toolPart?.tool_calls?.[0]?.status, 'complete')
  assert.equal(toolPart?.tool_calls?.[0]?.name, 'system_time')
  assert.match(JSON.stringify(toolPart?.tool_calls?.[0]?.result), /now/)
  assert.equal(assistant?.parts.some((part) => part.type === 'plain' && String(part.text).includes('time checked')), true)
}

async function testAgentRunnerToolLoopPreservesReasoningContent(): Promise<void> {
  const harness = createRunnerHarness([
    [
      { type: 'delta', reasoning: 'Need current time before answering.', done: false },
      { type: 'delta', content: 'Checking the clock.', done: false },
      {
        type: 'tool_call_final',
        done: false,
        toolCalls: [toolCall('call_time', 'system_time', {})],
        finishReason: 'tool_calls',
      },
      { type: 'final', done: true, finishReason: 'tool_calls' },
    ],
    [
      { type: 'delta', content: 'time checked', done: false },
      { type: 'final', done: true, finishReason: 'stop' },
    ],
  ])

  await harness.runner.run(harness.input())

  const followupToolMessage = harness.providerRequests[1]?.messages.find((message) => message.role === 'assistant' && message.toolCalls?.length)
  assert.equal(followupToolMessage?.reasoningContent, 'Need current time before answering.')
  assert.equal(followupToolMessage?.content, 'Checking the clock.')
  assert.equal(followupToolMessage?.toolCalls?.[0]?.id, 'call_time')
}

async function testAgentRunnerMcpToolLoop(): Promise<void> {
  const mcpTool: AgentTool<{ text?: string }> = {
    name: 'mcp_server_echo',
    providerName: 'mcp_server_echo',
    label: 'Echo',
    description: 'Echo text through an MCP tool.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string' },
      },
    },
    risk: 'read',
    source: 'mcp',
    serverId: 'server-1',
    serverName: 'Server One',
    profiles: ['assistant', 'power'],
    execute: async (_id, args) => ({
      content: [{ type: 'text', text: `mcp:${args.text ?? ''}` }],
    }),
  }
  const harness = createRunnerHarness([
    [
      {
        type: 'tool_call_final',
        done: false,
        toolCalls: [toolCall('call_echo', 'mcp_server_echo', { text: 'hello' })],
        finishReason: 'tool_calls',
      },
      { type: 'final', done: true, finishReason: 'tool_calls' },
    ],
    [
      { type: 'delta', content: 'mcp checked', done: false },
      { type: 'final', done: true, finishReason: 'stop' },
    ],
  ], { tools: [mcpTool] })

  await harness.runner.run(harness.input({ toolProfile: 'assistant' }))

  assert.equal(harness.providerRequests[0]?.tools?.some((tool) => tool.function.name === 'mcp_server_echo'), true)
  const snapshot = harness.runRepo.get('run-1')?.requestSnapshot
  assert.equal(snapshot?.toolSources?.some((tool) => tool.name === 'mcp_server_echo' && tool.source === 'mcp'), true)
  const assistant = harness.messageRepo.get('assistant-1')
  const toolPart = assistant?.parts.find((part) => part.type === 'tool_call')
  assert.equal(toolPart?.tool_calls?.[0]?.status, 'complete')
  assert.equal(toolPart?.tool_calls?.[0]?.name, 'mcp_server_echo')
  assert.match(JSON.stringify(toolPart?.tool_calls?.[0]?.result), /mcp:hello/)
}

async function testAgentRunnerMaxSteps(): Promise<void> {
  const harness = createRunnerHarness([
    [
      {
        type: 'tool_call_final',
        done: false,
        toolCalls: [toolCall('call_time', 'system_time', {})],
        finishReason: 'tool_calls',
      },
      { type: 'final', done: true, finishReason: 'tool_calls' },
    ],
  ])

  await harness.runner.run(harness.input({ maxSteps: 1 }))

  const assistant = harness.messageRepo.get('assistant-1')
  assert.equal(assistant?.status, 'complete')
  assert.equal(assistant?.parts.some((part) => part.type === 'plain' && String(part.text).includes('maximum agent steps')), true)
}

async function testToolExecutorSuccess(): Promise<void> {
  const executor = new ToolExecutor()
  const tool: AgentTool<{ value: number }> = {
    name: 'calculator',
    description: 'test calculator',
    parameters: { type: 'object' },
    risk: 'safe',
    source: 'builtin',
    execute: async (_id, args) => ({
      content: [{ type: 'text', text: String(args.value * 2) }],
    }),
  }

  const output = await executor.execute({
    toolCall: toolCall('call_1', 'calculator', { value: 21 }),
    tools: [tool],
    policy: defaultToolPolicy('minimal'),
  })

  assert.equal(output.result.status, 'complete')
  assert.equal(output.result.resultText, '42')
  assert.equal(output.display.status, 'complete')
}

async function testToolExecutorMcpApprovalDenied(): Promise<void> {
  const executor = new ToolExecutor()
  const tool: AgentTool = {
    name: 'mcp_network_lookup',
    providerName: 'mcp_network_lookup',
    description: 'network MCP lookup',
    parameters: { type: 'object' },
    risk: 'network',
    source: 'mcp',
    serverId: 'server-1',
    profiles: ['assistant', 'power'],
    execute: async () => ({ content: [{ type: 'text', text: 'never' }] }),
  }

  const output = await executor.execute({
    toolCall: toolCall('call_mcp', 'mcp_network_lookup', {}),
    tools: [tool],
    policy: defaultToolPolicy('assistant'),
  })

  assert.equal(output.result.status, 'denied')
  assert.equal(output.result.error?.code, 'approval_required')
  assert.match(output.result.resultText, /requires approval/i)
}

async function testToolExecutorDenied(): Promise<void> {
  const executor = new ToolExecutor()
  const output = await executor.execute({
    toolCall: toolCall('call_shell', 'shell', { command: 'echo nope' }),
    tools: [],
    policy: defaultToolPolicy('minimal'),
  })

  assert.equal(output.result.status, 'denied')
  assert.equal(output.display.status, 'denied')
  assert.match(output.result.resultText, /not registered|not available|denied/i)
}

async function testToolExecutorInvalidArguments(): Promise<void> {
  const executor = new ToolExecutor()
  const tool: AgentTool = {
    name: 'calculator',
    description: 'test calculator',
    parameters: { type: 'object' },
    risk: 'safe',
    source: 'builtin',
    execute: async () => ({ content: [{ type: 'text', text: 'never' }] }),
  }

  const output = await executor.execute({
    toolCall: {
      id: 'call_bad',
      type: 'function',
      function: { name: 'calculator', arguments: '{"value":' },
    },
    tools: [tool],
    policy: defaultToolPolicy('minimal'),
  })

  assert.equal(output.result.status, 'error')
  assert.equal(output.result.error?.code, 'tool_arguments_invalid')
}

async function testToolExecutorTimeout(): Promise<void> {
  const executor = new ToolExecutor()
  const tool: AgentTool = {
    name: 'calculator',
    description: 'slow calculator',
    parameters: { type: 'object' },
    risk: 'safe',
    source: 'builtin',
    timeoutMs: 5,
    execute: async () => new Promise((resolve) => {
      setTimeout(() => resolve({ content: [{ type: 'text', text: 'late' }] }), 50)
    }),
  }

  const output = await executor.execute({
    toolCall: toolCall('call_slow', 'calculator', {}),
    tools: [tool],
    policy: defaultToolPolicy('minimal'),
  })

  assert.equal(output.result.status, 'error')
  assert.equal(output.result.error?.code, 'tool_timeout')
}

function toolCall(id: string, name: string, args: unknown): ProviderToolCall {
  return {
    id,
    type: 'function',
    function: {
      name,
      arguments: JSON.stringify(args),
    },
  }
}

function createRunnerHarness(
  scriptedResponses: ChatCompletionChunk[][],
  options: { tools?: AgentTool[] } = {},
) {
  const session: ChatSession = {
    id: 'session-1',
    title: 'Smoke',
    status: 'active',
    createdAt: 1,
    updatedAt: 1,
  }
  const provider: ProviderConfig = {
    id: 'provider-1',
    name: 'Provider',
    baseUrl: 'https://example.test/v1',
    enabled: true,
    capabilities: { tools: true },
    models: [],
  }
  const model: ProviderModel = {
    id: 'model-1',
    name: 'Model',
    supportsTools: true,
  }
  const user: ChatMessage = {
    id: 'user-1',
    sessionId: session.id,
    role: 'user',
    status: 'complete',
    parts: [{ type: 'plain', text: 'hello' }],
    createdAt: 1,
    updatedAt: 1,
  }
  const assistant: ChatMessage = {
    id: 'assistant-1',
    sessionId: session.id,
    role: 'assistant',
    status: 'streaming',
    parts: [],
    createdAt: 2,
    updatedAt: 2,
  }
  const run: ChatRun = {
    id: 'run-1',
    sessionId: session.id,
    userMessageId: user.id,
    assistantMessageId: assistant.id,
    providerId: provider.id,
    modelId: model.id,
    status: 'running',
    createdAt: 1,
    updatedAt: 1,
  }
  const messageRepo = new MemoryMessageRepo([user, assistant])
  const runRepo = new MemoryRunRepo(run)
  const runManager = new MemoryRunManager()
  const providerRequests: ChatCompletionRequest[] = []
  let callIndex = 0
  const runner = new AgentRunner({
    messages: messageRepo as never,
    runs: runRepo as never,
    providers: {
      createProviderClient: async () => ({
        id: 'fake',
        streamChat: async function* (request: ChatCompletionRequest) {
          providerRequests.push(structuredClone(request))
          const chunks = scriptedResponses[callIndex++] ?? []
          for (const chunk of chunks) {
            yield chunk
          }
        },
      }),
    } as never,
    contextBuilder: {
      build: async () => ({
        messages: [{ role: 'user', content: 'hello' }],
        snapshot: {
          api: 'openai-chat-completions',
          model: model.id,
          messageCount: 1,
          attachmentCount: 0,
        },
      }),
    } as never,
    runManager: runManager as never,
    toolRegistry: {
      resolve: () => options.tools ?? [
        {
          name: 'system_time',
          description: 'time',
          parameters: { type: 'object' },
          risk: 'safe',
          source: 'builtin',
          execute: async () => ({ content: [{ type: 'text', text: '{"now":"2026-05-15"}' }] }),
        } satisfies AgentTool,
      ],
    } as never,
  })

  return {
    runner,
    messageRepo,
    runRepo,
    providerRequests,
    finishedRuns: runManager.finishedRuns,
    input: (overrides: Partial<Parameters<AgentRunner['run']>[0]> = {}) => ({
      run,
      session,
      provider,
      model,
      signal: new AbortController().signal,
      ...overrides,
    }),
  }
}

class MemoryMessageRepo {
  private readonly messages = new Map<string, ChatMessage>()

  constructor(messages: ChatMessage[]) {
    for (const message of messages) {
      this.messages.set(message.id, { ...message, parts: [...message.parts] })
    }
  }

  listBySession(sessionId: string): ChatMessage[] {
    return [...this.messages.values()].filter((message) => message.sessionId === sessionId)
  }

  get(id: string): ChatMessage | undefined {
    const message = this.messages.get(id)
    return message ? { ...message, parts: [...message.parts] } : undefined
  }

  updateParts(
    id: string,
    parts: ChatMessagePart[],
    fields: Partial<Pick<ChatMessage, 'status' | 'usage' | 'error' | 'metadata'>> = {},
  ): boolean {
    const message = this.messages.get(id)
    if (!message) return false
    this.messages.set(id, {
      ...message,
      parts: structuredClone(parts),
      status: fields.status ?? message.status,
      usage: fields.usage,
      error: fields.error,
      metadata: fields.metadata,
    })
    return true
  }
}

class MemoryRunRepo {
  private run: ChatRun

  constructor(run: ChatRun) {
    this.run = { ...run }
  }

  get(id: string): ChatRun | undefined {
    return this.run.id === id ? { ...this.run } : undefined
  }

  save(run: ChatRun): ChatRun {
    this.run = { ...this.run, ...run }
    return { ...this.run }
  }

  updateStatus(id: string, status: ChatRun['status'], fields: Partial<Pick<ChatRun, 'usage' | 'error' | 'abortReason' | 'finishedAt'>> = {}): boolean {
    if (this.run.id !== id) return false
    this.run = { ...this.run, ...fields, status }
    return true
  }
}

class MemoryRunManager {
  readonly finishedRuns: string[] = []
  private seq = 0

  nextSeq(): number {
    this.seq += 1
    return this.seq
  }

  emit(): void {}

  finish(runId: string): void {
    this.finishedRuns.push(runId)
  }
}

await runSmoke()

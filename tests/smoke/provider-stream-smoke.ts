import assert from 'node:assert/strict'
import type { ChatCompletionChunk, ChatCompletionRequest } from '../../core/provider/base-provider'
import { ProviderError } from '../../core/provider/base-provider'
import { OPENAI_COMPATIBLE_FALLBACK_CONTEXT_WINDOW } from '../../core/provider/models-dev-metadata'
import { OpenAICompatibleProvider } from '../../core/provider/providers/openai'
import { OpenAICodexProvider } from '../../core/provider/providers/openai-codex'

await testToolCallAggregation()
await testToolCallArgumentIndexDrift()
await testTextDeltaAndUsageFinal()
await testJsonChatCompletionFallback()
await testEmptySseFails()
await testMalformedStreamJson()
await testListModelsUsesConfiguredAuthHeader()
await testListModelsParsesSsePayload()
await testOpenAICodexOAuthResponsesStream()

console.log('Provider stream smoke check passed')

async function testToolCallAggregation(): Promise<void> {
  let requestBody: unknown
  const tools: ChatCompletionRequest['tools'] = [
    {
      type: 'function',
      function: {
        name: 'get_weather',
        description: 'Get weather.',
        parameters: {
          type: 'object',
          properties: {
            city: { type: 'string' },
          },
          required: ['city'],
        },
      },
    },
  ]
  const provider = new OpenAICompatibleProvider({
    id: 'test',
    baseUrl: 'https://example.test/v1',
    apiKey: 'test-key',
    fetch: (async (_input, init) => {
      requestBody = JSON.parse(String(init?.body))
      return new Response(
        sseStream([
          {
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call_weather',
                      type: 'function',
                      function: {
                        name: 'get_',
                        arguments: '{"city"',
                      },
                    },
                  ],
                },
              },
            ],
          },
          {
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      function: {
                        name: 'weather',
                        arguments: ':"Shanghai"}',
                      },
                    },
                  ],
                },
                finish_reason: 'tool_calls',
              },
            ],
          },
          {
            choices: [],
            usage: {
              prompt_tokens: 12,
              completion_tokens: 8,
              total_tokens: 20,
              prompt_tokens_details: { cached_tokens: 3 },
              completion_tokens_details: { reasoning_tokens: 2 },
            },
          },
          '[DONE]',
        ]),
        { status: 200 }
      )
    }) as typeof fetch,
  })

  const chunks = await collect(
    provider.streamChat({
      modelId: 'model-a',
      messages: [{ role: 'user', content: 'weather?' }],
      tools,
    })
  )

  assert.deepEqual((requestBody as { tools?: unknown }).tools, tools)
  assert.deepEqual(
    chunks.map((chunk) => chunk.type),
    ['tool_call_delta', 'tool_call_delta', 'tool_call_final', 'final']
  )

  const firstDelta = chunks[0]
  assert.equal(firstDelta.type, 'tool_call_delta')
  assert.equal(firstDelta.index, 0)
  assert.equal(firstDelta.id, 'call_weather')
  assert.equal(firstDelta.toolCallType, 'function')
  assert.equal(firstDelta.name, 'get_')
  assert.equal(firstDelta.argumentsDelta, '{"city"')

  const finalToolCall = chunks[2]
  assert.equal(finalToolCall.type, 'tool_call_final')
  assert.deepEqual(finalToolCall.toolCalls, [
    {
      id: 'call_weather',
      type: 'function',
      function: {
        name: 'get_weather',
        arguments: '{"city":"Shanghai"}',
      },
    },
  ])

  const final = chunks[3]
  assert.equal(final.type, 'final')
  assert.equal(final.finishReason, 'tool_calls')
  assert.deepEqual(final.usage, {
    input: 12,
    output: 8,
    total: 20,
    cachedInput: 3,
    reasoning: 2,
  })
}

async function testToolCallArgumentIndexDrift(): Promise<void> {
  const provider = new OpenAICompatibleProvider({
    id: 'test',
    baseUrl: 'https://example.test/v1',
    apiKey: 'test-key',
    fetch: (async () =>
      new Response(
        sseStream([
          {
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call_time',
                      type: 'function',
                      function: {
                        name: 'system_time',
                        arguments: '',
                      },
                    },
                  ],
                },
              },
            ],
          },
          {
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      index: 1,
                      function: {
                        arguments: '{}',
                      },
                    },
                  ],
                },
                finish_reason: 'tool_calls',
              },
            ],
          },
          '[DONE]',
        ]),
        { status: 200 }
      )) as typeof fetch,
  })

  const chunks = await collect(
    provider.streamChat({
      modelId: 'model-a',
      messages: [{ role: 'user', content: 'time?' }],
      tools: [
        {
          type: 'function',
          function: {
            name: 'system_time',
            parameters: { type: 'object', properties: {}, additionalProperties: false },
          },
        },
      ],
    })
  )

  assert.deepEqual(
    chunks.map((chunk) => chunk.type),
    ['tool_call_delta', 'tool_call_delta', 'tool_call_final', 'final']
  )

  const argumentDelta = chunks[1]
  assert.equal(argumentDelta.type, 'tool_call_delta')
  assert.equal(argumentDelta.index, 0)
  assert.equal(argumentDelta.argumentsDelta, '{}')

  const finalToolCall = chunks[2]
  assert.equal(finalToolCall.type, 'tool_call_final')
  assert.deepEqual(finalToolCall.toolCalls, [
    {
      id: 'call_time',
      type: 'function',
      function: {
        name: 'system_time',
        arguments: '{}',
      },
    },
  ])
}

async function testMalformedStreamJson(): Promise<void> {
  const provider = new OpenAICompatibleProvider({
    id: 'test',
    baseUrl: 'https://example.test/v1',
    apiKey: 'test-key',
    fetch: (async () =>
      new Response(rawSseStream(['{"choices":[']), { status: 200 })) as typeof fetch,
  })

  await assert.rejects(
    async () => {
      await collect(
        provider.streamChat({
          modelId: 'model-a',
          messages: [{ role: 'user', content: 'hello' }],
        })
      )
    },
    (error) => {
      assert.equal(error instanceof ProviderError, true)
      assert.equal((error as ProviderError).chatError.code, 'provider_bad_request')
      return true
    }
  )
}

async function testJsonChatCompletionFallback(): Promise<void> {
  const provider = new OpenAICompatibleProvider({
    id: 'test',
    baseUrl: 'https://example.test/v1',
    apiKey: 'test-key',
    fetch: (async () =>
      Response.json({
        choices: [
          {
            message: {
              content: 'plain json reply',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 2,
          completion_tokens: 3,
          total_tokens: 5,
        },
      })) as typeof fetch,
  })

  const chunks = await collect(
    provider.streamChat({
      modelId: 'model-a',
      messages: [{ role: 'user', content: 'hello' }],
    })
  )

  assert.deepEqual(
    chunks.map((chunk) => chunk.type),
    ['delta', 'final']
  )
  assert.equal(chunks[0].type, 'delta')
  assert.equal(chunks[0].content, 'plain json reply')
  assert.equal(chunks[1].type, 'final')
  assert.equal(chunks[1].finishReason, 'stop')
  assert.deepEqual(chunks[1].usage, {
    input: 2,
    output: 3,
    total: 5,
    cachedInput: undefined,
    reasoning: undefined,
  })
}

async function testEmptySseFails(): Promise<void> {
  const provider = new OpenAICompatibleProvider({
    id: 'test',
    baseUrl: 'https://example.test/v1',
    apiKey: 'test-key',
    fetch: (async () => new Response('', { status: 200 })) as typeof fetch,
  })

  await assert.rejects(
    async () => {
      await collect(
        provider.streamChat({
          modelId: 'model-a',
          messages: [{ role: 'user', content: 'hello' }],
        })
      )
    },
    (error) => {
      assert.equal(error instanceof ProviderError, true)
      assert.equal((error as ProviderError).chatError.code, 'provider_bad_request')
      assert.match((error as ProviderError).chatError.message, /empty chat completion/)
      return true
    }
  )
}

async function testTextDeltaAndUsageFinal(): Promise<void> {
  const provider = new OpenAICompatibleProvider({
    id: 'test',
    baseUrl: 'https://example.test/v1',
    apiKey: 'test-key',
    fetch: (async () =>
      new Response(
        sseStream([
          {
            choices: [
              {
                delta: {
                  content: 'hello',
                },
              },
            ],
          },
          {
            choices: [
              {
                delta: {
                  reasoning_content: 'thinking',
                },
              },
            ],
          },
          {
            choices: [
              {
                delta: {},
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 4,
              completion_tokens: 5,
              total_tokens: 9,
            },
          },
          '[DONE]',
        ]),
        { status: 200 }
      )) as typeof fetch,
  })

  const chunks = await collect(
    provider.streamChat({
      modelId: 'model-a',
      messages: [{ role: 'user', content: 'hello' }],
    })
  )

  assert.deepEqual(
    chunks.map((chunk) => chunk.type),
    ['delta', 'delta', 'final']
  )
  assert.equal(chunks[0].type, 'delta')
  assert.equal(chunks[0].content, 'hello')
  assert.equal(chunks[1].type, 'delta')
  assert.equal(chunks[1].reasoning, 'thinking')
  assert.equal(chunks[2].type, 'final')
  assert.equal(chunks[2].finishReason, 'stop')
  assert.deepEqual(chunks[2].usage, {
    input: 4,
    output: 5,
    total: 9,
    cachedInput: undefined,
    reasoning: undefined,
  })
}

async function testListModelsUsesConfiguredAuthHeader(): Promise<void> {
  let requestHeaders: Headers
  const provider = new OpenAICompatibleProvider({
    id: 'test',
    baseUrl: 'https://example.test/v1',
    apiKey: 'test-key',
    authHeader: 'X-API-Key',
    fetch: (async (input, init) => {
      const url = requestUrl(input)
      if (url === 'https://example.test/v1/models') {
        requestHeaders = new Headers(init?.headers)
        return Response.json({ data: [{ id: 'model-a' }] }, { status: 200 })
      }
      throw new Error(`Unexpected fetch URL: ${url}`)
    }) as typeof fetch,
  })

  const models = await provider.listModels()

  assert.equal(requestHeaders!.get('X-API-Key'), 'test-key')
  assert.equal(requestHeaders!.get('Accept'), 'application/json')
  assert.equal(requestHeaders!.has('Authorization'), false)
  assert.equal(models[0]?.id, 'model-a')
  assert.equal(models[0]?.name, 'model-a')
  assert.equal(models[0]?.contextWindow, OPENAI_COMPATIBLE_FALLBACK_CONTEXT_WINDOW)
}

async function testListModelsParsesSsePayload(): Promise<void> {
  const provider = new OpenAICompatibleProvider({
    id: 'test',
    baseUrl: 'https://example.test/v1',
    apiKey: 'test-key',
    fetch: (async (input) => {
      const url = requestUrl(input)
      if (url === 'https://example.test/v1/models') {
        return new Response(
          `data:${JSON.stringify({
            object: 'list',
            data: [
              {
                id: 'mimo-vl',
                name: 'Mimo VL',
                context_window: 32000,
                tool_call: true,
                modalities: { input: ['text', 'image'], output: ['text'] },
              },
            ],
          })}\n\n`,
          {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
          }
        )
      }
      throw new Error(`Unexpected fetch URL: ${url}`)
    }) as typeof fetch,
  })

  const models = await provider.listModels()

  assert.equal(models[0]?.id, 'mimo-vl')
  assert.equal(models[0]?.name, 'Mimo VL')
  assert.deepEqual(models[0]?.input, ['text', 'image'])
  assert.equal(models[0]?.supportsTools, true)
  assert.equal(models[0]?.contextWindow, 32000)
}

async function testOpenAICodexOAuthResponsesStream(): Promise<void> {
  let requestHeaders: Headers
  let requestBody: Record<string, unknown>
  const token = jwtWithPayload({
    'https://api.openai.com/auth': {
      chatgpt_account_id: 'acct_test',
    },
  })
  const provider = new OpenAICodexProvider({
    id: 'codex-test',
    baseUrl: 'https://chatgpt.com/backend-api',
    oauthCredentialResolver: async () => ({
      access: token,
      accountId: 'acct_test',
    }),
    fetch: (async (input, init) => {
      assert.equal(requestUrl(input), 'https://chatgpt.com/backend-api/codex/responses')
      requestHeaders = new Headers(init?.headers)
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
      return new Response(
        sseStream([
          { type: 'response.output_text.delta', delta: 'hello' },
          { type: 'response.reasoning_summary_text.delta', delta: 'thinking' },
          {
            type: 'response.completed',
            response: {
              status: 'completed',
              usage: {
                input_tokens: 7,
                output_tokens: 3,
                total_tokens: 10,
                input_tokens_details: { cached_tokens: 2 },
                output_tokens_details: { reasoning_tokens: 1 },
              },
            },
          },
          '[DONE]',
        ]),
        { status: 200 }
      )
    }) as typeof fetch,
  })

  const chunks = await collect(
    provider.streamChat({
      modelId: 'gpt-5.4',
      messages: [
        { role: 'system', content: 'system prompt' },
        { role: 'user', content: 'hello' },
      ],
    })
  )

  assert.equal(requestHeaders!.get('Authorization'), `Bearer ${token}`)
  assert.equal(requestHeaders!.get('chatgpt-account-id'), 'acct_test')
  assert.equal(requestHeaders!.get('OpenAI-Beta'), 'responses=experimental')
  assert.equal(requestBody!.instructions, 'system prompt')
  assert.deepEqual(requestBody!.input, [{ role: 'user', content: 'hello' }])
  assert.deepEqual(
    chunks.map((chunk) => chunk.type),
    ['delta', 'delta', 'final']
  )
  assert.equal(chunks[0]?.type, 'delta')
  assert.equal(chunks[0]?.content, 'hello')
  assert.equal(chunks[1]?.type, 'delta')
  assert.equal(chunks[1]?.reasoning, 'thinking')
  assert.deepEqual(chunks[2]?.usage, {
    input: 7,
    output: 3,
    cachedInput: 2,
    reasoning: 1,
    total: 10,
  })
}

async function collect(stream: AsyncIterable<ChatCompletionChunk>): Promise<ChatCompletionChunk[]> {
  const chunks: ChatCompletionChunk[] = []
  for await (const chunk of stream) {
    chunks.push(chunk)
  }
  return chunks
}

function sseStream(events: Array<Record<string, unknown> | '[DONE]'>): ReadableStream<Uint8Array> {
  return rawSseStream(events.map((event) => (event === '[DONE]' ? event : JSON.stringify(event))))
}

function requestUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === 'string') {
    return input
  }
  if (input instanceof URL) {
    return input.toString()
  }
  return input.url
}

function jwtWithPayload(payload: Record<string, unknown>): string {
  return [
    base64UrlEncode(JSON.stringify({ alg: 'none', typ: 'JWT' })),
    base64UrlEncode(JSON.stringify(payload)),
    'signature',
  ].join('.')
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url')
}

function rawSseStream(events: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder()
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${event}\n\n`))
      }
      controller.close()
    },
  })
}

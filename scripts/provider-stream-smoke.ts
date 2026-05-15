import assert from 'node:assert/strict'

import { ProviderError } from '../core/provider/base-provider'
import { OpenAICompatibleProvider } from '../core/provider/providers/openai'
import type { ChatCompletionChunk, ChatCompletionRequest } from '../core/provider/base-provider'

await testToolCallAggregation()
await testTextDeltaAndUsageFinal()
await testMalformedStreamJson()

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
      return new Response(sseStream([
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
      ]), { status: 200 })
    }) as typeof fetch,
  })

  const chunks = await collect(provider.streamChat({
    modelId: 'model-a',
    messages: [{ role: 'user', content: 'weather?' }],
    tools,
  }))

  assert.deepEqual((requestBody as { tools?: unknown }).tools, tools)
  assert.deepEqual(chunks.map((chunk) => chunk.type), [
    'tool_call_delta',
    'tool_call_delta',
    'tool_call_final',
    'final',
  ])

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

async function testMalformedStreamJson(): Promise<void> {
  const provider = new OpenAICompatibleProvider({
    id: 'test',
    baseUrl: 'https://example.test/v1',
    apiKey: 'test-key',
    fetch: (async () => new Response(rawSseStream(['{"choices":[']), { status: 200 })) as typeof fetch,
  })

  await assert.rejects(
    async () => {
      await collect(provider.streamChat({
        modelId: 'model-a',
        messages: [{ role: 'user', content: 'hello' }],
      }))
    },
    (error) => {
      assert.equal(error instanceof ProviderError, true)
      assert.equal((error as ProviderError).chatError.code, 'provider_bad_request')
      return true
    },
  )
}

async function testTextDeltaAndUsageFinal(): Promise<void> {
  const provider = new OpenAICompatibleProvider({
    id: 'test',
    baseUrl: 'https://example.test/v1',
    apiKey: 'test-key',
    fetch: (async () => new Response(sseStream([
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
    ]), { status: 200 })) as typeof fetch,
  })

  const chunks = await collect(provider.streamChat({
    modelId: 'model-a',
    messages: [{ role: 'user', content: 'hello' }],
  }))

  assert.deepEqual(chunks.map((chunk) => chunk.type), ['delta', 'delta', 'final'])
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

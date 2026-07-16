import assert from 'node:assert/strict'
import type { ChatCompletionChunk, ChatCompletionRequest } from '../../core/provider/base-provider'
import { ProviderError } from '../../core/provider/base-provider'
import {
  MODELS_DEV_METADATA_URL,
  OPENAI_COMPATIBLE_FALLBACK_CONTEXT_WINDOW,
} from '../../core/provider/models-dev-metadata'
import { AnthropicCompatibleProvider } from '../../core/provider/providers/anthropic'
import { OpenAICompatibleProvider } from '../../core/provider/providers/openai'
import { OpenAICodexProvider } from '../../core/provider/providers/openai-codex'

await testAnthropicPayloadAndStream()
await testAnthropicJsonResponse()
await testAnthropicListModelsAndBearerAuth()
await testToolCallAggregation()
await testToolCallArgumentIndexDrift()
await testTextDeltaAndUsageFinal()
await testJsonChatCompletionFallback()
await testEmptySseFails()
await testOpenAIIncompleteStreamFails()
await testAnthropicIncompleteStreamFails()
await testOpenAICodexIncompleteStreamFails()
await testMalformedStreamJson()
await testListModelsUsesConfiguredAuthHeader()
await testListModelsParsesSsePayload()
await testOpenAICodexOAuthResponsesStream()

console.log('Provider stream smoke check passed')

async function testAnthropicPayloadAndStream(): Promise<void> {
  let requestHeaders: Headers
  let requestBody: Record<string, unknown>
  const provider = new AnthropicCompatibleProvider({
    id: 'anthropic-test',
    baseUrl: 'https://anthropic.example',
    apiKey: 'anthropic-key',
    authHeader: 'x-api-key',
    headers: { 'User-Agent': 'claude-code/0.1.0' },
    fetch: (async (input, init) => {
      assert.equal(requestUrl(input), 'https://anthropic.example/v1/messages')
      requestHeaders = new Headers(init?.headers)
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
      return new Response(
        sseStream([
          {
            type: 'message_start',
            message: {
              id: 'msg_test',
              usage: {
                input_tokens: 10,
                cache_creation_input_tokens: 3,
                cache_read_input_tokens: 2,
                output_tokens: 1,
              },
            },
          },
          {
            type: 'content_block_start',
            index: 0,
            content_block: { type: 'thinking', thinking: '' },
          },
          {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'thinking_delta', thinking: 'Need weather data.' },
          },
          {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'signature_delta', signature: 'thinking-signature' },
          },
          { type: 'content_block_stop', index: 0 },
          {
            type: 'content_block_start',
            index: 1,
            content_block: { type: 'text', text: '' },
          },
          {
            type: 'content_block_delta',
            index: 1,
            delta: { type: 'text_delta', text: 'Checking weather.' },
          },
          { type: 'content_block_stop', index: 1 },
          {
            type: 'content_block_start',
            index: 2,
            content_block: {
              type: 'tool_use',
              id: 'call_weather',
              name: 'get_weather',
              input: {},
            },
          },
          {
            type: 'content_block_delta',
            index: 2,
            delta: { type: 'input_json_delta', partial_json: '{"city":' },
          },
          {
            type: 'content_block_delta',
            index: 2,
            delta: { type: 'input_json_delta', partial_json: '"Shanghai"}' },
          },
          { type: 'content_block_stop', index: 2 },
          {
            type: 'message_delta',
            delta: { stop_reason: 'tool_use' },
            usage: { output_tokens: 5 },
          },
          { type: 'message_stop' },
        ]),
        {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }
      )
    }) as typeof fetch,
  })

  const chunks = await collect(
    provider.streamChat({
      modelId: 'claude-test',
      messages: [
        { role: 'system', content: 'system prompt' },
        { role: 'tool', toolCallId: 'orphan_call', content: 'stale result' },
        {
          role: 'assistant',
          content: 'I will inspect it.',
          reasoningContent: 'Prior reasoning.',
          reasoningSignature: 'prior-signature',
          toolCalls: [
            {
              id: 'call_old',
              type: 'function',
              function: { name: 'read_weather_cache', arguments: '{"city":"Shanghai"}' },
            },
          ],
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Continue.' },
            {
              type: 'image_url',
              image_url: { url: 'data:image/jpeg;base64,iVBORw0KGgo=' },
            },
          ],
        },
        { role: 'tool', toolCallId: 'call_old', content: '{"cached":false}' },
      ],
      maxOutputTokens: 2048,
      tools: [
        {
          type: 'function',
          function: {
            name: 'get_weather',
            description: 'Get weather.',
            parameters: {
              type: 'object',
              properties: { city: { type: 'string' } },
              required: ['city'],
            },
          },
        },
      ],
    })
  )

  assert.ok(requestHeaders)
  assert.ok(requestBody)
  assert.equal(requestHeaders.get('x-api-key'), 'anthropic-key')
  assert.equal(requestHeaders.get('anthropic-version'), '2023-06-01')
  assert.equal(requestHeaders.get('User-Agent'), 'claude-code/0.1.0')
  assert.equal(requestHeaders.get('Accept'), 'text/event-stream')
  assert.equal(requestBody.model, 'claude-test')
  assert.equal(requestBody.max_tokens, 2048)
  assert.deepEqual(requestBody.system, [{ type: 'text', text: 'system prompt' }])
  assert.deepEqual(requestBody.tools, [
    {
      name: 'get_weather',
      description: 'Get weather.',
      input_schema: {
        type: 'object',
        properties: { city: { type: 'string' } },
        required: ['city'],
      },
    },
  ])
  assert.deepEqual(requestBody.tool_choice, { type: 'auto' })

  const anthropicMessages = requestBody.messages as Array<{
    role: string
    content: Array<Record<string, unknown>>
  }>
  assert.equal(anthropicMessages.length, 2)
  assert.deepEqual(
    anthropicMessages[0]?.content.map((block) => block.type),
    ['thinking', 'text', 'tool_use']
  )
  assert.deepEqual(
    anthropicMessages[1]?.content.map((block) => block.type),
    ['tool_result', 'text', 'image']
  )
  assert.deepEqual(anthropicMessages[1]?.content[2], {
    type: 'image',
    source: {
      type: 'base64',
      media_type: 'image/png',
      data: 'iVBORw0KGgo=',
    },
  })

  assert.deepEqual(
    chunks.map((chunk) => chunk.type),
    [
      'delta',
      'delta',
      'delta',
      'tool_call_delta',
      'tool_call_delta',
      'tool_call_delta',
      'tool_call_final',
      'final',
    ]
  )
  const reasoningChunk = chunks[0]
  assert.ok(reasoningChunk)
  assert.equal(reasoningChunk.type, 'delta')
  assert.equal(
    reasoningChunk.type === 'delta' ? reasoningChunk.reasoning : undefined,
    'Need weather data.'
  )
  const signatureChunk = chunks[1]
  assert.ok(signatureChunk)
  assert.equal(signatureChunk.type, 'delta')
  assert.equal(
    signatureChunk.type === 'delta' ? signatureChunk.reasoningSignature : undefined,
    'thinking-signature'
  )
  const contentChunk = chunks[2]
  assert.ok(contentChunk)
  assert.equal(contentChunk.type, 'delta')
  assert.equal(
    contentChunk.type === 'delta' ? contentChunk.content : undefined,
    'Checking weather.'
  )
  const toolCallChunk = chunks[6]
  assert.ok(toolCallChunk)
  assert.equal(toolCallChunk.type, 'tool_call_final')
  assert.deepEqual(toolCallChunk.type === 'tool_call_final' ? toolCallChunk.toolCalls : [], [
    {
      id: 'call_weather',
      type: 'function',
      function: {
        name: 'get_weather',
        arguments: '{"city":"Shanghai"}',
      },
    },
  ])
  const finalChunk = chunks[7]
  assert.ok(finalChunk)
  assert.equal(finalChunk.type, 'final')
  assert.equal(finalChunk.finishReason, 'tool_calls')
  assert.deepEqual(finalChunk.usage, {
    input: 15,
    output: 5,
    cachedInput: 2,
    reasoning: undefined,
    total: 20,
  })
}

async function testAnthropicJsonResponse(): Promise<void> {
  const provider = new AnthropicCompatibleProvider({
    id: 'anthropic-json',
    baseUrl: 'https://anthropic.example/v1/messages',
    headers: { Authorization: 'Bearer custom-token' },
    fetch: (async () =>
      Response.json({
        id: 'msg_json',
        content: [
          { type: 'thinking', thinking: 'Reasoning.', signature: 'json-signature' },
          { type: 'text', text: 'Answer.' },
          {
            type: 'tool_use',
            id: 'call_json',
            name: 'calculator',
            input: { expression: '1+1' },
          },
        ],
        stop_reason: 'tool_use',
        usage: {
          input_tokens: 4,
          cache_read_input_tokens: 1,
          output_tokens: 3,
        },
      })) as typeof fetch,
  })

  const chunks = await collect(
    provider.streamChat({
      modelId: 'claude-json',
      messages: [{ role: 'user', content: 'Calculate.' }],
    })
  )

  assert.deepEqual(
    chunks.map((chunk) => chunk.type),
    ['delta', 'delta', 'tool_call_final', 'final']
  )
  const reasoningChunk = chunks[0]
  assert.ok(reasoningChunk)
  assert.equal(reasoningChunk.type, 'delta')
  assert.equal(reasoningChunk.type === 'delta' ? reasoningChunk.reasoning : undefined, 'Reasoning.')
  assert.equal(
    reasoningChunk.type === 'delta' ? reasoningChunk.reasoningSignature : undefined,
    'json-signature'
  )
  const contentChunk = chunks[1]
  assert.ok(contentChunk)
  assert.equal(contentChunk.type, 'delta')
  assert.equal(contentChunk.type === 'delta' ? contentChunk.content : undefined, 'Answer.')
  const toolCallChunk = chunks[2]
  assert.ok(toolCallChunk)
  assert.equal(toolCallChunk.type, 'tool_call_final')
  assert.deepEqual(toolCallChunk.type === 'tool_call_final' ? toolCallChunk.toolCalls : [], [
    {
      id: 'call_json',
      type: 'function',
      function: { name: 'calculator', arguments: '{"expression":"1+1"}' },
    },
  ])
  assert.deepEqual(chunks[3]?.usage, {
    input: 5,
    output: 3,
    cachedInput: 1,
    reasoning: undefined,
    total: 8,
  })
}

async function testAnthropicListModelsAndBearerAuth(): Promise<void> {
  let requestHeaders: Headers
  const provider = new AnthropicCompatibleProvider({
    id: 'anthropic-models',
    baseUrl: 'https://anthropic.example',
    apiKey: 'bearer-token',
    authHeader: 'Authorization',
    fetch: (async (input, init) => {
      const url = requestUrl(input)
      if (url === 'https://anthropic.example/v1/models') {
        requestHeaders = new Headers(init?.headers)
        return Response.json({
          data: [
            {
              id: 'z-claude-model',
              display_name: 'Z Claude Model',
            },
            {
              id: 'claude-model',
              display_name: 'Claude Model',
              max_input_tokens: 200000,
              max_tokens: 64000,
              capabilities: {
                image_input: { supported: true },
                thinking: { supported: true },
              },
            },
          ],
        })
      }
      if (url === MODELS_DEV_METADATA_URL) {
        return Response.json({})
      }
      throw new Error(`Unexpected fetch URL: ${url}`)
    }) as typeof fetch,
  })

  const models = await provider.listModels()

  assert.ok(requestHeaders)
  assert.equal(requestHeaders.get('Authorization'), 'Bearer bearer-token')
  assert.equal(requestHeaders.get('anthropic-version'), '2023-06-01')
  assert.deepEqual(
    models.map((model) => model.id),
    ['claude-model', 'z-claude-model']
  )
  assert.equal(models[0]?.id, 'claude-model')
  assert.equal(models[0]?.name, 'Claude Model')
  assert.deepEqual(models[0]?.input, ['text', 'image'])
  assert.equal(models[0]?.supportsTools, true)
  assert.equal(models[0]?.supportsReasoning, true)
  assert.equal(models[0]?.contextWindow, 200000)
  assert.equal(models[0]?.maxOutputTokens, 64000)
}

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

async function testOpenAIIncompleteStreamFails(): Promise<void> {
  const provider = new OpenAICompatibleProvider({
    id: 'openai-incomplete',
    baseUrl: 'https://example.test/v1',
    apiKey: 'test-key',
    fetch: (async () =>
      new Response(
        sseStream([
          {
            choices: [{ delta: { content: 'partial' } }],
          },
        ]),
        { status: 200 }
      )) as typeof fetch,
  })

  await assertIncompleteStream(() =>
    collect(
      provider.streamChat({
        modelId: 'model-a',
        messages: [{ role: 'user', content: 'hello' }],
      })
    )
  )
}

async function testAnthropicIncompleteStreamFails(): Promise<void> {
  const provider = new AnthropicCompatibleProvider({
    id: 'anthropic-incomplete',
    baseUrl: 'https://anthropic.example',
    apiKey: 'test-key',
    fetch: (async () =>
      new Response(
        sseStream([
          {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: 'partial' },
          },
        ]),
        { status: 200 }
      )) as typeof fetch,
  })

  await assertIncompleteStream(() =>
    collect(
      provider.streamChat({
        modelId: 'claude-test',
        messages: [{ role: 'user', content: 'hello' }],
      })
    )
  )
}

async function testOpenAICodexIncompleteStreamFails(): Promise<void> {
  const provider = new OpenAICodexProvider({
    id: 'codex-incomplete',
    baseUrl: 'https://chatgpt.com/backend-api',
    apiKey: 'test-key',
    fetch: (async () =>
      new Response(
        sseStream([{ type: 'response.output_text.delta', delta: 'partial' }, '[DONE]']),
        { status: 200 }
      )) as typeof fetch,
  })

  await assertIncompleteStream(() =>
    collect(
      provider.streamChat({
        modelId: 'gpt-5.4',
        messages: [{ role: 'user', content: 'hello' }],
      })
    )
  )
}

async function assertIncompleteStream(run: () => Promise<unknown>): Promise<void> {
  await assert.rejects(run, (error) => {
    assert.equal(error instanceof ProviderError, true)
    assert.equal((error as ProviderError).chatError.code, 'provider_stream_incomplete')
    assert.equal((error as ProviderError).chatError.retryable, true)
    return true
  })
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

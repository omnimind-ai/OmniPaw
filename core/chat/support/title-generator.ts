import type { ChatMessageRepo, ChatSessionRepo } from '@core/db/repos'
import type { Logger } from '@core/logging'
import { TITLE_PROMPTS } from '@core/prompts'
import type { ChatCompletionChunk, ProviderMessage } from '@core/provider/base-provider'
import { normalizeProviderError } from '@core/provider/errors'
import type { ProviderManager } from '@core/provider/manager'
import { IPC_CHANNELS } from '@shared/constants'
import { resolveSelectedProviderAndModel } from '../run/provider-selector'
import type { ChatRunEventTarget } from '../run-manager'
import { textFromParts } from './message-text'

export interface SessionTitleGeneratorOptions {
  sessions: ChatSessionRepo
  messages: ChatMessageRepo
  providers: ProviderManager
  logger?: Logger
}

interface TitleCompletion {
  content: string
  reasoningLength: number
  finishReason?: string
}

const TITLE_GENERATION_MAX_OUTPUT_TOKENS = 512

const autoTitlePlaceholders = new Set([
  '新会话',
  '新标题',
  '新的聊天',
  '默认会话',
  'New chat',
  'New Chat',
  'New conversation',
  'New Conversation',
])

export class SessionTitleGenerator {
  private readonly titleGenerations = new Set<string>()

  constructor(private readonly options: SessionTitleGeneratorOptions) {}

  async generateFromMessage(
    sessionId: string,
    userMessageId: string,
    eventTarget?: ChatRunEventTarget & { isDestroyed?: () => boolean }
  ): Promise<void> {
    if (this.titleGenerations.has(sessionId)) {
      return
    }

    const session = this.options.sessions.get(sessionId)
    if (!session || !isAutoTitleCandidate(session.title)) {
      return
    }

    const userMessage = this.options.messages.get(userMessageId)
    const userPrompt = userMessage ? textFromParts(userMessage.parts) : ''
    if (!userPrompt) {
      return
    }

    this.titleGenerations.add(sessionId)
    const startedAt = Date.now()
    const abort = new AbortController()
    const timeout = setTimeout(() => abort.abort('title_generation_timeout'), 20_000)
    try {
      const {
        provider: titleProvider,
        modelId,
        fallbackReason,
      } = await this.options.providers.resolveTitleProvider(sessionId)
      const { provider, model } = await resolveSelectedProviderAndModel(
        this.options.providers,
        titleProvider.id,
        modelId
      )
      const client = await this.options.providers.createProviderClient(provider.id)
      const completion = await collectTitleCompletion(
        client.streamChat({
          modelId: model.remoteId || model.id,
          messages: buildTitlePrompt(userPrompt, model.compat?.supportsSystemRole !== false),
          temperature: 0.2,
          maxOutputTokens: TITLE_GENERATION_MAX_OUTPUT_TOKENS,
          abortSignal: abort.signal,
        })
      )
      const title = normalizeGeneratedTitle(completion.content)
      if (!title) {
        this.options.logger?.debug('Chat session title generation skipped.', {
          sessionId,
          providerId: provider.id,
          modelId: model.id,
          reason: titleSkipReason(completion),
          finishReason: completion.finishReason,
          contentLength: completion.content.length,
          reasoningLength: completion.reasoningLength,
          durationMs: Date.now() - startedAt,
        })
        return
      }

      const current = this.options.sessions.get(sessionId)
      if (!current || !isAutoTitleCandidate(current.title)) {
        return
      }
      this.options.sessions.updateTitle(sessionId, title)
      const updated = this.options.sessions.get(sessionId)
      if (updated && eventTarget && eventTarget.isDestroyed?.() !== true) {
        eventTarget.send(IPC_CHANNELS.chat.sessionChanged, {
          reason: 'title_generated',
          sessionId,
          session: updated,
        })
      }
      this.options.logger?.info('Chat session title generated.', {
        sessionId,
        providerId: provider.id,
        modelId: model.id,
        fallbackReason,
        finishReason: completion.finishReason,
        contentLength: completion.content.length,
        reasoningLength: completion.reasoningLength,
        durationMs: Date.now() - startedAt,
      })
    } catch (error) {
      const normalized = normalizeProviderError(error)
      this.options.logger?.warn('Chat session title generation failed.', {
        sessionId,
        durationMs: Date.now() - startedAt,
        errorCode: normalized.code,
        retryable: normalized.retryable,
        providerStatus: normalized.providerStatus,
      })
    } finally {
      clearTimeout(timeout)
      this.titleGenerations.delete(sessionId)
    }
  }
}

function buildTitlePrompt(userPrompt: string, supportsSystemRole: boolean): ProviderMessage[] {
  const systemInstruction = TITLE_PROMPTS.system
  const userInstruction = TITLE_PROMPTS.user(userPrompt)
  if (!supportsSystemRole) {
    return [
      {
        role: 'user',
        content: `${systemInstruction}\n\n${userInstruction}`,
      },
    ]
  }

  return [
    {
      role: 'system',
      content: systemInstruction,
    },
    {
      role: 'user',
      content: userInstruction,
    },
  ]
}

async function collectTitleCompletion(
  chunks: AsyncIterable<ChatCompletionChunk>
): Promise<TitleCompletion> {
  let content = ''
  let reasoningLength = 0
  let finishReason: string | undefined
  for await (const chunk of chunks) {
    finishReason = chunk.finishReason ?? finishReason
    if (chunk.type === 'delta' && chunk.content) {
      content += chunk.content
    }
    if (chunk.type === 'delta' && chunk.reasoning) {
      reasoningLength += chunk.reasoning.length
    }
    if (content.length > 200) {
      break
    }
  }
  return { content, reasoningLength, finishReason }
}

function isAutoTitleCandidate(title: string | undefined): boolean {
  const normalized = (title ?? '').trim()
  return !normalized || autoTitlePlaceholders.has(normalized)
}

function normalizeGeneratedTitle(value: string): string | undefined {
  const firstLine = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)
  if (!firstLine || /<\s*none\s*>/i.test(firstLine)) {
    return undefined
  }

  const normalized = firstLine
    .replace(/^["'`“”‘’「」『』《》]+|["'`“”‘’「」『』《》]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!normalized || /<\s*none\s*>/i.test(normalized)) {
    return undefined
  }

  return normalized.slice(0, 80)
}

function titleSkipReason(completion: TitleCompletion): string {
  if (completion.content.trim()) {
    return 'none'
  }
  if (completion.reasoningLength > 0) {
    return 'reasoning_without_content'
  }
  return 'empty'
}

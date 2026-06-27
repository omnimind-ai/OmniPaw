import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { dirname, join } from 'node:path'
import type { OpenAICodexOAuthStatus } from '@shared/types/provider'
import { decryptCredentialValue, encryptCredentialValue } from './credentials'
import { throwProviderError } from './errors'

const OPENAI_CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
const OPENAI_CODEX_AUTHORIZE_URL = 'https://auth.openai.com/oauth/authorize'
const OPENAI_CODEX_TOKEN_URL = 'https://auth.openai.com/oauth/token'
const OPENAI_CODEX_REDIRECT_URI = 'http://localhost:1455/auth/callback'
const OPENAI_CODEX_CALLBACK_HOST = '127.0.0.1'
const OPENAI_CODEX_CALLBACK_PORT = 1455
const OPENAI_AUTH_CLAIM_PATH = 'https://api.openai.com/auth'
const OPENAI_ACCOUNT_ID_CLAIM_PATH = 'https://api.openai.com/auth.chatgpt_account_id'
const REFRESH_SKEW_MS = 60_000
const LOGIN_TIMEOUT_MS = 5 * 60_000
const STORE_VERSION = 1

export interface OpenAICodexOAuthCredential {
  access: string
  refresh?: string
  expires?: number
  accountId?: string
  email?: string
}

export interface OpenAICodexOAuthServiceOptions {
  dataRootPath: string
  fetch?: typeof fetch
}

export interface OpenAICodexOAuthLoginOptions {
  openUrl: (url: string) => Promise<void>
  fetch?: typeof fetch
}

interface StoredProviderOAuth {
  encryptedCredential: string
  accountId?: string
  email?: string
  expires?: number
  updatedAt: number
}

interface OAuthStoreFile {
  version: typeof STORE_VERSION
  providers: Record<string, StoredProviderOAuth>
}

interface CallbackResult {
  code: string
}

export class OpenAICodexOAuthService {
  private readonly storePath: string
  private readonly fetchImpl: typeof fetch

  constructor(options: OpenAICodexOAuthServiceOptions) {
    this.storePath = join(options.dataRootPath, 'openai-codex-oauth.json')
    this.fetchImpl = options.fetch ?? fetch
  }

  status(providerId: string): OpenAICodexOAuthStatus {
    const stored = this.load().providers[providerId]
    if (!stored) {
      return {
        providerId,
        authenticated: false,
      }
    }

    return {
      providerId,
      authenticated: true,
      accountId: stored.accountId,
      email: stored.email,
      expires: stored.expires,
      updatedAt: stored.updatedAt,
    }
  }

  async login(
    providerId: string,
    options: OpenAICodexOAuthLoginOptions
  ): Promise<OpenAICodexOAuthStatus> {
    const verifier = base64Url(randomBytes(48))
    const challenge = base64Url(createHash('sha256').update(verifier).digest())
    const state = base64Url(randomBytes(32))
    const callback = await waitForOAuthCallback(state)

    try {
      await options.openUrl(createAuthorizeUrl({ challenge, state }))
      const { code } = await callback.result
      const credential = await exchangeAuthorizationCode(
        code,
        verifier,
        options.fetch ?? this.fetchImpl
      )
      this.saveCredential(providerId, credential)
      return this.status(providerId)
    } finally {
      await callback.close()
    }
  }

  async logout(providerId: string): Promise<OpenAICodexOAuthStatus> {
    const store = this.load()
    if (store.providers[providerId]) {
      delete store.providers[providerId]
      this.save(store)
    }
    return this.status(providerId)
  }

  async resolveCredential(providerId: string): Promise<OpenAICodexOAuthCredential | undefined> {
    const stored = this.load().providers[providerId]
    if (!stored) return undefined

    const credential = decryptStoredCredential(stored)
    if (!credential?.access) return undefined

    if (isFresh(credential) || !credential.refresh) {
      return {
        ...credential,
        accountId: credential.accountId ?? extractOpenAICodexAccountId(credential.access),
      }
    }

    const refreshed = await refreshOpenAICodexCredential(credential.refresh, this.fetchImpl)
    this.saveCredential(providerId, {
      ...refreshed,
      email: credential.email,
    })
    return refreshed
  }

  private saveCredential(providerId: string, credential: OpenAICodexOAuthCredential): void {
    const now = Date.now()
    const accountId = credential.accountId ?? extractOpenAICodexAccountId(credential.access)
    const store = this.load()
    store.providers[providerId] = {
      encryptedCredential: encryptCredentialValue(JSON.stringify({ ...credential, accountId })),
      accountId,
      email: credential.email,
      expires: credential.expires,
      updatedAt: now,
    }
    this.save(store)
  }

  private load(): OAuthStoreFile {
    if (!existsSync(this.storePath)) {
      return emptyStore()
    }

    try {
      const parsed = JSON.parse(readFileSync(this.storePath, 'utf8')) as unknown
      if (!isRecord(parsed) || !isRecord(parsed.providers)) {
        return emptyStore()
      }

      const providers: OAuthStoreFile['providers'] = {}
      for (const [providerId, raw] of Object.entries(parsed.providers)) {
        if (!isRecord(raw) || typeof raw.encryptedCredential !== 'string') continue
        providers[providerId] = {
          encryptedCredential: raw.encryptedCredential,
          accountId: typeof raw.accountId === 'string' ? raw.accountId : undefined,
          email: typeof raw.email === 'string' ? raw.email : undefined,
          expires: finiteNumber(raw.expires),
          updatedAt: finiteNumber(raw.updatedAt) ?? 0,
        }
      }

      return { version: STORE_VERSION, providers }
    } catch {
      return emptyStore()
    }
  }

  private save(store: OAuthStoreFile): void {
    mkdirSync(dirname(this.storePath), { recursive: true })
    writeFileSync(this.storePath, `${JSON.stringify(store, null, 2)}\n`)
  }

  reset(): void {
    if (existsSync(this.storePath)) {
      rmSync(this.storePath)
    }
  }
}

export function extractOpenAICodexAccountId(accessToken: string): string | undefined {
  const payload = decodeJwtPayload(accessToken)
  const flatAccountId = payload?.[OPENAI_ACCOUNT_ID_CLAIM_PATH]
  if (typeof flatAccountId === 'string' && flatAccountId) {
    return flatAccountId
  }
  const auth = isRecord(payload?.[OPENAI_AUTH_CLAIM_PATH])
    ? payload?.[OPENAI_AUTH_CLAIM_PATH]
    : undefined
  const accountId = auth?.chatgpt_account_id
  return typeof accountId === 'string' && accountId ? accountId : undefined
}

async function exchangeAuthorizationCode(
  code: string,
  codeVerifier: string,
  fetchImpl: typeof fetch
): Promise<OpenAICodexOAuthCredential> {
  const response = await fetchImpl(OPENAI_CODEX_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: OPENAI_CODEX_CLIENT_ID,
      code,
      code_verifier: codeVerifier,
      redirect_uri: OPENAI_CODEX_REDIRECT_URI,
    }),
  }).catch((error: unknown) => {
    throwProviderError(
      {
        code: 'network',
        message: 'Failed to exchange OpenAI Codex OAuth code.',
        retryable: true,
      },
      error
    )
  })

  return parseTokenResponse(response, 'OpenAI Codex OAuth code exchange failed.')
}

async function refreshOpenAICodexCredential(
  refreshToken: string,
  fetchImpl: typeof fetch
): Promise<OpenAICodexOAuthCredential> {
  const response = await fetchImpl(OPENAI_CODEX_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: OPENAI_CODEX_CLIENT_ID,
    }),
  }).catch((error: unknown) => {
    throwProviderError(
      {
        code: 'network',
        message: 'Failed to refresh OpenAI Codex OAuth token.',
        retryable: true,
      },
      error
    )
  })

  return parseTokenResponse(response, 'OpenAI Codex OAuth token refresh failed.')
}

async function parseTokenResponse(
  response: Response,
  failureMessage: string
): Promise<OpenAICodexOAuthCredential> {
  if (!response.ok) {
    const preview = await response.text().catch(() => '')
    throwProviderError({
      code: response.status === 401 || response.status === 403 ? 'provider_auth' : 'network',
      message: failureMessage,
      retryable: response.status >= 500,
      providerStatus: response.status,
      providerBodyPreview: preview.slice(0, 1000),
    })
  }

  const payload = await response.json().catch((error: unknown) => {
    throwProviderError(
      {
        code: 'provider_bad_request',
        message: 'OpenAI Codex OAuth token endpoint returned malformed JSON.',
        retryable: false,
      },
      error
    )
  })
  const access =
    isRecord(payload) && typeof payload.access_token === 'string' ? payload.access_token : ''
  const refresh =
    isRecord(payload) && typeof payload.refresh_token === 'string'
      ? payload.refresh_token
      : undefined
  const expiresIn =
    isRecord(payload) && typeof payload.expires_in === 'number' ? payload.expires_in : undefined
  const email = isRecord(payload) && typeof payload.email === 'string' ? payload.email : undefined

  if (!access || !refresh || !expiresIn) {
    throwProviderError({
      code: 'provider_bad_request',
      message: 'OpenAI Codex OAuth response is missing token fields.',
      retryable: false,
    })
  }

  const accountId = extractOpenAICodexAccountId(access)
  if (!accountId) {
    throwProviderError({
      code: 'provider_auth',
      message: 'OpenAI Codex OAuth token does not include a ChatGPT account ID.',
      retryable: false,
    })
  }

  return {
    access,
    refresh,
    expires: Date.now() + expiresIn * 1000,
    accountId,
    email,
  }
}

function createAuthorizeUrl(input: { challenge: string; state: string }): string {
  const url = new URL(OPENAI_CODEX_AUTHORIZE_URL)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', OPENAI_CODEX_CLIENT_ID)
  url.searchParams.set('redirect_uri', OPENAI_CODEX_REDIRECT_URI)
  url.searchParams.set('scope', 'openid profile email offline_access')
  url.searchParams.set('code_challenge', input.challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('state', input.state)
  url.searchParams.set('id_token_add_organizations', 'true')
  url.searchParams.set('codex_cli_simplified_flow', 'true')
  url.searchParams.set('originator', 'pi')
  return url.toString()
}

async function waitForOAuthCallback(expectedState: string): Promise<{
  result: Promise<CallbackResult>
  close: () => Promise<void>
}> {
  let settled = false
  let timeout: NodeJS.Timeout | undefined
  let resolveResult: (value: CallbackResult) => void
  let rejectResult: (error: Error) => void

  const result = new Promise<CallbackResult>((resolve, reject) => {
    resolveResult = resolve
    rejectResult = reject
  })

  const server = createServer((request, response) => {
    void handleCallbackRequest(request, response, expectedState)
      .then((value) => {
        if (!value || settled) return
        settled = true
        resolveResult(value)
      })
      .catch((error: unknown) => {
        if (settled) return
        settled = true
        rejectResult(error instanceof Error ? error : new Error(String(error)))
      })
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(OPENAI_CODEX_CALLBACK_PORT, OPENAI_CODEX_CALLBACK_HOST, () => {
      server.off('error', reject)
      resolve()
    })
  }).catch((error: unknown) => {
    throwProviderError(
      {
        code: 'network',
        message:
          'Unable to start OpenAI Codex OAuth callback server on localhost:1455. Close the process using that port and try again.',
        retryable: true,
      },
      error
    )
  })

  timeout = setTimeout(() => {
    if (settled) return
    settled = true
    rejectResult(new Error('OpenAI Codex OAuth login timed out.'))
  }, LOGIN_TIMEOUT_MS)

  return {
    result,
    close: () =>
      new Promise<void>((resolve) => {
        if (timeout) clearTimeout(timeout)
        server.close(() => resolve())
      }),
  }
}

async function handleCallbackRequest(
  request: IncomingMessage,
  response: ServerResponse,
  expectedState: string
): Promise<CallbackResult | undefined> {
  const url = new URL(request.url ?? '/', OPENAI_CODEX_REDIRECT_URI)
  if (url.pathname !== '/auth/callback') {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end('Not found.')
    return undefined
  }

  const code = url.searchParams.get('code') ?? ''
  const state = url.searchParams.get('state') ?? ''
  const error = url.searchParams.get('error') ?? ''

  if (error) {
    writeCallbackHtml(response, false)
    throw new Error(`OpenAI Codex OAuth failed: ${error}`)
  }

  if (!code || !constantTimeEqual(state, expectedState)) {
    writeCallbackHtml(response, false)
    throw new Error('OpenAI Codex OAuth callback was rejected.')
  }

  writeCallbackHtml(response, true)
  return { code }
}

function writeCallbackHtml(response: ServerResponse, success: boolean): void {
  response.writeHead(success ? 200 : 400, { 'Content-Type': 'text/html; charset=utf-8' })
  response.end(`<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>OpenAI OAuth</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 0; min-height: 100vh; display: grid; place-items: center; background: #111; color: #f8f8f8; }
      main { max-width: 34rem; padding: 2rem; }
      h1 { margin: 0 0 .75rem; font-size: 1.5rem; }
      p { margin: 0; color: #c8c8c8; line-height: 1.6; }
    </style>
  </head>
  <body>
    <main>
      <h1>${success ? 'OpenAI 登录完成' : 'OpenAI 登录失败'}</h1>
      <p>${success ? '可以关闭这个浏览器窗口，回到 OmniPaw。' : '请回到 OmniPaw 后重试登录。'}</p>
    </main>
  </body>
</html>`)
}

function decryptStoredCredential(
  stored: StoredProviderOAuth
): OpenAICodexOAuthCredential | undefined {
  const raw = decryptCredentialValue(stored.encryptedCredential)
  if (!raw) return undefined

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!isRecord(parsed) || typeof parsed.access !== 'string') return undefined
    return {
      access: parsed.access,
      refresh: typeof parsed.refresh === 'string' ? parsed.refresh : undefined,
      expires: finiteNumber(parsed.expires),
      accountId: typeof parsed.accountId === 'string' ? parsed.accountId : stored.accountId,
      email: typeof parsed.email === 'string' ? parsed.email : stored.email,
    }
  } catch {
    return undefined
  }
}

function isFresh(credential: OpenAICodexOAuthCredential): boolean {
  return (
    typeof credential.expires === 'number' &&
    Number.isFinite(credential.expires) &&
    Date.now() + REFRESH_SKEW_MS < credential.expires
  )
}

function decodeJwtPayload(token: string): Record<string, unknown> | undefined {
  try {
    const [, payload] = token.split('.')
    if (!payload) return undefined
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    const parsed = JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as unknown
    return isRecord(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

function constantTimeEqual(actual: string, expected: string): boolean {
  if (!actual || !expected) return false
  const actualBuffer = Buffer.from(actual)
  const expectedBuffer = Buffer.from(expected)
  if (actualBuffer.length !== expectedBuffer.length) return false
  return timingSafeEqual(actualBuffer, expectedBuffer)
}

function base64Url(value: Buffer): string {
  return value.toString('base64url')
}

function emptyStore(): OAuthStoreFile {
  return {
    version: STORE_VERSION,
    providers: {},
  }
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

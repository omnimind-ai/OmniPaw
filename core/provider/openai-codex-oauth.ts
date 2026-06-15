import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { throwProviderError } from './errors'

const OPENAI_CODEX_PROVIDER_ID = 'openai-codex'
const AUTH_PROFILE_FILENAME = 'auth-profiles.json'
const LEGACY_AUTH_FILENAME = 'auth.json'
const OPENAI_CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
const OPENAI_CODEX_TOKEN_URL = 'https://auth.openai.com/oauth/token'
const OPENAI_AUTH_CLAIM_PATH = 'https://api.openai.com/auth'
const OPENAI_ACCOUNT_ID_CLAIM_PATH = 'https://api.openai.com/auth.chatgpt_account_id'
const REFRESH_SKEW_MS = 60_000

export interface OpenAICodexOAuthCredential {
  access: string
  refresh?: string
  expires?: number
  accountId?: string
  email?: string
}

interface AuthProfileStore {
  version?: number
  profiles?: Record<string, unknown>
  order?: Record<string, string[]>
  lastGood?: Record<string, string>
}

interface LoadedCredential {
  credential: OpenAICodexOAuthCredential
  profileId?: string
  store?: AuthProfileStore
  storePath?: string
}

export async function resolveOpenAICodexOAuthCredential(
  preferredProfileId?: string,
  fetchImpl: typeof fetch = fetch
): Promise<OpenAICodexOAuthCredential | undefined> {
  const envCredential = resolveEnvCredential()
  if (envCredential) {
    return envCredential
  }

  const loaded = loadOpenAICodexCredential(preferredProfileId)
  if (!loaded) {
    return undefined
  }

  const expires = loaded.credential.expires
  const isFresh =
    typeof expires === 'number' &&
    Number.isFinite(expires) &&
    Date.now() + REFRESH_SKEW_MS < expires
  if (isFresh || !loaded.credential.refresh) {
    return {
      ...loaded.credential,
      accountId:
        loaded.credential.accountId ?? extractOpenAICodexAccountId(loaded.credential.access),
    }
  }

  const refreshed = await refreshOpenAICodexCredential(loaded.credential.refresh, fetchImpl)
  if (loaded.store && loaded.storePath && loaded.profileId) {
    const existingProfile = loaded.store.profiles?.[loaded.profileId]
    loaded.store.profiles = {
      ...(loaded.store.profiles ?? {}),
      [loaded.profileId]: {
        ...(isRecord(existingProfile) ? existingProfile : {}),
        type: 'oauth',
        provider: OPENAI_CODEX_PROVIDER_ID,
        ...refreshed,
      },
    }
    saveJsonFile(loaded.storePath, loaded.store)
  }

  return refreshed
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

  if (!response.ok) {
    const preview = await response.text().catch(() => '')
    throwProviderError({
      code: response.status === 401 || response.status === 403 ? 'provider_auth' : 'network',
      message: 'OpenAI Codex OAuth token refresh failed.',
      retryable: response.status >= 500,
      providerStatus: response.status,
      providerBodyPreview: preview.slice(0, 1000),
    })
  }

  const payload = await response.json().catch((error: unknown) => {
    throwProviderError(
      {
        code: 'provider_bad_request',
        message: 'OpenAI Codex OAuth refresh returned malformed JSON.',
        retryable: false,
      },
      error
    )
  })
  const access =
    isRecord(payload) && typeof payload.access_token === 'string' ? payload.access_token : ''
  const refresh =
    isRecord(payload) && typeof payload.refresh_token === 'string' ? payload.refresh_token : ''
  const expiresIn =
    isRecord(payload) && typeof payload.expires_in === 'number' ? payload.expires_in : undefined

  if (!access || !refresh || !expiresIn) {
    throwProviderError({
      code: 'provider_bad_request',
      message: 'OpenAI Codex OAuth refresh response is missing token fields.',
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
  }
}

function loadOpenAICodexCredential(preferredProfileId?: string): LoadedCredential | undefined {
  for (const storePath of authStorePathCandidates()) {
    const store = loadAuthProfileStore(storePath)
    if (store) {
      const credential = selectCredentialFromStore(store, preferredProfileId)
      if (credential) {
        return { ...credential, store, storePath }
      }
    }

    const legacy = loadLegacyCredential(join(dirname(storePath), LEGACY_AUTH_FILENAME))
    if (legacy) {
      return { credential: legacy }
    }
  }

  return undefined
}

function selectCredentialFromStore(
  store: AuthProfileStore,
  preferredProfileId?: string
): { credential: OpenAICodexOAuthCredential; profileId: string } | undefined {
  const profiles = isRecord(store.profiles) ? store.profiles : {}
  const candidates = [
    preferredProfileId,
    store.lastGood?.[OPENAI_CODEX_PROVIDER_ID],
    ...(store.order?.[OPENAI_CODEX_PROVIDER_ID] ?? []),
    `${OPENAI_CODEX_PROVIDER_ID}:default`,
    `${OPENAI_CODEX_PROVIDER_ID}:codex-cli`,
    ...Object.keys(profiles).filter((id) => id.startsWith(`${OPENAI_CODEX_PROVIDER_ID}:`)),
  ].filter((id): id is string => Boolean(id))

  for (const profileId of [...new Set(candidates)]) {
    const credential = coerceOAuthCredential(profiles[profileId])
    if (credential) {
      return { credential, profileId }
    }
  }

  return undefined
}

function coerceOAuthCredential(raw: unknown): OpenAICodexOAuthCredential | undefined {
  if (!isRecord(raw)) {
    return undefined
  }
  const provider = typeof raw.provider === 'string' ? raw.provider : OPENAI_CODEX_PROVIDER_ID
  const type =
    typeof raw.type === 'string' ? raw.type : typeof raw.mode === 'string' ? raw.mode : ''
  if (provider !== OPENAI_CODEX_PROVIDER_ID || (type !== 'oauth' && type !== 'token')) {
    return undefined
  }
  const access =
    typeof raw.access === 'string'
      ? raw.access
      : typeof raw.token === 'string'
        ? raw.token
        : undefined
  if (!access) {
    return undefined
  }
  return {
    access,
    refresh: typeof raw.refresh === 'string' ? raw.refresh : undefined,
    expires: typeof raw.expires === 'number' ? raw.expires : undefined,
    accountId: typeof raw.accountId === 'string' ? raw.accountId : undefined,
    email: typeof raw.email === 'string' ? raw.email : undefined,
  }
}

function loadLegacyCredential(pathname: string): OpenAICodexOAuthCredential | undefined {
  const raw = loadJsonFile(pathname)
  if (!isRecord(raw)) {
    return undefined
  }
  return coerceOAuthCredential(raw[OPENAI_CODEX_PROVIDER_ID])
}

function loadAuthProfileStore(pathname: string): AuthProfileStore | undefined {
  const raw = loadJsonFile(pathname)
  if (!isRecord(raw) || !isRecord(raw.profiles)) {
    return undefined
  }
  return raw as AuthProfileStore
}

function resolveEnvCredential(): OpenAICodexOAuthCredential | undefined {
  const access =
    process.env.OPENAI_CODEX_OAUTH_TOKEN?.trim() ||
    process.env.OPENAI_CODEX_ACCESS_TOKEN?.trim() ||
    ''
  if (!access) {
    return undefined
  }
  return {
    access,
    refresh: process.env.OPENAI_CODEX_REFRESH_TOKEN?.trim() || undefined,
    accountId: process.env.OPENAI_CODEX_ACCOUNT_ID?.trim() || extractOpenAICodexAccountId(access),
  }
}

function authStorePathCandidates(): string[] {
  const agentDir =
    process.env.OPENCLAW_AGENT_DIR?.trim() || process.env.PI_CODING_AGENT_DIR?.trim() || ''
  const stateDir = process.env.OPENCLAW_STATE_DIR?.trim() || process.env.CLAWDBOT_STATE_DIR?.trim()
  const baseStateDir = stateDir ? expandHome(stateDir) : join(homedir(), '.openclaw')
  const candidates = [
    agentDir ? join(expandHome(agentDir), AUTH_PROFILE_FILENAME) : undefined,
    join(baseStateDir, 'agents', 'main', 'agent', AUTH_PROFILE_FILENAME),
  ].filter((item): item is string => Boolean(item))
  return [...new Set(candidates.map((item) => resolve(item)))]
}

function loadJsonFile(pathname: string): unknown {
  if (!existsSync(pathname)) {
    return undefined
  }
  try {
    return JSON.parse(readFileSync(pathname, 'utf8')) as unknown
  } catch {
    return undefined
  }
}

function saveJsonFile(pathname: string, payload: unknown): void {
  mkdirSync(dirname(pathname), { recursive: true })
  writeFileSync(pathname, `${JSON.stringify(payload, null, 2)}\n`)
}

function decodeJwtPayload(token: string): Record<string, unknown> | undefined {
  try {
    const [, payload] = token.split('.')
    if (!payload) {
      return undefined
    }
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    const parsed = JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as unknown
    return isRecord(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

function expandHome(pathname: string): string {
  return pathname === '~' || pathname.startsWith('~/')
    ? join(homedir(), pathname.slice(pathname === '~' ? 1 : 2))
    : pathname
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

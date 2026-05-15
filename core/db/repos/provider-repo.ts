import type { DatabaseConnection } from '../client'
import { decodeJson, encodeJson } from '../json'
import type {
  ProviderCapabilities,
  ProviderConfig,
  ProviderCredential,
  ProviderModel,
} from '../types'

interface ProviderRow {
  id: string
  name: string
  api: ProviderConfig['api']
  base_url: string
  enabled: number
  credential_ref: string | null
  auth_header: string | null
  headers_json: string | null
  extra_body_json: string | null
  default_model_id: string | null
  capabilities_json: string | null
  created_at: number
  updated_at: number
}

interface ProviderModelRow {
  provider_id: string
  id: string
  name: string
  remote_id: string
  enabled: number
  input_json: string
  supports_streaming: number
  supports_tools: number
  supports_reasoning: number
  context_window: number | null
  max_output_tokens: number | null
  pricing_json: string | null
  compat_json: string | null
  created_at: number
  updated_at: number
}

interface ProviderCredentialRow {
  id: string
  provider_id: string
  type: ProviderCredential['type']
  label: string
  encrypted_value: string | null
  env_var: string | null
  created_at: number
  updated_at: number
}

export class ProviderRepo {
  constructor(private readonly db: DatabaseConnection) {}

  list(): ProviderConfig[] {
    const providers = this.db
      .prepare('SELECT * FROM providers ORDER BY updated_at DESC')
      .all()
      .map((row) => mapProvider(row as ProviderRow))

    return providers.map((provider) => ({
      ...provider,
      models: this.listModels(provider.id),
    }))
  }

  get(id: string): ProviderConfig | undefined {
    const row = this.db.prepare('SELECT * FROM providers WHERE id = ?').get(id) as
      | ProviderRow
      | undefined
    if (!row) {
      return undefined
    }

    return {
      ...mapProvider(row),
      models: this.listModels(id),
    }
  }

  count(): number {
    return (this.db.prepare('SELECT COUNT(*) AS count FROM providers').get() as { count: number }).count
  }

  save(provider: ProviderConfig): void {
    const now = Date.now()
    this.db
      .prepare(
        `
          INSERT INTO providers (
            id, name, api, base_url, enabled, credential_ref, auth_header,
            headers_json, extra_body_json, default_model_id, capabilities_json,
            created_at, updated_at
          ) VALUES (
            @id, @name, @api, @baseUrl, @enabled, @credentialRef, @authHeader,
            @headersJson, @extraBodyJson, @defaultModelId, @capabilitiesJson,
            @createdAt, @updatedAt
          )
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            api = excluded.api,
            base_url = excluded.base_url,
            enabled = excluded.enabled,
            credential_ref = excluded.credential_ref,
            auth_header = excluded.auth_header,
            headers_json = excluded.headers_json,
            extra_body_json = excluded.extra_body_json,
            default_model_id = excluded.default_model_id,
            capabilities_json = excluded.capabilities_json,
            updated_at = excluded.updated_at
        `,
      )
      .run({
        id: provider.id,
        name: provider.name,
        api: provider.api ?? 'openai-chat-completions',
        baseUrl: provider.baseUrl,
        enabled: provider.enabled ? 1 : 0,
        credentialRef: provider.credentialRef ?? null,
        authHeader: provider.authHeader ?? null,
        headersJson: encodeJson(provider.headers),
        extraBodyJson: encodeJson(provider.extraBody),
        defaultModelId: provider.defaultModelId ?? null,
        capabilitiesJson: encodeJson(provider.capabilities),
        createdAt: provider.createdAt ?? now,
        updatedAt: provider.updatedAt ?? now,
      })

    for (const model of provider.models ?? []) {
      this.saveModel({ ...model, providerId: provider.id })
    }
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM providers WHERE id = ?').run(id)
  }

  listModels(providerId: string): ProviderModel[] {
    return this.db
      .prepare('SELECT * FROM provider_models WHERE provider_id = ? ORDER BY enabled DESC, name ASC')
      .all(providerId)
      .map((row) => mapModel(row as ProviderModelRow))
  }

  saveModel(model: ProviderModel): void {
    const now = Date.now()
    this.db
      .prepare(
        `
          INSERT INTO provider_models (
            provider_id, id, name, remote_id, enabled, input_json,
            supports_streaming, supports_tools, supports_reasoning, context_window,
            max_output_tokens, pricing_json, compat_json, created_at, updated_at
          ) VALUES (
            @providerId, @id, @name, @remoteId, @enabled, @inputJson,
            @supportsStreaming, @supportsTools, @supportsReasoning, @contextWindow,
            @maxOutputTokens, @pricingJson, @compatJson, @createdAt, @updatedAt
          )
          ON CONFLICT(provider_id, id) DO UPDATE SET
            name = excluded.name,
            remote_id = excluded.remote_id,
            enabled = excluded.enabled,
            input_json = excluded.input_json,
            supports_streaming = excluded.supports_streaming,
            supports_tools = excluded.supports_tools,
            supports_reasoning = excluded.supports_reasoning,
            context_window = excluded.context_window,
            max_output_tokens = excluded.max_output_tokens,
            pricing_json = excluded.pricing_json,
            compat_json = excluded.compat_json,
            updated_at = excluded.updated_at
        `,
      )
      .run({
        providerId: model.providerId,
        id: model.id,
        name: model.name,
        remoteId: model.remoteId ?? model.id,
        enabled: model.enabled !== false ? 1 : 0,
        inputJson: encodeJson(model.input ?? ['text']) ?? '["text"]',
        supportsStreaming: model.supportsStreaming !== false ? 1 : 0,
        supportsTools: model.supportsTools ? 1 : 0,
        supportsReasoning: model.supportsReasoning ? 1 : 0,
        contextWindow: model.contextWindow ?? null,
        maxOutputTokens: model.maxOutputTokens ?? null,
        pricingJson: encodeJson(model.pricing),
        compatJson: encodeJson(model.compat),
        createdAt: (model as { createdAt?: number }).createdAt ?? now,
        updatedAt: (model as { updatedAt?: number }).updatedAt ?? now,
      })
  }

  listCredentials(providerId: string): ProviderCredential[] {
    return this.db
      .prepare('SELECT * FROM provider_credentials WHERE provider_id = ? ORDER BY updated_at DESC')
      .all(providerId)
      .map((row) => mapCredential(row as ProviderCredentialRow))
  }

  saveCredential(credential: ProviderCredential): void {
    this.db
      .prepare(
        `
          INSERT INTO provider_credentials (
            id, provider_id, type, label, encrypted_value, env_var, created_at, updated_at
          ) VALUES (
            @id, @providerId, @type, @label, @encryptedValue, @envVar, @createdAt, @updatedAt
          )
          ON CONFLICT(id) DO UPDATE SET
            provider_id = excluded.provider_id,
            type = excluded.type,
            label = excluded.label,
            encrypted_value = excluded.encrypted_value,
            env_var = excluded.env_var,
            updated_at = excluded.updated_at
        `,
      )
      .run({
        id: credential.id,
        providerId: credential.providerId,
        type: credential.type,
        label: credential.label,
        encryptedValue: credential.encryptedValue ?? null,
        envVar: credential.envVar ?? null,
        createdAt: credential.createdAt,
        updatedAt: credential.updatedAt,
      })
  }
}

function mapProvider(row: ProviderRow): ProviderConfig {
  return {
    id: row.id,
    name: row.name,
    api: row.api,
    baseUrl: row.base_url,
    enabled: row.enabled === 1,
    credentialRef: row.credential_ref ?? undefined,
    authHeader: row.auth_header ?? undefined,
    headers: decodeJson<Record<string, string> | undefined>(row.headers_json, undefined),
    extraBody: decodeJson<Record<string, unknown> | undefined>(row.extra_body_json, undefined),
    defaultModelId: row.default_model_id ?? undefined,
    capabilities: decodeJson<ProviderCapabilities | undefined>(row.capabilities_json, undefined),
    models: [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    type: row.api === 'omniinfer' ? 'omniinfer' : row.api === 'ollama' ? 'ollama' : 'openai-compatible',
  }
}

function mapModel(row: ProviderModelRow): ProviderModel {
  return {
    providerId: row.provider_id,
    id: row.id,
    name: row.name,
    remoteId: row.remote_id,
    enabled: row.enabled === 1,
    input: decodeJson<ProviderModel['input']>(row.input_json, ['text']),
    supportsStreaming: row.supports_streaming === 1,
    supportsTools: row.supports_tools === 1,
    supportsReasoning: row.supports_reasoning === 1,
    contextWindow: row.context_window ?? undefined,
    maxOutputTokens: row.max_output_tokens ?? undefined,
    pricing: decodeJson<ProviderModel['pricing'] | undefined>(row.pricing_json, undefined),
    compat: decodeJson<ProviderModel['compat'] | undefined>(row.compat_json, undefined),
  }
}

function mapCredential(row: ProviderCredentialRow): ProviderCredential {
  return {
    id: row.id,
    providerId: row.provider_id,
    type: row.type,
    label: row.label,
    encryptedValue: row.encrypted_value ?? undefined,
    envVar: row.env_var ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

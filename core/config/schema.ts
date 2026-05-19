import type {
  DesktopProviderModel,
  DesktopProviderSource,
  DesktopSettingsConfig,
  SettingsOperationError,
  SettingsValidationIssue,
} from '@shared/types/settings'
import { redactSensitiveText } from '@core/logging/redaction'

export const CURRENT_SETTINGS_VERSION = 1

const now = 0
const defaultProviderModel: DesktopProviderModel = {
  id: '',
  name: '',
  providerSourceId: '',
  remoteId: '',
  enabled: true,
  input: ['text'],
  supportsStreaming: true,
  supportsTools: false,
  supportsReasoning: false,
  capabilities: {},
  createdAt: now,
  updatedAt: now,
}

export const defaultConfig: DesktopSettingsConfig = {
  version: CURRENT_SETTINGS_VERSION,
  app: {
    language: 'system',
    theme: 'system',
    minimizeToTrayOnStartup: false,
    zoom: {
      factor: 1,
      min: 0.75,
      max: 1.5,
    },
    maxRecentMessages: 20,
    compactSkillDescriptions: true,
  },
  providers: {
    sources: [
      {
        id: 'openai-compatible',
        type: 'openai-compatible',
        api: 'openai-chat-completions',
        name: 'OpenAI Compatible',
        baseUrl: 'https://api.openai.com/v1',
        enabled: false,
        credentialRef: 'openai-compatible:default',
        authHeader: 'Authorization',
        headers: {},
        extraBody: {},
        capabilities: {
          listModels: true,
          streaming: true,
          tools: true,
          vision: true,
        },
        compat: {
          maxTokensField: 'max_tokens',
          supportsSystemRole: true,
          supportsJsonMode: true,
          reasoningFormat: 'none',
        },
        createdAt: now,
        updatedAt: now,
      },
    ],
    models: [],
    settings: {
      defaultModelId: '',
      fallbackModelIds: [],
      streaming: true,
    },
  },
  tools: {
    enabledByName: {},
  },
  scheduledTasks: {
    enabled: false,
    tasks: [],
  },
}

export class ConfigValidationError extends Error {
  readonly details: SettingsOperationError

  constructor(details: SettingsOperationError) {
    super(details.message)
    this.name = 'ConfigValidationError'
    this.details = details
  }
}

export interface NormalizeConfigResult {
  config: DesktopSettingsConfig
  changed: boolean
}

export function cloneDefaultConfig(): DesktopSettingsConfig {
  return cloneConfig(defaultConfig)
}

export function cloneConfig(config: DesktopSettingsConfig): DesktopSettingsConfig {
  return structuredClone(config)
}

export function normalizeConfig(raw: unknown): NormalizeConfigResult {
  const migrated = migrateConfig(raw)
  const normalized = normalizeObject(cloneDefaultConfig(), migrated, '')
  const config = validateConfig(normalized)

  return {
    config,
    changed: stableStringify(config) !== stableStringify(raw),
  }
}

export function validateConfig(input: unknown): DesktopSettingsConfig {
  const issues: SettingsValidationIssue[] = []

  if (!isPlainObject(input)) {
    throwValidationError([{ path: '', message: 'Config must be an object.', code: 'invalid_type' }])
  }

  const config = input as unknown as DesktopSettingsConfig
  if (config.version !== CURRENT_SETTINGS_VERSION) {
    issues.push({
      path: 'version',
      message: `Config version must be ${CURRENT_SETTINGS_VERSION}.`,
      code: 'invalid_version',
    })
  }

  validateApp(config, issues)
  validateProviders(config, issues)
  validateTools(config, issues)
  validateScheduledTasks(config, issues)

  if (issues.length) {
    throwValidationError(issues)
  }

  return config
}

export function serializeConfig(config: DesktopSettingsConfig): string {
  return `${JSON.stringify(config, null, 2)}\n`
}

export function configError(
  code: SettingsOperationError['code'],
  message: string,
  options: {
    path?: string
    recoverable?: boolean
    issues?: SettingsValidationIssue[]
  } = {}
): SettingsOperationError {
  return {
    code,
    message: redactSecretText(message),
    path: options.path,
    recoverable: options.recoverable ?? false,
    issues: options.issues?.map((issue) => ({
      ...issue,
      message: redactSecretText(issue.message),
    })),
  }
}

function migrateConfig(raw: unknown): unknown {
  if (raw === undefined || raw === null) {
    return {}
  }
  if (!isPlainObject(raw)) {
    throwValidationError([{ path: '', message: 'Config must be an object.', code: 'invalid_type' }])
  }

  const version = typeof raw.version === 'number' ? raw.version : CURRENT_SETTINGS_VERSION
  if (version > CURRENT_SETTINGS_VERSION) {
    throw new ConfigValidationError(
      configError(
        'unsupported_version',
        `Config version ${version} is newer than supported version ${CURRENT_SETTINGS_VERSION}.`,
        {
          recoverable: false,
          issues: [
            {
              path: 'version',
              message: `Unsupported future config version ${version}.`,
              code: 'unsupported_version',
            },
          ],
        }
      )
    )
  }

  if (version < CURRENT_SETTINGS_VERSION) {
    return {
      ...raw,
      version: CURRENT_SETTINGS_VERSION,
    }
  }

  return raw
}

function normalizeObject(defaultValue: unknown, rawValue: unknown, path: string): unknown {
  if (path === 'tools.enabledByName') {
    return normalizeBooleanRecord(rawValue)
  }

  if (Array.isArray(defaultValue)) {
    if (rawValue === undefined || rawValue === null) {
      return cloneUnknown(defaultValue)
    }
    if (!Array.isArray(rawValue)) {
      throwValidationError([{ path, message: 'Value must be an array.', code: 'invalid_type' }])
    }
    return rawValue.map((item) => normalizeArrayItem(path, item))
  }

  if (isPlainObject(defaultValue)) {
    if (rawValue === undefined || rawValue === null) {
      return cloneUnknown(defaultValue)
    }
    if (!isPlainObject(rawValue)) {
      throwValidationError([{ path, message: 'Value must be an object.', code: 'invalid_type' }])
    }

    const result: Record<string, unknown> = {}
    for (const [key, nestedDefault] of Object.entries(defaultValue)) {
      result[key] = normalizeObject(
        nestedDefault,
        (rawValue as Record<string, unknown>)[key],
        path ? `${path}.${key}` : key
      )
    }
    return result
  }

  return rawValue === undefined || rawValue === null ? defaultValue : rawValue
}

function normalizeArrayItem(path: string, item: unknown): unknown {
  if (path === 'providers.sources') {
    return normalizeProviderSource(item)
  }
  if (path === 'providers.models') {
    return normalizeProviderModel(item)
  }
  return cloneUnknown(item)
}

function normalizeProviderSource(item: unknown): DesktopProviderSource {
  const defaults = defaultConfig.providers.sources[0]
  if (!isPlainObject(item)) {
    throwValidationError([
      {
        path: 'providers.sources',
        message: 'Provider source must be an object.',
        code: 'invalid_type',
      },
    ])
  }
  const raw = item
  const merged = normalizeObject(defaults, raw, 'providers.sources[]') as DesktopProviderSource

  return {
    ...merged,
    id: typeof raw.id === 'string' ? raw.id : merged.id,
    type: typeof raw.type === 'string' ? (raw.type as DesktopProviderSource['type']) : merged.type,
    api: typeof raw.api === 'string' ? (raw.api as DesktopProviderSource['api']) : merged.api,
    name: typeof raw.name === 'string' ? raw.name : merged.name,
    baseUrl: typeof raw.baseUrl === 'string' ? raw.baseUrl : merged.baseUrl,
    enabled:
      raw.enabled === undefined
        ? merged.enabled
        : (raw.enabled as DesktopProviderSource['enabled']),
    credentialRef: typeof raw.credentialRef === 'string' ? raw.credentialRef : merged.credentialRef,
    authHeader: typeof raw.authHeader === 'string' ? raw.authHeader : merged.authHeader,
    apiKey: typeof raw.apiKey === 'string' ? raw.apiKey : undefined,
    credentialEnvVar: typeof raw.credentialEnvVar === 'string' ? raw.credentialEnvVar : undefined,
    headers: isStringRecord(raw.headers) ? raw.headers : merged.headers,
    extraBody: isPlainObject(raw.extraBody) ? raw.extraBody : merged.extraBody,
    capabilities: isPlainObject(raw.capabilities) ? raw.capabilities : merged.capabilities,
    compat: isPlainObject(raw.compat) ? raw.compat : merged.compat,
    defaultModelId:
      typeof raw.defaultModelId === 'string' ? raw.defaultModelId : merged.defaultModelId,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
  }
}

function normalizeProviderModel(item: unknown): DesktopProviderModel {
  const defaults = defaultProviderModel
  if (!isPlainObject(item)) {
    throwValidationError([
      {
        path: 'providers.models',
        message: 'Provider model must be an object.',
        code: 'invalid_type',
      },
    ])
  }
  const raw = item
  const merged = normalizeObject(defaults, raw, 'providers.models[]') as DesktopProviderModel

  return {
    ...merged,
    id: typeof raw.id === 'string' ? raw.id : merged.id,
    name: typeof raw.name === 'string' ? raw.name : merged.name,
    providerSourceId:
      typeof raw.providerSourceId === 'string'
        ? raw.providerSourceId
        : typeof raw.providerId === 'string'
          ? raw.providerId
          : merged.providerSourceId,
    remoteId: typeof raw.remoteId === 'string' ? raw.remoteId : merged.remoteId,
    enabled:
      raw.enabled === undefined ? merged.enabled : (raw.enabled as DesktopProviderModel['enabled']),
    input: isModelInput(raw.input) ? raw.input : merged.input,
    supportsStreaming:
      typeof raw.supportsStreaming === 'boolean' ? raw.supportsStreaming : merged.supportsStreaming,
    supportsTools:
      typeof raw.supportsTools === 'boolean' ? raw.supportsTools : merged.supportsTools,
    supportsReasoning:
      typeof raw.supportsReasoning === 'boolean' ? raw.supportsReasoning : merged.supportsReasoning,
    contextWindow: typeof raw.contextWindow === 'number' ? raw.contextWindow : merged.contextWindow,
    maxOutputTokens:
      typeof raw.maxOutputTokens === 'number' ? raw.maxOutputTokens : merged.maxOutputTokens,
    pricing: isPlainObject(raw.pricing) ? raw.pricing : merged.pricing,
    capabilities: isPlainObject(raw.capabilities) ? raw.capabilities : merged.capabilities,
    compat: isPlainObject(raw.compat) ? raw.compat : merged.compat,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
  }
}

function validateApp(config: DesktopSettingsConfig, issues: SettingsValidationIssue[]): void {
  if (!['system', 'light', 'dark'].includes(config.app.theme)) {
    issues.push({
      path: 'app.theme',
      message: 'Theme must be system, light, or dark.',
      code: 'invalid_enum',
    })
  }
  if (!['system', 'zh-CN', 'en-US'].includes(config.app.language)) {
    issues.push({
      path: 'app.language',
      message: 'Language must be system, zh-CN, or en-US.',
      code: 'invalid_enum',
    })
  }
  if (typeof config.app.minimizeToTrayOnStartup !== 'boolean') {
    issues.push({
      path: 'app.minimizeToTrayOnStartup',
      message: 'Value must be boolean.',
      code: 'invalid_type',
    })
  }
  if (
    !isFiniteNumber(config.app.zoom.factor) ||
    config.app.zoom.factor < config.app.zoom.min ||
    config.app.zoom.factor > config.app.zoom.max
  ) {
    issues.push({
      path: 'app.zoom.factor',
      message: 'Zoom factor must be within configured min and max.',
      code: 'out_of_range',
    })
  }
  if (!Number.isInteger(config.app.maxRecentMessages) || config.app.maxRecentMessages < 1) {
    issues.push({
      path: 'app.maxRecentMessages',
      message: 'Max recent messages must be a positive integer.',
      code: 'invalid_number',
    })
  }
}

function validateProviders(config: DesktopSettingsConfig, issues: SettingsValidationIssue[]): void {
  const sourceIds = new Set<string>()
  for (const [index, source] of config.providers.sources.entries()) {
    const basePath = `providers.sources.${index}`
    if (!source.id) {
      issues.push({
        path: `${basePath}.id`,
        message: 'Provider source ID is required.',
        code: 'required',
      })
    }
    if (sourceIds.has(source.id)) {
      issues.push({
        path: `${basePath}.id`,
        message: 'Provider source ID must be unique.',
        code: 'duplicate',
      })
    }
    sourceIds.add(source.id)
    if (!source.name) {
      issues.push({
        path: `${basePath}.name`,
        message: 'Provider source name is required.',
        code: 'required',
      })
    }
    if (!source.baseUrl) {
      issues.push({
        path: `${basePath}.baseUrl`,
        message: 'Provider source base URL is required.',
        code: 'required',
      })
    }
    if (typeof source.enabled !== 'boolean') {
      issues.push({
        path: `${basePath}.enabled`,
        message: 'Provider source enabled state must be boolean.',
        code: 'invalid_type',
      })
    }
    if (!['openai-compatible', 'ollama', 'omniinfer'].includes(source.type)) {
      issues.push({
        path: `${basePath}.type`,
        message: 'Provider source type is invalid.',
        code: 'invalid_enum',
      })
    }
    if (
      !['openai-chat-completions', 'openai-responses', 'ollama', 'omniinfer'].includes(source.api)
    ) {
      issues.push({
        path: `${basePath}.api`,
        message: 'Provider source API is invalid.',
        code: 'invalid_enum',
      })
    }
    if (!isPlainObject(source.headers)) {
      issues.push({
        path: `${basePath}.headers`,
        message: 'Provider source headers must be an object.',
        code: 'invalid_type',
      })
    }
    if (!isPlainObject(source.extraBody)) {
      issues.push({
        path: `${basePath}.extraBody`,
        message: 'Provider source extra body must be an object.',
        code: 'invalid_type',
      })
    }
    if (!isPlainObject(source.capabilities)) {
      issues.push({
        path: `${basePath}.capabilities`,
        message: 'Provider source capabilities must be an object.',
        code: 'invalid_type',
      })
    }
  }

  const enabledModels = new Set<string>()
  const modelIds = new Set<string>()
  for (const [index, model] of config.providers.models.entries()) {
    const basePath = `providers.models.${index}`
    if (!model.id) {
      issues.push({
        path: `${basePath}.id`,
        message: 'Provider model ID is required.',
        code: 'required',
      })
    }
    if (!model.name) {
      issues.push({
        path: `${basePath}.name`,
        message: 'Provider model name is required.',
        code: 'required',
      })
    }
    if (modelIds.has(model.id)) {
      issues.push({
        path: `${basePath}.id`,
        message: 'Provider model ID must be unique.',
        code: 'duplicate',
      })
    }
    modelIds.add(model.id)
    if (!sourceIds.has(model.providerSourceId)) {
      issues.push({
        path: `${basePath}.providerSourceId`,
        message: 'Provider model must reference an existing provider source.',
        code: 'missing_reference',
      })
    }
    if (model.enabled !== false) {
      enabledModels.add(model.id)
    }
    if (typeof model.enabled !== 'boolean') {
      issues.push({
        path: `${basePath}.enabled`,
        message: 'Provider model enabled state must be boolean.',
        code: 'invalid_type',
      })
    }
    if (!Array.isArray(model.input)) {
      issues.push({
        path: `${basePath}.input`,
        message: 'Provider model input must be an array.',
        code: 'invalid_type',
      })
    }
    if (!isPlainObject(model.capabilities)) {
      issues.push({
        path: `${basePath}.capabilities`,
        message: 'Provider model capabilities must be an object.',
        code: 'invalid_type',
      })
    }
  }

  const defaultModelId = config.providers.settings.defaultModelId
  if (defaultModelId && !enabledModels.has(defaultModelId)) {
    issues.push({
      path: 'providers.settings.defaultModelId',
      message: 'Default model must reference an enabled provider model.',
      code: 'missing_reference',
    })
  }
  for (const [index, modelId] of config.providers.settings.fallbackModelIds.entries()) {
    if (!enabledModels.has(modelId)) {
      issues.push({
        path: `providers.settings.fallbackModelIds.${index}`,
        message: 'Fallback model must reference an enabled provider model.',
        code: 'missing_reference',
      })
    }
  }
  if (typeof config.providers.settings.streaming !== 'boolean') {
    issues.push({
      path: 'providers.settings.streaming',
      message: 'Provider streaming setting must be boolean.',
      code: 'invalid_type',
    })
  }
}

function validateTools(config: DesktopSettingsConfig, issues: SettingsValidationIssue[]): void {
  if (!isPlainObject(config.tools.enabledByName)) {
    issues.push({
      path: 'tools.enabledByName',
      message: 'Tool enablement must be an object.',
      code: 'invalid_type',
    })
  }
}

function validateScheduledTasks(
  config: DesktopSettingsConfig,
  issues: SettingsValidationIssue[]
): void {
  if (typeof config.scheduledTasks.enabled !== 'boolean') {
    issues.push({
      path: 'scheduledTasks.enabled',
      message: 'Scheduled task enabled state must be boolean.',
      code: 'invalid_type',
    })
  }
  if (!Array.isArray(config.scheduledTasks.tasks)) {
    issues.push({
      path: 'scheduledTasks.tasks',
      message: 'Scheduled tasks must be an array.',
      code: 'invalid_type',
    })
  }
}

function throwValidationError(issues: SettingsValidationIssue[]): never {
  throw new ConfigValidationError(
    configError('invalid_config', 'Desktop settings config is invalid.', {
      recoverable: false,
      issues,
    })
  )
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value)
}

function cloneUnknown<T>(value: T): T {
  return structuredClone(value)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isPlainObject(value) && Object.values(value).every((item) => typeof item === 'string')
}

function isModelInput(value: unknown): value is DesktopProviderModel['input'] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) => item === 'text' || item === 'image' || item === 'audio' || item === 'file'
    )
  )
}

function normalizeBooleanRecord(value: unknown): Record<string, boolean> {
  if (!isPlainObject(value)) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, boolean] => typeof entry[1] === 'boolean'
    )
  )
}

function redactSecretText(text: string): string {
  return redactSensitiveText(text)
}

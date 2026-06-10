import { redactSensitiveText } from '@core/logging/redaction'
import type { ContextAttachmentPolicy, ToolProfile } from '@shared/types/chat'
import type {
  ExternalRootGrant,
  LocalAgentTerminalSettings,
  LocalAgentWorkspaceSettings,
  LocalNetworkPolicy,
  WorkspaceRootStrategy,
} from '@shared/types/local-agent'
import type {
  DesktopObservationSettings,
  DesktopProviderModel,
  DesktopProviderSource,
  DesktopSettingsConfig,
  SettingsOperationError,
  SettingsValidationIssue,
} from '@shared/types/settings'
import { type DesktopShortcutSettings, SHORTCUT_ACTIONS } from '@shared/types/shortcuts'

export const CURRENT_SETTINGS_VERSION = 1

const now = 0
const defaultProviderSource: DesktopProviderSource = {
  id: '',
  type: 'openai-compatible',
  api: 'openai-chat-completions',
  name: '',
  baseUrl: '',
  enabled: true,
  credentialRef: undefined,
  authHeader: undefined,
  headers: {},
  extraBody: {},
  capabilities: {},
  compat: undefined,
  createdAt: now,
  updatedAt: now,
}
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
    initialized: false,
    minimizeToTrayOnStartup: false,
    showReasoningContent: true,
    zoom: {
      factor: 1,
      min: 0.75,
      max: 1.5,
    },
    maxRecentMessages: 20,
    chatContext: {
      recentMessages: 20,
      maxInputBudgetPercent: 75,
      includeAttachments: 'current-only',
      autoCompact: true,
      compactThresholdPercent: 85,
    },
    memory: {
      enabled: true,
      extractionEnabled: true,
      semanticExtractionEnabled: true,
      retrievalEnabled: true,
      activeToolWriteEnabled: true,
      maintenanceEnabled: true,
      destructiveToolRequiresConfirmation: true,
      minConfidence: 0.55,
      lowConfidenceReviewThreshold: 0.68,
      maxContextItems: 8,
      maxContextTokens: 900,
    },
    systemContext: {
      baseSystemPrompt: '',
      mask: {
        enabled: false,
        label: 'Mask',
        text: '',
      },
    },
    compactSkillDescriptions: true,
    shortcuts: {
      bindings: {
        'cat.toggleVisibility': {
          enabled: true,
          accelerator: 'CmdOrCtrl+Alt+K',
        },
        'cat.openPanel': {
          enabled: true,
          accelerator: 'CmdOrCtrl+Alt+P',
        },
        'app.zoomIn': {
          enabled: true,
          accelerator: 'CmdOrCtrl+=',
        },
        'app.zoomOut': {
          enabled: true,
          accelerator: 'CmdOrCtrl+-',
        },
        'app.zoomReset': {
          enabled: true,
          accelerator: 'CmdOrCtrl+0',
        },
      },
    },
  },
  providers: {
    sources: [],
    models: [],
    settings: {
      defaultModelId: '',
      fallbackModelIds: [],
      streaming: true,
    },
  },
  tools: {
    agentToolProfile: 'assistant',
    maxAgentSteps: 6,
    enabledByName: {},
    workspace: {
      rootStrategy: 'managed-user-data',
      retentionDays: 30,
      cleanupOnSessionDelete: false,
      maxFileBytes: 10 * 1024 * 1024,
      maxReadBytes: 512 * 1024,
      maxWriteBytes: 2 * 1024 * 1024,
      maxSearchResults: 50,
      maxToolResultChars: 20_000,
      denyPatterns: [
        '.env',
        '.env.*',
        '**/.ssh/**',
        '**/id_rsa',
        '**/id_ed25519',
        '**/*credential*',
        '**/*secret*',
        '**/*token*',
        '**/Library/Application Support/Google/Chrome/**',
        '**/Library/Application Support/Firefox/**',
      ],
      externalRoots: [],
    },
    terminal: {
      timeoutMs: 30_000,
      maxOutputChars: 20_000,
      maxForegroundProcesses: 4,
      maxBackgroundProcesses: 2,
      backgroundMaxLifetimeMs: 30 * 60 * 1000,
      minimalEnvKeys: ['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP'],
      assistant: {
        network: 'ask',
        allowBackground: false,
        allowPty: false,
        fullAccess: false,
        commandAllowPatterns: [],
        commandDenyPatterns: [],
      },
      power: {
        network: 'allow',
        allowBackground: true,
        allowPty: true,
        fullAccess: true,
        commandAllowPatterns: [],
        commandDenyPatterns: [],
      },
    },
  },
  scheduledTasks: {
    enabled: false,
    misfirePolicy: 'run_once',
    misfireGraceMs: 15 * 60 * 1000,
    misfireStartupLimit: 3,
  },
  observation: {
    evaluationIntervalMs: 60_000,
    captureProbability: 0.25,
    reactionNudgeAfterSilentCaptures: 3,
    reactionNudgeProbability: 0.35,
    minCaptureIntervalMs: 60_000,
    defaultScope: 'primary_display',
    screenshotRetention: 'ephemeral',
    allowRemoteProviders: false,
    localOnly: true,
    dailyCaptureLimit: 200,
    consecutiveFailureLimit: 3,
    notificationCooldownMs: 90_000,
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
  const normalized = normalizeChatContextCompatibility(
    normalizeObject(cloneDefaultConfig(), migrated, '') as DesktopSettingsConfig,
    migrated
  )
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
  validateObservation(config, issues)

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

  const migrated = migrateInitializedFlag(raw)
  const version = typeof migrated.version === 'number' ? migrated.version : CURRENT_SETTINGS_VERSION
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
      ...migrated,
      version: CURRENT_SETTINGS_VERSION,
    }
  }

  return migrated
}

function migrateInitializedFlag(raw: Record<string, unknown>): Record<string, unknown> {
  const app = raw.app
  if (!isPlainObject(app) || typeof app.initialized === 'boolean') {
    return raw
  }

  return {
    ...raw,
    app: {
      ...app,
      initialized: true,
    },
  }
}

function normalizeObject(defaultValue: unknown, rawValue: unknown, path: string): unknown {
  if (path === 'app.chatContext') {
    return normalizeChatContextSettings(rawValue)
  }

  if (path === 'app.memory') {
    return normalizeMemorySettings(rawValue)
  }

  if (path === 'app.systemContext') {
    return normalizeSystemContextSettings(rawValue)
  }

  if (path === 'app.shortcuts') {
    return normalizeShortcutSettings(rawValue)
  }

  if (path === 'tools.agentToolProfile') {
    return isToolProfile(rawValue) ? rawValue : defaultConfig.tools.agentToolProfile
  }

  if (path === 'tools.maxAgentSteps') {
    return normalizeInteger(rawValue, defaultConfig.tools.maxAgentSteps, 1, 24)
  }

  if (path === 'tools.enabledByName') {
    return normalizeBooleanRecord(rawValue)
  }

  if (path === 'tools.workspace') {
    return normalizeWorkspaceSettings(rawValue)
  }

  if (path === 'tools.terminal') {
    return normalizeTerminalSettings(rawValue)
  }

  if (path === 'observation') {
    return normalizeObservationSettings(rawValue)
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
  const defaults = defaultProviderSource
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
  if (typeof config.app.initialized !== 'boolean') {
    issues.push({
      path: 'app.initialized',
      message: 'Value must be boolean.',
      code: 'invalid_type',
    })
  }
  if (typeof config.app.showReasoningContent !== 'boolean') {
    issues.push({
      path: 'app.showReasoningContent',
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
  validateChatContext(config, issues)
  validateMemory(config, issues)
  validateSystemContext(config, issues)
  validateShortcuts(config, issues)
}

function validateShortcuts(config: DesktopSettingsConfig, issues: SettingsValidationIssue[]): void {
  const settings = config.app.shortcuts
  if (!isPlainObject(settings)) {
    issues.push({
      path: 'app.shortcuts',
      message: 'Shortcut settings must be an object.',
      code: 'invalid_type',
    })
    return
  }
  if (!isPlainObject(settings.bindings)) {
    issues.push({
      path: 'app.shortcuts.bindings',
      message: 'Shortcut bindings must be an object.',
      code: 'invalid_type',
    })
    return
  }

  const enabledAccelerators = new Map<string, string>()
  for (const action of SHORTCUT_ACTIONS) {
    const binding = settings.bindings[action]
    const path = `app.shortcuts.bindings.${action}`
    if (!isPlainObject(binding)) {
      issues.push({
        path,
        message: 'Shortcut binding must be an object.',
        code: 'invalid_type',
      })
      continue
    }
    if (typeof binding.enabled !== 'boolean') {
      issues.push({
        path: `${path}.enabled`,
        message: 'Shortcut enabled flag must be boolean.',
        code: 'invalid_type',
      })
    }
    if (typeof binding.accelerator !== 'string') {
      issues.push({
        path: `${path}.accelerator`,
        message: 'Shortcut accelerator must be a string.',
        code: 'invalid_type',
      })
      continue
    }
    if (!isValidAcceleratorShape(binding.accelerator)) {
      issues.push({
        path: `${path}.accelerator`,
        message: 'Shortcut accelerator must include a modifier and a key.',
        code: 'invalid_accelerator',
      })
      continue
    }
    const normalized = binding.accelerator.toLowerCase()
    const previousAction = enabledAccelerators.get(normalized)
    if (previousAction) {
      issues.push({
        path: `${path}.accelerator`,
        message: `Shortcut conflicts with ${previousAction}.`,
        code: 'duplicate',
      })
      continue
    }
    enabledAccelerators.set(normalized, action)
  }
}

function validateSystemContext(
  config: DesktopSettingsConfig,
  issues: SettingsValidationIssue[]
): void {
  const settings = config.app.systemContext
  if (!isPlainObject(settings)) {
    issues.push({
      path: 'app.systemContext',
      message: 'System context settings must be an object.',
      code: 'invalid_type',
    })
    return
  }
  if (typeof settings.baseSystemPrompt !== 'string') {
    issues.push({
      path: 'app.systemContext.baseSystemPrompt',
      message: 'Base system prompt must be a string.',
      code: 'invalid_type',
    })
  }
  if (settings.mask !== undefined) {
    if (!isPlainObject(settings.mask)) {
      issues.push({
        path: 'app.systemContext.mask',
        message: 'Mask settings must be an object when set.',
        code: 'invalid_type',
      })
    } else {
      if (typeof settings.mask.enabled !== 'boolean') {
        issues.push({
          path: 'app.systemContext.mask.enabled',
          message: 'Mask enabled flag must be boolean.',
          code: 'invalid_type',
        })
      }
      if (typeof settings.mask.text !== 'string') {
        issues.push({
          path: 'app.systemContext.mask.text',
          message: 'Mask text must be a string.',
          code: 'invalid_type',
        })
      }
      if (settings.mask.label !== undefined && typeof settings.mask.label !== 'string') {
        issues.push({
          path: 'app.systemContext.mask.label',
          message: 'Mask label must be a string when set.',
          code: 'invalid_type',
        })
      }
    }
  }
}

function validateChatContext(
  config: DesktopSettingsConfig,
  issues: SettingsValidationIssue[]
): void {
  const settings = config.app.chatContext
  if (!isPlainObject(settings)) {
    issues.push({
      path: 'app.chatContext',
      message: 'Chat context settings must be an object.',
      code: 'invalid_type',
    })
    return
  }
  if (!Number.isInteger(settings.recentMessages) || settings.recentMessages < 1) {
    issues.push({
      path: 'app.chatContext.recentMessages',
      message: 'Recent messages must be a positive integer.',
      code: 'invalid_number',
    })
  }
  if (
    !Number.isInteger(settings.maxInputBudgetPercent) ||
    settings.maxInputBudgetPercent < 1 ||
    settings.maxInputBudgetPercent > 100
  ) {
    issues.push({
      path: 'app.chatContext.maxInputBudgetPercent',
      message: 'Max input budget percent must be an integer between 1 and 100.',
      code: 'out_of_range',
    })
  }
  if (!isContextAttachmentPolicy(settings.includeAttachments)) {
    issues.push({
      path: 'app.chatContext.includeAttachments',
      message: 'Attachment policy must be current-only, recent, or never.',
      code: 'invalid_enum',
    })
  }
  if (typeof settings.autoCompact !== 'boolean') {
    issues.push({
      path: 'app.chatContext.autoCompact',
      message: 'Auto compact setting must be boolean.',
      code: 'invalid_type',
    })
  }
  if (
    !Number.isInteger(settings.compactThresholdPercent) ||
    settings.compactThresholdPercent < 1 ||
    settings.compactThresholdPercent > 100
  ) {
    issues.push({
      path: 'app.chatContext.compactThresholdPercent',
      message: 'Compact threshold percent must be an integer between 1 and 100.',
      code: 'out_of_range',
    })
  }
  if (
    settings.compactModelId !== undefined &&
    (typeof settings.compactModelId !== 'string' || settings.compactModelId.length === 0)
  ) {
    issues.push({
      path: 'app.chatContext.compactModelId',
      message: 'Compact model ID must be a non-empty string when set.',
      code: 'invalid_type',
    })
  }
}

function validateMemory(config: DesktopSettingsConfig, issues: SettingsValidationIssue[]): void {
  const settings = config.app.memory
  if (!isPlainObject(settings)) {
    issues.push({
      path: 'app.memory',
      message: 'Memory settings must be an object.',
      code: 'invalid_type',
    })
    return
  }
  if (typeof settings.enabled !== 'boolean') {
    issues.push({
      path: 'app.memory.enabled',
      message: 'Memory enabled flag must be boolean.',
      code: 'invalid_type',
    })
  }
  if (typeof settings.extractionEnabled !== 'boolean') {
    issues.push({
      path: 'app.memory.extractionEnabled',
      message: 'Memory extraction enabled flag must be boolean.',
      code: 'invalid_type',
    })
  }
  if (typeof settings.semanticExtractionEnabled !== 'boolean') {
    issues.push({
      path: 'app.memory.semanticExtractionEnabled',
      message: 'Semantic memory extraction enabled flag must be boolean.',
      code: 'invalid_type',
    })
  }
  if (typeof settings.retrievalEnabled !== 'boolean') {
    issues.push({
      path: 'app.memory.retrievalEnabled',
      message: 'Memory retrieval enabled flag must be boolean.',
      code: 'invalid_type',
    })
  }
  if (typeof settings.activeToolWriteEnabled !== 'boolean') {
    issues.push({
      path: 'app.memory.activeToolWriteEnabled',
      message: 'Active memory tool write enabled flag must be boolean.',
      code: 'invalid_type',
    })
  }
  if (typeof settings.maintenanceEnabled !== 'boolean') {
    issues.push({
      path: 'app.memory.maintenanceEnabled',
      message: 'Memory maintenance enabled flag must be boolean.',
      code: 'invalid_type',
    })
  }
  if (typeof settings.destructiveToolRequiresConfirmation !== 'boolean') {
    issues.push({
      path: 'app.memory.destructiveToolRequiresConfirmation',
      message: 'Memory destructive confirmation flag must be boolean.',
      code: 'invalid_type',
    })
  }
  if (
    !isFiniteNumber(settings.minConfidence) ||
    settings.minConfidence < 0 ||
    settings.minConfidence > 1
  ) {
    issues.push({
      path: 'app.memory.minConfidence',
      message: 'Memory minimum confidence must be between 0 and 1.',
      code: 'out_of_range',
    })
  }
  if (
    !isFiniteNumber(settings.lowConfidenceReviewThreshold) ||
    settings.lowConfidenceReviewThreshold < 0 ||
    settings.lowConfidenceReviewThreshold > 1
  ) {
    issues.push({
      path: 'app.memory.lowConfidenceReviewThreshold',
      message: 'Memory low confidence review threshold must be between 0 and 1.',
      code: 'out_of_range',
    })
  }
  validateIntegerRange(settings.maxContextItems, 'app.memory.maxContextItems', 0, 50, issues)
  validateIntegerRange(settings.maxContextTokens, 'app.memory.maxContextTokens', 0, 8000, issues)
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
  if (!isToolProfile(config.tools.agentToolProfile)) {
    issues.push({
      path: 'tools.agentToolProfile',
      message: 'Agent tool profile must be minimal, assistant, or power.',
      code: 'invalid_enum',
    })
  }
  if (!isPlainObject(config.tools.enabledByName)) {
    issues.push({
      path: 'tools.enabledByName',
      message: 'Tool enablement must be an object.',
      code: 'invalid_type',
    })
  }
  validateIntegerRange(config.tools.maxAgentSteps, 'tools.maxAgentSteps', 1, 24, issues)
  validateWorkspaceSettings(config.tools.workspace, 'tools.workspace', issues)
  validateTerminalSettings(config.tools.terminal, 'tools.terminal', issues)
}

function validateWorkspaceSettings(
  settings: LocalAgentWorkspaceSettings,
  path: string,
  issues: SettingsValidationIssue[]
): void {
  if (!isPlainObject(settings)) {
    issues.push({
      path,
      message: 'Workspace settings must be an object.',
      code: 'invalid_type',
    })
    return
  }
  if (!isWorkspaceRootStrategy(settings.rootStrategy)) {
    issues.push({
      path: `${path}.rootStrategy`,
      message: 'Workspace root strategy is invalid.',
      code: 'invalid_enum',
    })
  }
  validateIntegerRange(settings.retentionDays, `${path}.retentionDays`, 1, 3650, issues)
  if (typeof settings.cleanupOnSessionDelete !== 'boolean') {
    issues.push({
      path: `${path}.cleanupOnSessionDelete`,
      message: 'Value must be boolean.',
      code: 'invalid_type',
    })
  }
  validateIntegerRange(
    settings.maxFileBytes,
    `${path}.maxFileBytes`,
    1024,
    1024 * 1024 * 1024,
    issues
  )
  validateIntegerRange(
    settings.maxReadBytes,
    `${path}.maxReadBytes`,
    1024,
    64 * 1024 * 1024,
    issues
  )
  validateIntegerRange(
    settings.maxWriteBytes,
    `${path}.maxWriteBytes`,
    1024,
    64 * 1024 * 1024,
    issues
  )
  validateIntegerRange(settings.maxSearchResults, `${path}.maxSearchResults`, 1, 500, issues)
  validateIntegerRange(
    settings.maxToolResultChars,
    `${path}.maxToolResultChars`,
    1000,
    200_000,
    issues
  )
  if (!Array.isArray(settings.denyPatterns) || !settings.denyPatterns.every(isNonEmptyString)) {
    issues.push({
      path: `${path}.denyPatterns`,
      message: 'Deny patterns must be an array of non-empty strings.',
      code: 'invalid_type',
    })
  }
  if (!Array.isArray(settings.externalRoots)) {
    issues.push({
      path: `${path}.externalRoots`,
      message: 'External root grants must be an array.',
      code: 'invalid_type',
    })
    return
  }
  settings.externalRoots.forEach((grant, index) => {
    validateExternalRootGrant(grant, `${path}.externalRoots.${index}`, issues)
  })
}

function validateExternalRootGrant(
  grant: ExternalRootGrant,
  path: string,
  issues: SettingsValidationIssue[]
): void {
  if (!isPlainObject(grant)) {
    issues.push({ path, message: 'External root grant must be an object.', code: 'invalid_type' })
    return
  }
  if (!grant.id) {
    issues.push({ path: `${path}.id`, message: 'Grant ID is required.', code: 'required' })
  }
  if (!grant.path) {
    issues.push({ path: `${path}.path`, message: 'Grant path is required.', code: 'required' })
  }
  if (!['read', 'write', 'read-write'].includes(grant.access)) {
    issues.push({
      path: `${path}.access`,
      message: 'Grant access must be read, write, or read-write.',
      code: 'invalid_enum',
    })
  }
  if (!['session', 'profile', 'global'].includes(grant.scope)) {
    issues.push({
      path: `${path}.scope`,
      message: 'Grant scope must be session, profile, or global.',
      code: 'invalid_enum',
    })
  }
  if (typeof grant.enabled !== 'boolean') {
    issues.push({
      path: `${path}.enabled`,
      message: 'Value must be boolean.',
      code: 'invalid_type',
    })
  }
  if (!Number.isFinite(grant.createdAt)) {
    issues.push({
      path: `${path}.createdAt`,
      message: 'Created timestamp must be a number.',
      code: 'invalid_type',
    })
  }
  if (!Number.isFinite(grant.updatedAt)) {
    issues.push({
      path: `${path}.updatedAt`,
      message: 'Updated timestamp must be a number.',
      code: 'invalid_type',
    })
  }
}

function validateTerminalSettings(
  settings: LocalAgentTerminalSettings,
  path: string,
  issues: SettingsValidationIssue[]
): void {
  if (!isPlainObject(settings)) {
    issues.push({ path, message: 'Terminal settings must be an object.', code: 'invalid_type' })
    return
  }
  validateIntegerRange(settings.timeoutMs, `${path}.timeoutMs`, 1000, 24 * 60 * 60 * 1000, issues)
  validateIntegerRange(settings.maxOutputChars, `${path}.maxOutputChars`, 1000, 1_000_000, issues)
  validateIntegerRange(
    settings.maxForegroundProcesses,
    `${path}.maxForegroundProcesses`,
    1,
    32,
    issues
  )
  validateIntegerRange(
    settings.maxBackgroundProcesses,
    `${path}.maxBackgroundProcesses`,
    0,
    32,
    issues
  )
  validateIntegerRange(
    settings.backgroundMaxLifetimeMs,
    `${path}.backgroundMaxLifetimeMs`,
    1000,
    24 * 60 * 60 * 1000,
    issues
  )
  if (!Array.isArray(settings.minimalEnvKeys) || !settings.minimalEnvKeys.every(isNonEmptyString)) {
    issues.push({
      path: `${path}.minimalEnvKeys`,
      message: 'Minimal env keys must be an array of non-empty strings.',
      code: 'invalid_type',
    })
  }
  validateAssistantTerminalProfileSettings(settings.assistant, `${path}.assistant`, issues)
  validateTerminalProfileSettings(settings.power, `${path}.power`, issues)
}

function validateAssistantTerminalProfileSettings(
  settings: LocalAgentTerminalSettings['assistant'],
  path: string,
  issues: SettingsValidationIssue[]
): void {
  validateTerminalProfileSettings(settings, path, issues)
}

function validateTerminalProfileSettings(
  settings: LocalAgentTerminalSettings['power'],
  path: string,
  issues: SettingsValidationIssue[]
): void {
  if (!isPlainObject(settings)) {
    issues.push({
      path,
      message: 'Terminal profile settings must be an object.',
      code: 'invalid_type',
    })
    return
  }
  if (!isNetworkPolicy(settings.network)) {
    issues.push({
      path: `${path}.network`,
      message: 'Network policy must be ask, allow, or deny.',
      code: 'invalid_enum',
    })
  }
  if (typeof settings.allowBackground !== 'boolean') {
    issues.push({
      path: `${path}.allowBackground`,
      message: 'Value must be boolean.',
      code: 'invalid_type',
    })
  }
  if (typeof settings.allowPty !== 'boolean') {
    issues.push({
      path: `${path}.allowPty`,
      message: 'Value must be boolean.',
      code: 'invalid_type',
    })
  }
  if (typeof settings.fullAccess !== 'boolean') {
    issues.push({
      path: `${path}.fullAccess`,
      message: 'Value must be boolean.',
      code: 'invalid_type',
    })
  }
  if (
    !Array.isArray(settings.commandAllowPatterns) ||
    !settings.commandAllowPatterns.every(isNonEmptyString)
  ) {
    issues.push({
      path: `${path}.commandAllowPatterns`,
      message: 'Command allow patterns must be an array of non-empty strings.',
      code: 'invalid_type',
    })
  }
  if (
    !Array.isArray(settings.commandDenyPatterns) ||
    !settings.commandDenyPatterns.every(isNonEmptyString)
  ) {
    issues.push({
      path: `${path}.commandDenyPatterns`,
      message: 'Command deny patterns must be an array of non-empty strings.',
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
  if (!['run_once', 'skip'].includes(config.scheduledTasks.misfirePolicy)) {
    issues.push({
      path: 'scheduledTasks.misfirePolicy',
      message: 'Scheduled task misfire policy must be run_once or skip.',
      code: 'invalid_enum',
    })
  }
  if (
    !Number.isInteger(config.scheduledTasks.misfireGraceMs) ||
    config.scheduledTasks.misfireGraceMs < 0 ||
    config.scheduledTasks.misfireGraceMs > 7 * 24 * 60 * 60 * 1000
  ) {
    issues.push({
      path: 'scheduledTasks.misfireGraceMs',
      message: 'Scheduled task misfire grace must be an integer between 0 and 604800000.',
      code: 'out_of_range',
    })
  }
  if (
    !Number.isInteger(config.scheduledTasks.misfireStartupLimit) ||
    config.scheduledTasks.misfireStartupLimit < 0 ||
    config.scheduledTasks.misfireStartupLimit > 50
  ) {
    issues.push({
      path: 'scheduledTasks.misfireStartupLimit',
      message: 'Scheduled task startup backfill limit must be an integer between 0 and 50.',
      code: 'out_of_range',
    })
  }
}

function validateObservation(
  config: DesktopSettingsConfig,
  issues: SettingsValidationIssue[]
): void {
  const settings = config.observation
  if (!isPlainObject(settings)) {
    issues.push({
      path: 'observation',
      message: 'Observation settings must be an object.',
      code: 'invalid_type',
    })
    return
  }

  if (!isObservationScope(settings.defaultScope)) {
    issues.push({
      path: 'observation.defaultScope',
      message: 'Observation scope is invalid.',
      code: 'invalid_enum',
    })
  }
  if (!isObservationScreenshotRetention(settings.screenshotRetention)) {
    issues.push({
      path: 'observation.screenshotRetention',
      message: 'Observation retention policy is invalid.',
      code: 'invalid_enum',
    })
  }
  validateIntegerRange(
    settings.evaluationIntervalMs,
    'observation.evaluationIntervalMs',
    5_000,
    60 * 60_000,
    issues
  )
  validateIntegerRange(
    settings.minCaptureIntervalMs,
    'observation.minCaptureIntervalMs',
    5_000,
    24 * 60 * 60_000,
    issues
  )
  validateIntegerRange(
    settings.dailyCaptureLimit,
    'observation.dailyCaptureLimit',
    1,
    10_000,
    issues
  )
  validateIntegerRange(
    settings.consecutiveFailureLimit,
    'observation.consecutiveFailureLimit',
    1,
    20,
    issues
  )
  validateIntegerRange(
    settings.notificationCooldownMs,
    'observation.notificationCooldownMs',
    0,
    60 * 60_000,
    issues
  )

  if (
    !isFiniteNumber(settings.captureProbability) ||
    settings.captureProbability < 0 ||
    settings.captureProbability > 1
  ) {
    issues.push({
      path: 'observation.captureProbability',
      message: 'Observation capture probability must be a number between 0 and 1.',
      code: 'out_of_range',
    })
  }
  validateIntegerRange(
    settings.reactionNudgeAfterSilentCaptures,
    'observation.reactionNudgeAfterSilentCaptures',
    1,
    100,
    issues
  )
  if (
    !isFiniteNumber(settings.reactionNudgeProbability) ||
    settings.reactionNudgeProbability < 0 ||
    settings.reactionNudgeProbability > 1
  ) {
    issues.push({
      path: 'observation.reactionNudgeProbability',
      message: 'Observation reaction nudge probability must be a number between 0 and 1.',
      code: 'out_of_range',
    })
  }
  if (typeof settings.allowRemoteProviders !== 'boolean') {
    issues.push({
      path: 'observation.allowRemoteProviders',
      message: 'Observation remote provider allowance must be boolean.',
      code: 'invalid_type',
    })
  }
  if (typeof settings.localOnly !== 'boolean') {
    issues.push({
      path: 'observation.localOnly',
      message: 'Observation local-only setting must be boolean.',
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

function isToolProfile(value: unknown): value is ToolProfile {
  return value === 'minimal' || value === 'assistant' || value === 'power'
}

function isContextAttachmentPolicy(value: unknown): value is ContextAttachmentPolicy {
  return value === 'current-only' || value === 'recent' || value === 'never'
}

function isObservationScope(value: unknown): value is DesktopObservationSettings['defaultScope'] {
  return value === 'primary_display' || value === 'selected_display' || value === 'selected_window'
}

function isObservationScreenshotRetention(
  value: unknown
): value is DesktopObservationSettings['screenshotRetention'] {
  return value === 'ephemeral' || value === 'persist'
}

function isValidAcceleratorShape(value: string): boolean {
  const parts = value
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length < 2) {
    return false
  }

  const modifiers = new Set([
    'command',
    'cmd',
    'control',
    'ctrl',
    'commandorcontrol',
    'cmdorctrl',
    'alt',
    'option',
    'altgr',
    'shift',
    'super',
    'meta',
  ])
  let hasModifier = false
  let hasKey = false
  for (const part of parts) {
    if (modifiers.has(part.toLowerCase())) {
      hasModifier = true
    } else {
      hasKey = true
    }
  }
  return hasModifier && hasKey
}

function normalizeChatContextSettings(
  rawValue: unknown
): DesktopSettingsConfig['app']['chatContext'] {
  const defaults = defaultConfig.app.chatContext
  if (rawValue === undefined || rawValue === null) {
    return cloneUnknown(defaults)
  }
  if (!isPlainObject(rawValue)) {
    throwValidationError([
      {
        path: 'app.chatContext',
        message: 'Chat context settings must be an object.',
        code: 'invalid_type',
      },
    ])
  }

  return {
    recentMessages: rawValue.recentMessages ?? defaults.recentMessages,
    maxInputBudgetPercent: rawValue.maxInputBudgetPercent ?? defaults.maxInputBudgetPercent,
    includeAttachments: rawValue.includeAttachments ?? defaults.includeAttachments,
    autoCompact: rawValue.autoCompact ?? defaults.autoCompact,
    compactThresholdPercent: rawValue.compactThresholdPercent ?? defaults.compactThresholdPercent,
    compactModelId: rawValue.compactModelId,
  } as DesktopSettingsConfig['app']['chatContext']
}

function normalizeShortcutSettings(rawValue: unknown): DesktopShortcutSettings {
  const defaults = defaultConfig.app.shortcuts
  if (rawValue === undefined || rawValue === null) {
    return cloneUnknown(defaults)
  }
  if (!isPlainObject(rawValue)) {
    throwValidationError([
      {
        path: 'app.shortcuts',
        message: 'Shortcut settings must be an object.',
        code: 'invalid_type',
      },
    ])
  }

  const rawBindings = isPlainObject(rawValue.bindings) ? rawValue.bindings : {}
  const bindings = cloneUnknown(defaults.bindings)
  for (const action of SHORTCUT_ACTIONS) {
    const rawBinding = rawBindings[action]
    const defaultBinding = defaults.bindings[action]
    bindings[action] = isPlainObject(rawBinding)
      ? {
          enabled: true,
          accelerator:
            typeof rawBinding.accelerator === 'string'
              ? rawBinding.accelerator.trim()
              : defaultBinding.accelerator,
        }
      : cloneUnknown(defaultBinding)
  }

  return { bindings }
}

function normalizeMemorySettings(rawValue: unknown): DesktopSettingsConfig['app']['memory'] {
  const defaults = defaultConfig.app.memory
  if (rawValue === undefined || rawValue === null) {
    return cloneUnknown(defaults)
  }
  if (!isPlainObject(rawValue)) {
    throwValidationError([
      {
        path: 'app.memory',
        message: 'Memory settings must be an object.',
        code: 'invalid_type',
      },
    ])
  }

  return {
    enabled: typeof rawValue.enabled === 'boolean' ? rawValue.enabled : defaults.enabled,
    extractionEnabled:
      typeof rawValue.extractionEnabled === 'boolean'
        ? rawValue.extractionEnabled
        : defaults.extractionEnabled,
    semanticExtractionEnabled:
      typeof rawValue.semanticExtractionEnabled === 'boolean'
        ? rawValue.semanticExtractionEnabled
        : defaults.semanticExtractionEnabled,
    retrievalEnabled:
      typeof rawValue.retrievalEnabled === 'boolean'
        ? rawValue.retrievalEnabled
        : defaults.retrievalEnabled,
    activeToolWriteEnabled:
      typeof rawValue.activeToolWriteEnabled === 'boolean'
        ? rawValue.activeToolWriteEnabled
        : defaults.activeToolWriteEnabled,
    maintenanceEnabled:
      typeof rawValue.maintenanceEnabled === 'boolean'
        ? rawValue.maintenanceEnabled
        : defaults.maintenanceEnabled,
    destructiveToolRequiresConfirmation:
      typeof rawValue.destructiveToolRequiresConfirmation === 'boolean'
        ? rawValue.destructiveToolRequiresConfirmation
        : defaults.destructiveToolRequiresConfirmation,
    minConfidence:
      typeof rawValue.minConfidence === 'number' ? rawValue.minConfidence : defaults.minConfidence,
    lowConfidenceReviewThreshold:
      typeof rawValue.lowConfidenceReviewThreshold === 'number'
        ? rawValue.lowConfidenceReviewThreshold
        : defaults.lowConfidenceReviewThreshold,
    maxContextItems:
      typeof rawValue.maxContextItems === 'number'
        ? rawValue.maxContextItems
        : defaults.maxContextItems,
    maxContextTokens:
      typeof rawValue.maxContextTokens === 'number'
        ? rawValue.maxContextTokens
        : defaults.maxContextTokens,
  }
}

function normalizeSystemContextSettings(
  rawValue: unknown
): DesktopSettingsConfig['app']['systemContext'] {
  const defaults = defaultConfig.app.systemContext
  if (rawValue === undefined || rawValue === null) {
    return cloneUnknown(defaults)
  }
  if (!isPlainObject(rawValue)) {
    throwValidationError([
      {
        path: 'app.systemContext',
        message: 'System context settings must be an object.',
        code: 'invalid_type',
      },
    ])
  }

  const baseSystemPrompt =
    typeof rawValue.baseSystemPrompt === 'string'
      ? rawValue.baseSystemPrompt
      : defaults.baseSystemPrompt

  const rawMask = rawValue.mask
  let mask = defaults.mask ? cloneUnknown(defaults.mask) : undefined
  if (rawMask === null) {
    mask = undefined
  } else if (isPlainObject(rawMask)) {
    mask = {
      enabled: typeof rawMask.enabled === 'boolean' ? rawMask.enabled : (mask?.enabled ?? false),
      label: typeof rawMask.label === 'string' ? rawMask.label : mask?.label,
      text: typeof rawMask.text === 'string' ? rawMask.text : (mask?.text ?? ''),
    }
  }

  return {
    baseSystemPrompt,
    mask,
  }
}

function normalizeObservationSettings(rawValue: unknown): DesktopObservationSettings {
  const defaults = defaultConfig.observation
  if (rawValue === undefined || rawValue === null) {
    return cloneUnknown(defaults)
  }
  if (!isPlainObject(rawValue)) {
    throwValidationError([
      {
        path: 'observation',
        message: 'Observation settings must be an object.',
        code: 'invalid_type',
      },
    ])
  }

  const legacyRetention = rawValue.retention === 'persist' ? 'persist' : 'ephemeral'
  return {
    evaluationIntervalMs: integerOrDefault(
      rawValue.evaluationIntervalMs ?? rawValue.defaultIntervalMs ?? rawValue.intervalMs,
      defaults.evaluationIntervalMs
    ),
    captureProbability:
      typeof rawValue.captureProbability === 'number' &&
      Number.isFinite(rawValue.captureProbability)
        ? rawValue.captureProbability
        : defaults.captureProbability,
    reactionNudgeAfterSilentCaptures: integerOrDefault(
      rawValue.reactionNudgeAfterSilentCaptures ??
        rawValue.replyNudgeAfterSilentCaptures ??
        rawValue.responseNudgeAfterSilentCaptures,
      defaults.reactionNudgeAfterSilentCaptures
    ),
    reactionNudgeProbability:
      typeof rawValue.reactionNudgeProbability === 'number' &&
      Number.isFinite(rawValue.reactionNudgeProbability)
        ? rawValue.reactionNudgeProbability
        : typeof rawValue.replyNudgeProbability === 'number' &&
            Number.isFinite(rawValue.replyNudgeProbability)
          ? rawValue.replyNudgeProbability
          : defaults.reactionNudgeProbability,
    minCaptureIntervalMs: integerOrDefault(
      rawValue.minCaptureIntervalMs ?? rawValue.minIntervalMs,
      defaults.minCaptureIntervalMs
    ),
    defaultScope: (rawValue.defaultScope === undefined
      ? defaults.defaultScope
      : rawValue.defaultScope) as DesktopObservationSettings['defaultScope'],
    screenshotRetention: (rawValue.screenshotRetention === undefined
      ? legacyRetention
      : rawValue.screenshotRetention) as DesktopObservationSettings['screenshotRetention'],
    allowRemoteProviders:
      typeof rawValue.allowRemoteProviders === 'boolean'
        ? rawValue.allowRemoteProviders
        : defaults.allowRemoteProviders,
    localOnly: typeof rawValue.localOnly === 'boolean' ? rawValue.localOnly : defaults.localOnly,
    dailyCaptureLimit: integerOrDefault(rawValue.dailyCaptureLimit, defaults.dailyCaptureLimit),
    consecutiveFailureLimit: integerOrDefault(
      rawValue.consecutiveFailureLimit,
      defaults.consecutiveFailureLimit
    ),
    notificationCooldownMs: integerOrDefault(
      rawValue.notificationCooldownMs ?? rawValue.reactionCooldownMs ?? rawValue.cooldownMs,
      defaults.notificationCooldownMs
    ),
  }
}

function normalizeWorkspaceSettings(rawValue: unknown): LocalAgentWorkspaceSettings {
  const defaults = defaultConfig.tools.workspace
  if (rawValue === undefined || rawValue === null) {
    return cloneUnknown(defaults)
  }
  if (!isPlainObject(rawValue)) {
    throwValidationError([
      {
        path: 'tools.workspace',
        message: 'Workspace settings must be an object.',
        code: 'invalid_type',
      },
    ])
  }

  return {
    rootStrategy: isWorkspaceRootStrategy(rawValue.rootStrategy)
      ? rawValue.rootStrategy
      : defaults.rootStrategy,
    retentionDays: integerOrDefault(rawValue.retentionDays, defaults.retentionDays),
    cleanupOnSessionDelete:
      typeof rawValue.cleanupOnSessionDelete === 'boolean'
        ? rawValue.cleanupOnSessionDelete
        : defaults.cleanupOnSessionDelete,
    maxFileBytes: integerOrDefault(rawValue.maxFileBytes, defaults.maxFileBytes),
    maxReadBytes: integerOrDefault(rawValue.maxReadBytes, defaults.maxReadBytes),
    maxWriteBytes: integerOrDefault(rawValue.maxWriteBytes, defaults.maxWriteBytes),
    maxSearchResults: integerOrDefault(rawValue.maxSearchResults, defaults.maxSearchResults),
    maxToolResultChars: integerOrDefault(rawValue.maxToolResultChars, defaults.maxToolResultChars),
    denyPatterns: normalizeStringArray(rawValue.denyPatterns, defaults.denyPatterns),
    externalRoots: Array.isArray(rawValue.externalRoots)
      ? rawValue.externalRoots.map(normalizeExternalRootGrant)
      : [],
  }
}

function normalizeExternalRootGrant(value: unknown): ExternalRootGrant {
  const now = Date.now()
  if (!isPlainObject(value)) {
    return {
      id: '',
      path: '',
      access: 'read',
      scope: 'session',
      enabled: false,
      createdAt: now,
      updatedAt: now,
    }
  }
  return {
    id: typeof value.id === 'string' ? value.id : '',
    path: typeof value.path === 'string' ? value.path : '',
    access:
      value.access === 'read' || value.access === 'write' || value.access === 'read-write'
        ? value.access
        : 'read',
    scope:
      value.scope === 'session' || value.scope === 'profile' || value.scope === 'global'
        ? value.scope
        : 'session',
    sessionId: typeof value.sessionId === 'string' ? value.sessionId : undefined,
    profile: isToolProfile(value.profile) ? value.profile : undefined,
    enabled: typeof value.enabled === 'boolean' ? value.enabled : true,
    createdAt: typeof value.createdAt === 'number' ? value.createdAt : now,
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : now,
  }
}

function normalizeTerminalSettings(rawValue: unknown): LocalAgentTerminalSettings {
  const defaults = defaultConfig.tools.terminal
  if (rawValue === undefined || rawValue === null) {
    return cloneUnknown(defaults)
  }
  if (!isPlainObject(rawValue)) {
    throwValidationError([
      {
        path: 'tools.terminal',
        message: 'Terminal settings must be an object.',
        code: 'invalid_type',
      },
    ])
  }

  return {
    timeoutMs: integerOrDefault(rawValue.timeoutMs, defaults.timeoutMs),
    maxOutputChars: integerOrDefault(rawValue.maxOutputChars, defaults.maxOutputChars),
    maxForegroundProcesses: integerOrDefault(
      rawValue.maxForegroundProcesses,
      defaults.maxForegroundProcesses
    ),
    maxBackgroundProcesses: integerOrDefault(
      rawValue.maxBackgroundProcesses,
      defaults.maxBackgroundProcesses
    ),
    backgroundMaxLifetimeMs: integerOrDefault(
      rawValue.backgroundMaxLifetimeMs,
      defaults.backgroundMaxLifetimeMs
    ),
    minimalEnvKeys: normalizeStringArray(rawValue.minimalEnvKeys, defaults.minimalEnvKeys),
    assistant: normalizeTerminalProfileSettings(rawValue.assistant, defaults.assistant),
    power: normalizeTerminalProfileSettings(rawValue.power, defaults.power),
  }
}

function normalizeTerminalProfileSettings(
  rawValue: unknown,
  defaults: LocalAgentTerminalSettings['power']
): LocalAgentTerminalSettings['power'] {
  if (!isPlainObject(rawValue)) {
    return cloneUnknown(defaults)
  }
  return {
    network: isNetworkPolicy(rawValue.network) ? rawValue.network : defaults.network,
    allowBackground:
      typeof rawValue.allowBackground === 'boolean'
        ? rawValue.allowBackground
        : defaults.allowBackground,
    allowPty: typeof rawValue.allowPty === 'boolean' ? rawValue.allowPty : defaults.allowPty,
    fullAccess:
      typeof rawValue.fullAccess === 'boolean' ? rawValue.fullAccess : defaults.fullAccess,
    commandAllowPatterns: normalizeStringArray(
      rawValue.commandAllowPatterns,
      defaults.commandAllowPatterns
    ),
    commandDenyPatterns: normalizeStringArray(
      rawValue.commandDenyPatterns,
      defaults.commandDenyPatterns
    ),
  }
}

function normalizeChatContextCompatibility(
  config: DesktopSettingsConfig,
  raw: unknown
): DesktopSettingsConfig {
  if (!isPlainObject(raw) || !isPlainObject(raw.app)) {
    return config
  }

  const rawApp = raw.app
  const legacyRecentMessages =
    typeof rawApp.maxRecentMessages === 'number' ? rawApp.maxRecentMessages : undefined
  const rawChatContext = rawApp.chatContext
  const hasChatContext = isPlainObject(rawChatContext)
  const rawChatContextObject = hasChatContext ? rawChatContext : undefined
  const chatRecentMessages =
    rawChatContextObject !== undefined && typeof rawChatContextObject.recentMessages === 'number'
      ? rawChatContextObject.recentMessages
      : undefined

  if (!hasChatContext && legacyRecentMessages !== undefined) {
    config.app.chatContext.recentMessages = legacyRecentMessages
    return config
  }

  if (hasChatContext && chatRecentMessages === undefined && legacyRecentMessages !== undefined) {
    config.app.chatContext.recentMessages = legacyRecentMessages
    return config
  }

  if (legacyRecentMessages === undefined && chatRecentMessages !== undefined) {
    config.app.maxRecentMessages = chatRecentMessages
  }

  return config
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

function normalizeStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return [...fallback]
  }
  return value.filter(isNonEmptyString)
}

function integerOrDefault(value: unknown, fallback: number): number {
  return Number.isInteger(value) ? (value as number) : fallback
}

function normalizeInteger(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) {
    return fallback
  }
  return Math.max(min, Math.min(Math.round(numeric), max))
}

function validateIntegerRange(
  value: unknown,
  path: string,
  min: number,
  max: number,
  issues: SettingsValidationIssue[]
): void {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    issues.push({
      path,
      message: `Value must be an integer between ${min} and ${max}.`,
      code: 'out_of_range',
    })
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isWorkspaceRootStrategy(value: unknown): value is WorkspaceRootStrategy {
  return value === 'managed-user-data'
}

function isNetworkPolicy(value: unknown): value is LocalNetworkPolicy {
  return value === 'ask' || value === 'allow' || value === 'deny'
}

function redactSecretText(text: string): string {
  return redactSensitiveText(text)
}

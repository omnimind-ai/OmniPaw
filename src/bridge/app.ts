import type { OmniPawBridge } from '@shared/types/bridge'
import type { CatDraftState, CatPanelPlacement, CatStatus, CatWindowState } from '@shared/types/cat'
import type {
  CatAppearanceDeleteResponse,
  CatAppearanceImportResponse,
  CatAppearanceListResponse,
  CatAppearanceResolvedPack,
} from '@shared/types/cat-appearance'
import {
  CAT_PET_ACTIONS,
  CAT_PET_AFFECTION_DEFAULT,
  CAT_PET_AFFECTION_MAX,
  CAT_PET_AFFECTION_MIN,
  CAT_PET_DAILY_LIMITS,
  CAT_PET_MOOD_DEFAULT,
  CAT_PET_MOOD_MAX,
  CAT_PET_MOOD_MIN,
  type CatPetInteractionDefinition,
  type CatPetInventoryResponse,
  type CatPetState,
  type CatPetUpdateInteractionsResponse,
  defaultCatPetGiftConfigs,
  defaultCatPetInteractionConfigs,
  emptyCatPetActionCounters,
  moodFromScore,
} from '@shared/types/cat-pet'
import type {
  ExportCompanionRoleCardResponse,
  ImportCompanionRoleCardResponse,
} from '@shared/types/companion-role'
import type {
  CreateCronTaskResponse,
  DeleteCronTaskResponse,
  RunCronTaskNowResponse,
  UpdateCronTaskResponse,
} from '@shared/types/cron'
import type {
  AgentWorkspaceStatus,
  CleanupWorkspaceResponse,
  DeleteWorkspaceFileResponse,
  ExportWorkspaceFileResponse,
  KillLocalProcessResponse,
  ListWorkspaceFilesResponse,
  LocalAgentTerminalSettings,
  LocalAgentWorkspaceSettings,
  ReadWorkspaceFileResponse,
  RevealWorkspaceFileResponse,
} from '@shared/types/local-agent'
import type {
  CompanionMemoryItem,
  CompanionMemoryMaintenanceProposal,
  DesktopMemorySettings,
} from '@shared/types/memory'
import type { ObservationState } from '@shared/types/observation'
import type {
  OmniInferRuntimeSnapshot,
  PickLocalGgufResponse,
  PickOmniInferInstallDirResponse,
} from '@shared/types/omniinfer'
import type { DesktopCompanionRoleSettings } from '@shared/types/settings'
import type { DesktopShortcutSettings, ShortcutStatusChangedEvent } from '@shared/types/shortcuts'
import { SHORTCUT_ACTIONS } from '@shared/types/shortcuts'
import type { DesktopWindowState, DesktopWindowStateChangedEvent } from '@shared/types/window'

const FALLBACK_COMPANION_ROLE_ID = 'default'

export type BridgeUnsubscribe = () => void
export type BridgeDesktopWindowState = DesktopWindowState
export type BridgeDesktopWindowStateChangedEvent = DesktopWindowStateChangedEvent

export type BridgeAppTheme = 'system' | 'light' | 'dark'
export type BridgeAppLanguage = 'system' | 'zh-CN' | 'en-US'
export type BridgeToolProfile = 'minimal' | 'assistant' | 'power' | string
export type BridgeContextUsageSource = 'actual' | 'estimated' | 'mixed' | 'provider' | string
export type BridgeContextAttachmentPolicy = 'current-only' | 'recent' | 'never'
export type BridgeObservationScope = 'primary_display' | 'selected_display' | 'selected_window'
export type BridgeObservationScreenshotRetention = 'ephemeral' | 'persist'
export type BridgeShortcutStatusChangedEvent = ShortcutStatusChangedEvent

export interface BridgeChatContextSettings {
  recentMessages: number
  maxInputBudgetPercent: number
  includeAttachments: BridgeContextAttachmentPolicy
  autoCompact: boolean
  compactThresholdPercent: number
  compactModelId?: string
}

export interface BridgeSystemContextMaskSettings {
  enabled: boolean
  label?: string
  text: string
}

export interface BridgeSystemContextSettings {
  baseSystemPrompt: string
  mask?: BridgeSystemContextMaskSettings
}

export interface BridgeDesktopBackgroundImage {
  path: string
  url: string
  width: number
  height: number
  aspectRatio: number
  mimeType: string
}

export interface BridgeDesktopBackgroundSettings {
  enabled: boolean
  opacity: number
  blur: number
  image?: BridgeDesktopBackgroundImage
}

export interface BridgePickDesktopBackgroundImageResponse {
  canceled: boolean
  image?: BridgeDesktopBackgroundImage
}

export interface BridgeContextUsageMetadata {
  inputTokens?: number
  estimatedInputTokens?: number
  outputTokens?: number
  totalTokens?: number
  contextWindowTokens?: number
  contextWindow?: number
  windowTokens?: number
  budgetTokens?: number
  budgetInputTokens?: number
  maxInputTokens?: number
  windowUsagePercent?: number
  windowPercent?: number
  percentage?: number
  percent?: number
  usagePercent?: number
  source?: BridgeContextUsageSource
  usageSource?: BridgeContextUsageSource
  updatedAt?: number
  lastUpdatedAt?: number
}

export interface BridgeDesktopSettingsConfig {
  version: 1
  app: {
    language: BridgeAppLanguage
    theme: BridgeAppTheme
    initialized: boolean
    minimizeToTrayOnStartup: boolean
    welcomeTitle: string
    showReasoningContent: boolean
    zoom: {
      factor: number
      min: number
      max: number
    }
    maxRecentMessages: number
    chatContext: BridgeChatContextSettings
    systemContext: BridgeSystemContextSettings
    companionRoles: DesktopCompanionRoleSettings[]
    activeCompanionRoleId: string
    background: BridgeDesktopBackgroundSettings
    compactSkillDescriptions: boolean
    shortcuts: DesktopShortcutSettings
    memory: DesktopMemorySettings
    dataDir?: string
  }
  providers: {
    sources: Array<
      Record<string, unknown> & { id: string; name: string; baseUrl: string; enabled: boolean }
    >
    models: Array<
      Record<string, unknown> & {
        id: string
        name: string
        providerSourceId: string
        enabled: boolean
      }
    >
    settings: {
      defaultModelId: string
      fallbackModelIds: string[]
      streaming: boolean
    }
  }
  tools: {
    agentToolProfile: BridgeToolProfile
    maxAgentSteps: number
    enabledByName: Record<string, boolean>
    workspace: LocalAgentWorkspaceSettings
    terminal: LocalAgentTerminalSettings
  }
  scheduledTasks: {
    enabled: boolean
    misfirePolicy: 'run_once' | 'skip'
    misfireGraceMs: number
    misfireStartupLimit: number
  }
  observation: {
    evaluationIntervalMs: number
    captureProbability: number
    reactionNudgeAfterSilentCaptures: number
    reactionNudgeProbability: number
    minCaptureIntervalMs: number
    defaultScope: BridgeObservationScope
    screenshotRetention: BridgeObservationScreenshotRetention
    allowRemoteProviders: boolean
    localOnly: boolean
    dailyCaptureLimit: number
    consecutiveFailureLimit: number
    notificationCooldownMs: number
  }
}

export interface BridgeSettingsOperationError {
  code: string
  message: string
  path?: string
  recoverable: boolean
  issues?: Array<{ path: string; message: string; code?: string }>
}

export interface BridgeDesktopSettingsStatus {
  path: string
  backupPath: string
  exists: boolean
  backupExists: boolean
  loaded: boolean
  version?: 1
  recoverable: boolean
  error?: BridgeSettingsOperationError
}

export interface BridgeDesktopSettingsChangedEvent {
  reason: 'load' | 'save' | 'reset'
  config: BridgeDesktopSettingsConfig
  status: BridgeDesktopSettingsStatus
}

export interface BridgeChatSession {
  id: string
  title: string
  kind?: 'chat' | 'cat' | 'cron' | 'vision' | string
  status: 'active' | 'archived' | 'deleted'
  defaultProviderId?: string
  defaultModelId?: string
  providerId?: string
  modelId?: string
  systemPrompt?: string
  contextPolicy?: Record<string, unknown>
  contextUsage?: BridgeContextUsageMetadata
  messageCount?: number
  lastMessagePreview?: string
  lastMessageAt?: number
  metadata?: Record<string, unknown>
  createdAt: number
  updatedAt: number
}

export interface BridgeListSessionsRequest {
  kind?: 'chat' | 'cat' | 'cron' | 'vision' | 'all'
  includeDeleted?: boolean
}

export interface BridgeCreateSessionRequest {
  title?: string
  kind?: 'chat' | 'cat' | 'vision'
  providerId?: string
  modelId?: string
}

export interface BridgeChatSessionChangedEvent {
  reason: 'created' | 'updated' | 'deleted' | 'title_generated' | 'observation' | string
  sessionId: string
  session?: BridgeChatSession
}

export interface BridgeChatMessagePart {
  type: string
  text?: string
  think?: string
  attachmentId?: string
  attachment_id?: string
  messageId?: string | number
  message_id?: string | number
  selectedText?: string
  selected_text?: string
  filename?: string
  toolCalls?: unknown[]
  tool_calls?: unknown[]
  toolCall?: unknown
  tool_call?: unknown
  [key: string]: unknown
}

export type BridgeChatRunMode = 'assistant' | 'fast_chat' | string
export type BridgeToolCallStatus =
  | 'pending'
  | 'running'
  | 'complete'
  | 'error'
  | 'denied'
  | 'aborted'
  | string

export interface BridgeToolCall {
  id?: string
  runId?: string
  run_id?: string
  sessionId?: string
  session_id?: string
  index?: number
  toolCallId?: string
  tool_call_id?: string
  name?: string
  toolName?: string
  tool_name?: string
  args?: unknown
  arguments?: unknown
  argumentsDelta?: string
  arguments_delta?: string
  result?: unknown
  error?: unknown
  approval?: {
    required?: boolean
    state?: 'pending' | 'approved' | 'rejected' | string
    risk?: string
    reason?: string
    plan?: unknown
    fullAccess?: boolean
  }
  status?: BridgeToolCallStatus
  state?: BridgeToolCallStatus
  toolStatus?: BridgeToolCallStatus
  tool_status?: BridgeToolCallStatus
  startedAt?: number
  started_at?: number
  startTime?: number
  start_time?: number
  ts?: number
  finishedAt?: number
  finished_at?: number
  finishedTs?: number
  finished_ts?: number
  endTime?: number
  end_time?: number
  durationMs?: number
  duration_ms?: number
  [key: string]: unknown
}

export interface BridgeChatMessage {
  id: string
  sessionId: string
  role: 'system' | 'user' | 'assistant' | 'tool' | string
  status?: string
  parts: BridgeChatMessagePart[]
  runId?: string
  checkpointId?: string
  error?: { message?: string; code?: string }
  usage?: Record<string, unknown>
  contextUsage?: BridgeContextUsageMetadata
  metadata?: Record<string, unknown>
  createdAt: number
  updatedAt: number
}

export interface BridgeSendMessageRequest {
  sessionId: string
  parts?: BridgeChatMessagePart[]
  content?: string
  providerId?: string
  modelId?: string
  mode?: BridgeChatRunMode
  toolProfile?: BridgeToolProfile
  tool_profile?: BridgeToolProfile
  maxSteps?: number
  max_steps?: number
  enableStreaming?: boolean
  idempotencyKey?: string
  checkpointId?: string | null
  metadata?: Record<string, unknown>
}

export interface BridgeSendMessageResponse {
  runId?: string
  userMessageId?: string
  assistantMessageId?: string
  messageId?: string
  accepted?: boolean
  userMessage?: BridgeChatMessage
  assistantMessage?: BridgeChatMessage
}

export interface BridgeRegenerateMessageRequest {
  sessionId: string
  messageId: string
  providerId?: string
  modelId?: string
  toolProfile?: BridgeToolProfile
  maxSteps?: number
  idempotencyKey?: string
}

export interface BridgeToolApprovalRequest {
  runId: string
  toolCallId: string
  action: 'approve' | 'reject'
}

export interface BridgeToolApprovalResponse {
  accepted: boolean
  runId: string
  toolCallId: string
  action: 'approve' | 'reject'
  reason?: string
}

export interface BridgeStreamEvent {
  type: 'started' | 'delta' | 'final' | 'error' | 'aborted' | string
  runId: string
  sessionId: string
  assistantMessageId: string
  seq: number
  channel?: 'content' | 'reasoning' | 'tool_call' | string
  delta?: string
  text?: string
  part?: BridgeChatMessagePart
  toolCall?: BridgeToolCall
  tool_call?: BridgeToolCall
  toolCalls?: BridgeToolCall[]
  tool_calls?: BridgeToolCall[]
  toolCallId?: string
  tool_call_id?: string
  name?: string
  toolName?: string
  tool_name?: string
  args?: unknown
  arguments?: unknown
  argumentsDelta?: string
  arguments_delta?: string
  index?: number
  result?: unknown
  status?: BridgeToolCallStatus
  state?: BridgeToolCallStatus
  step?: number
  maxSteps?: number
  max_steps?: number
  message?: BridgeChatMessage
  error?: { message?: string; code?: string } | unknown
  usage?: Record<string, unknown>
  contextUsage?: BridgeContextUsageMetadata
  requestSnapshot?: Record<string, unknown>
  [key: string]: unknown
}

export interface BridgeAttachment {
  id: string
  kind?: string
  originalName?: string
  storedName?: string
  filename?: string
  mimeType?: string
  sizeBytes?: number
  sha256?: string
  previewUrl?: string
  url?: string
  createdAt?: number
  updatedAt?: number
}

export interface BridgeProviderModel {
  id: string
  name?: string
  displayName?: string
  remoteId?: string
  enabled?: boolean
  input?: Array<'text' | 'image' | 'audio' | 'file'>
  supportsStreaming?: boolean
  supportsTools?: boolean
  supportsReasoning?: boolean
  contextWindow?: number
  maxOutputTokens?: number
  capabilities?: Record<string, unknown>
  compat?: Record<string, unknown>
  compatibility?: Record<string, unknown>
}

export interface BridgeProviderConfig {
  id: string
  name: string
  type?: string
  api:
    | 'openai-chat-completions'
    | 'openai-responses'
    | 'openai-codex-responses'
    | 'anthropic-messages'
    | 'ollama'
    | 'omniinfer'
  baseUrl: string
  enabled?: boolean
  defaultModelId?: string
  models?: BridgeProviderModel[]
  capabilities?: Record<string, unknown>
  createdAt?: number
  updatedAt?: number
  [key: string]: unknown
}

export interface BridgeProviderPreset {
  id: string
  name: string
  type: 'openai-compatible' | 'openai-codex' | 'anthropic-compatible' | 'ollama' | 'omniinfer'
  api:
    | 'openai-chat-completions'
    | 'openai-responses'
    | 'openai-codex-responses'
    | 'anthropic-messages'
    | 'ollama'
    | 'omniinfer'
  baseUrl: string
  description?: string
  enabled?: boolean
  credentialRef?: string
  authHeader?: string
  headers?: Record<string, string>
  extraBody?: Record<string, unknown>
  defaultModelId?: string
  models?: BridgeProviderModel[]
  capabilities?: Record<string, unknown>
  compat?: Record<string, unknown>
}

export interface BridgeProviderRegistrySource extends Omit<BridgeProviderConfig, 'models'> {
  defaultModelId?: string
}

export interface BridgeProviderRegistryModel extends BridgeProviderModel {
  providerId: string
  providerSourceId?: string
  manual?: boolean
}

export interface BridgeProviderRegistrySettings {
  defaultProviderId?: string
  defaultModelId?: string
  fallbackModelRefs: Array<{ providerId: string; modelId: string }>
  titleModelRef?: { providerId: string; modelId: string }
  embeddingModelRef?: { providerId: string; modelId: string }
  observationVisionModelRef?: { providerId: string; modelId: string }
  observationReactionModelRef?: { providerId: string; modelId: string }
  streaming: boolean
}

export interface BridgeProviderRegistryConfig {
  version: 1
  sources: BridgeProviderRegistrySource[]
  models: BridgeProviderRegistryModel[]
  settings: BridgeProviderRegistrySettings
}

export interface BridgeProviderRegistryOperationError {
  code: string
  message: string
  path?: string
  recoverable: boolean
  issues?: Array<{ path: string; message: string; code?: string }>
}

export interface BridgeProviderRegistryStatus {
  path: string
  backupPath: string
  exists: boolean
  backupExists: boolean
  loaded: boolean
  version?: 1
  recoverable: boolean
  error?: BridgeProviderRegistryOperationError
}

export type BridgeProviderRegistryChangeReason =
  | 'load'
  | 'save'
  | 'delete'
  | 'refresh'
  | 'default'
  | 'fallback'
  | 'title'
  | 'embedding'
  | 'observation'

export interface BridgeProviderRegistrySelection {
  providerId?: string
  modelId?: string
}

export interface BridgeProviderRegistryLoadResponse {
  registry: BridgeProviderRegistryConfig
  status: BridgeProviderRegistryStatus
}

export interface BridgeProviderRegistryMutationResult extends BridgeProviderRegistryLoadResponse {
  ok?: boolean
  source?: BridgeProviderRegistrySource
  model?: BridgeProviderRegistryModel
  models?: BridgeProviderRegistryModel[]
  nextSelection?: BridgeProviderRegistrySelection
}

export interface BridgeProviderRegistryChangedEvent extends BridgeProviderRegistryLoadResponse {
  reason: BridgeProviderRegistryChangeReason
  nextSelection?: BridgeProviderRegistrySelection
}

export interface BridgeOpenAICodexOAuthStatus {
  providerId: string
  authenticated: boolean
  accountId?: string
  email?: string
  expires?: number
  updatedAt?: number
}

export interface BridgeUpsertProviderSourceRequest {
  source: BridgeProviderRegistrySource
  credential?: {
    type: 'api-key' | 'bearer-token' | 'env'
    label: string
    value?: string
    envVar?: string
  }
}

export interface BridgeUpsertProviderModelRequest {
  providerId: string
  model: BridgeProviderRegistryModel
}

export interface BridgeDeleteProviderSourceRequest {
  providerId: string
}

export interface BridgeDeleteProviderModelRequest {
  providerId: string
  modelId: string
}

export interface BridgeSetDefaultProviderModelRequest {
  providerId?: string
  modelId?: string
}

export interface BridgeSetFallbackProviderModelsRequest {
  models: Array<{ providerId: string; modelId: string }>
}

export interface BridgeSetTitleProviderModelRequest {
  providerId?: string
  modelId?: string
}

export interface BridgeSetEmbeddingProviderModelRequest {
  providerId?: string
  modelId?: string
}

export interface BridgeSetObservationProviderModelsRequest {
  observationVisionModelRef?: { providerId: string; modelId: string }
  observationReactionModelRef?: { providerId: string; modelId: string }
}

export interface BridgeManagedToolInfo {
  name: string
  providerName?: string
  label?: string
  description: string
  parameters: Record<string, unknown>
  risk: string
  profiles: string[]
  source: string
  serverId?: string
  serverName?: string
  discoveryStatus?: string
  error?: string
  enabled: boolean
  readonly?: boolean
}

export type BridgeMcpServerTransportType = 'stdio' | 'http'
export type BridgeMcpDiscoveryStatus = 'idle' | 'refreshing' | 'available' | 'error' | 'disabled'

export interface BridgeMcpStdioTransportConfig {
  type: 'stdio'
  command: string
  args: string[]
  cwd?: string
  env: Record<string, string>
}

export interface BridgeMcpHttpTransportConfig {
  type: 'http'
  url: string
  headers: Record<string, string>
}

export type BridgeMcpServerTransportConfig =
  | BridgeMcpStdioTransportConfig
  | BridgeMcpHttpTransportConfig

export interface BridgeMcpSafeStdioTransport {
  type: 'stdio'
  command: string
  args: string[]
  cwd?: string
  envKeys: string[]
  localExecution: true
}

export interface BridgeMcpSafeHttpTransport {
  type: 'http'
  url: string
  headerKeys: string[]
}

export type BridgeMcpSafeTransport = BridgeMcpSafeStdioTransport | BridgeMcpSafeHttpTransport

export interface BridgeMcpDiscoveredToolSummary {
  name: string
  providerName: string
  label?: string
  description: string
  parameters: Record<string, unknown>
  risk: string
  profiles: string[]
  source: 'mcp'
  serverId: string
  serverName: string
  enabled: boolean
}

export interface BridgeMcpServerSummary {
  id: string
  name: string
  enabled: boolean
  transport: BridgeMcpSafeTransport
  timeoutMs: number
  toolTimeoutMs: number
  status: BridgeMcpDiscoveryStatus
  error?: string
  tools: BridgeMcpDiscoveredToolSummary[]
  createdAt: number
  updatedAt: number
}

export interface BridgeMcpRegistryStatus {
  path: string
  backupPath: string
  exists: boolean
  backupExists: boolean
  loaded: boolean
  version?: 1
  recoverable: boolean
  error?: {
    code: string
    message: string
    path?: string
    recoverable: boolean
    issues?: Array<{ path: string; message: string; code?: string }>
  }
}

export interface BridgeSaveMcpServerRequest {
  server: {
    id?: string
    name: string
    enabled?: boolean
    transport: BridgeMcpServerTransportConfig
    timeoutMs?: number
    toolTimeoutMs?: number
  }
}

export interface BridgeMcpServerListResponse {
  servers: BridgeMcpServerSummary[]
  status: BridgeMcpRegistryStatus
}

export interface BridgeMcpToolInventoryResponse {
  tools: BridgeMcpDiscoveredToolSummary[]
  servers: BridgeMcpServerSummary[]
}

export interface BridgeMcpChangedEvent {
  reason: 'load' | 'save' | 'delete' | 'enable' | 'refresh'
  servers: BridgeMcpServerSummary[]
  status: BridgeMcpRegistryStatus
}

export type BridgeSkillStatus = 'available' | 'invalid' | 'missing'

export interface BridgeSkillOperationError {
  code: string
  message: string
  path?: string
  recoverable: boolean
  issues?: Array<{ path: string; message: string; code?: string }>
}

export interface BridgeSkillStateStatus {
  path: string
  backupPath: string
  exists: boolean
  backupExists: boolean
  loaded: boolean
  version?: 1
  recoverable: boolean
  error?: BridgeSkillOperationError
}

export interface BridgeLocalSkillSummary {
  id: string
  name: string
  description: string
  source: 'local'
  status: BridgeSkillStatus
  enabled: boolean
  rootName: string
  relativePath: string
  metadata: Record<string, string | undefined>
  compatibility?: string
  error?: string
  updatedAt?: number
}

export interface BridgeSkillListResponse {
  skills: BridgeLocalSkillSummary[]
  status: BridgeSkillStateStatus
  rootPath?: string
}

export interface BridgeImportSkillRequest {
  fileName: string
  bytes: ArrayBuffer | Uint8Array
  overwrite?: boolean
  skillNameHint?: string
}

export interface BridgeImportSkillResponse {
  imported: BridgeLocalSkillSummary[]
  skills: BridgeLocalSkillSummary[]
  status: BridgeSkillStateStatus
}

export interface BridgeSkillChangedEvent {
  reason: 'load' | 'refresh' | 'enable' | 'import'
  skills: BridgeLocalSkillSummary[]
  status: BridgeSkillStateStatus
}

export type BridgeRuntime = 'electron' | 'fallback'

export const fallbackBridgePersistenceMessage =
  '当前未连接 Electron 主进程，本地配置不会写入磁盘。请在 Electron 窗口中操作。'

function rejectFallbackPersistence<T>(operation: string): Promise<T> {
  return Promise.reject(new Error(`${fallbackBridgePersistenceMessage} (${operation})`))
}

let fallbackCatVisible = false
let fallbackCatState: CatWindowState = 'hidden'
let fallbackCatPanelVisible = false
let fallbackCatPanelSide: CatPanelPlacement['side'] | null = null
let fallbackActiveCatSessionId: string | undefined
const fallbackCatDrafts = new Map<string, CatDraftState>()

function fallbackCatStatus(extra: Partial<CatStatus> = {}): CatStatus {
  return {
    state: fallbackCatState,
    visible: fallbackCatVisible,
    bounds: null,
    panelVisible: fallbackCatPanelVisible,
    panelSide: fallbackCatPanelSide,
    ...extra,
  }
}

function fallbackCatAppearance(now = Date.now()): CatAppearanceResolvedPack {
  return {
    id: 'builtin',
    name: 'OmniPaw Cat',
    description: 'Built-in OmniPaw cat appearance.',
    source: 'builtin',
    status: 'available',
    active: true,
    assets: {},
    durations: {
      appearing: 1000,
      dragTransition: 1100,
      preparing: 1050,
      completedEnd: 980,
      completedFinish: 1500,
    },
    layout: {
      scale: 86 / 116,
      offsetX: 0,
      offsetY: 0,
    },
    version: 'builtin',
    updatedAt: now,
  }
}

function fallbackCatPetState(): CatPetState {
  const moodScore = CAT_PET_MOOD_DEFAULT
  return {
    affection: CAT_PET_AFFECTION_DEFAULT,
    affectionMax: CAT_PET_AFFECTION_MAX,
    affectionMin: CAT_PET_AFFECTION_MIN,
    mood: moodFromScore(moodScore, CAT_PET_AFFECTION_DEFAULT),
    moodScore,
    moodMax: CAT_PET_MOOD_MAX,
    moodMin: CAT_PET_MOOD_MIN,
    todayUsage: emptyCatPetActionCounters(),
    limits: { ...CAT_PET_DAILY_LIMITS },
    interactions: fallbackCatPetInteractions(),
    interactionConfigs: defaultCatPetInteractionConfigs(),
    gifts: [],
    giftConfigs: defaultCatPetGiftConfigs(),
    unlockedGifts: [],
    launchCount: 0,
  }
}

function fallbackCatPetInteractions(): CatPetInteractionDefinition[] {
  const configs = new Map(defaultCatPetInteractionConfigs().map((item) => [item.id, item]))
  return CAT_PET_ACTIONS.map((id) => {
    const config = configs.get(id)
    const unlockAffection = id === 'custom_100' ? 100 : id === 'custom_150' ? 150 : 0
    return {
      id,
      enabled: true,
      unlocked: CAT_PET_AFFECTION_DEFAULT >= unlockAffection,
      customizable: id.startsWith('custom_'),
      unlockAffection,
      dailyLimit: CAT_PET_DAILY_LIMITS[id],
      positive: id === 'custom_150' ? { affection: 9, mood: 18 } : { affection: 2, mood: 8 },
      negative: id === 'custom_150' ? { affection: -5, mood: -25 } : { affection: -1, mood: -5 },
      positiveProbability: id === 'custom_150' ? 0.48 : 0.85,
      label: config?.label ?? id,
      description: config?.description,
      feedback: {
        positive: config?.positiveFeedback ?? config?.label ?? id,
        negative: config?.negativeFeedback ?? config?.label ?? id,
      },
    }
  })
}

function fallbackCatAppearanceList(): CatAppearanceListResponse {
  const now = Date.now()
  const current = fallbackCatAppearance(now)
  return {
    packs: [current],
    current,
    activePackId: current.id,
    updatedAt: now,
  }
}

function emptyProviderRegistryStatus(): BridgeProviderRegistryStatus {
  return {
    path: '',
    backupPath: '',
    exists: false,
    backupExists: false,
    loaded: true,
    version: 2,
    recoverable: false,
  }
}

function emptyProviderRegistry(): BridgeProviderRegistryConfig {
  return {
    version: 1,
    sources: [],
    models: [],
    settings: {
      defaultModelId: '',
      fallbackModelRefs: [],
      titleModelRef: undefined,
      embeddingModelRef: undefined,
      observationVisionModelRef: undefined,
      observationReactionModelRef: undefined,
      streaming: true,
    },
  }
}

function stripProviderRegistryFromSettingsRequest(
  request: { config: BridgeDesktopSettingsConfig } | BridgeDesktopSettingsConfig
): { config: BridgeDesktopSettingsConfig } | BridgeDesktopSettingsConfig {
  const config = 'config' in request ? request.config : request
  const { providers: _providers, ...rest } = config as BridgeDesktopSettingsConfig & {
    providers?: unknown
  }

  return 'config' in request
    ? ({ config: rest as BridgeDesktopSettingsConfig } as { config: BridgeDesktopSettingsConfig })
    : (rest as BridgeDesktopSettingsConfig)
}

const fallbackBridge: OmniPawBridge = {
  app: {
    getInfo: async () => ({
      name: 'OmniPaw',
      version: '0.1.1',
      buildTime: __BUILD_TIME__,
      commit: __GIT_COMMIT__,
      isPackaged: false,
      omniInferPackaged: __OMNIINFER_PACKAGED__,
      platform: 'win32',
    }),
    openSettingsDirectory: async () => ({
      opened: false,
    }),
    openChatSession: async () => {},
    onOpenChatSession: () => () => {},
  },
  window: {
    getState: async () => ({
      platform: 'win32',
      isMaximized: false,
      isMaximizable: true,
    }),
    minimize: async () => ({
      platform: 'win32',
      isMaximized: false,
      isMaximizable: true,
    }),
    toggleMaximize: async () => ({
      platform: 'win32',
      isMaximized: false,
      isMaximizable: true,
    }),
    close: async () => {},
    onStateChanged: () => () => {},
  },
  logging: {
    write: async () => ({
      accepted: false,
      persisted: false,
      dropped: true,
      reason: 'fallback_runtime',
    }),
    status: async () => {
      const now = Date.now()
      return {
        initialized: false,
        available: false,
        runtime: 'fallback',
        transport: 'none',
        writeCount: 0,
        droppedCount: 0,
        failedWriteCount: 0,
        startedAt: now,
        updatedAt: now,
      }
    },
    openLocation: async () => ({
      opened: false,
    }),
    export: async () => ({
      exported: false,
      reason: 'unavailable',
    }),
  },
  cat: {
    show: async () => {
      fallbackCatVisible = true
      if (fallbackCatState === 'hidden') {
        fallbackCatState = 'idle'
      }
      return fallbackCatStatus()
    },
    hide: async () => {
      fallbackCatVisible = false
      fallbackCatState = 'hidden'
      fallbackCatPanelVisible = false
      fallbackCatPanelSide = null
      return fallbackCatStatus()
    },
    toggleVisibility: async () => {
      if (fallbackCatVisible) {
        fallbackCatVisible = false
        fallbackCatState = 'hidden'
        fallbackCatPanelVisible = false
        fallbackCatPanelSide = null
        return fallbackCatStatus()
      }

      fallbackCatVisible = true
      if (fallbackCatState === 'hidden') {
        fallbackCatState = 'idle'
      }
      return fallbackCatStatus()
    },
    setState: async (state) => {
      fallbackCatVisible = true
      fallbackCatState = state
      return fallbackCatStatus()
    },
    reportState: (state) => {
      fallbackCatState = state
      fallbackCatVisible = state !== 'hidden'
    },
    onCommand: () => () => {},
    togglePanel: async () => {
      fallbackCatPanelVisible = !fallbackCatPanelVisible
      fallbackCatPanelSide = fallbackCatPanelVisible ? 'right' : null
      return {
        visible: fallbackCatPanelVisible,
        side: fallbackCatPanelSide || undefined,
      }
    },
    dragStart: async () => null,
    dragMove: async () => null,
    dragEnd: async () => null,
    setHitArea: async () => {},
    setInteractionState: async () => {},
    onObservationReaction: () => () => {},
    openObservationSource: async (event) => {
      fallbackActiveCatSessionId = event.catSessionId
      fallbackCatPanelVisible = true
      fallbackCatPanelSide = 'right'
    },
    showBubble: async (request) => {
      const text = typeof request === 'string' ? request : request.text
      if (!text.trim()) {
        return null
      }
      return {
        id:
          typeof request === 'string'
            ? `fallback:${Date.now()}`
            : request.id || `fallback:${Date.now()}`,
        text,
        kind:
          typeof request === 'string'
            ? 'status'
            : request.kind || (request.gift ? 'gift' : 'status'),
        visible: true,
        ...(typeof request === 'string'
          ? {}
          : {
              ...(request.observationReaction
                ? { observationReaction: request.observationReaction }
                : {}),
              ...(request.gift ? { gift: request.gift } : {}),
              ...(request.autoDismissMs ? { autoDismissMs: request.autoDismissMs } : {}),
              ...(request.source ? { source: request.source } : {}),
            }),
        createdAt: Date.now(),
      }
    },
    dismissBubble: async () => {},
    reportBubbleReady: () => {},
    onBubbleEvent: () => () => {},
    onBubblePlacement: () => () => {},
  },
  catAppearance: {
    current: async () => fallbackCatAppearance(),
    getPack: async () => fallbackCatAppearance(),
    list: async () => fallbackCatAppearanceList(),
    refresh: async () => fallbackCatAppearanceList(),
    importPack: () =>
      rejectFallbackPersistence<CatAppearanceImportResponse>('catAppearance.importPack'),
    deletePack: () =>
      rejectFallbackPersistence<CatAppearanceDeleteResponse>('catAppearance.deletePack'),
    setActive: async () => fallbackCatAppearance(),
    onChanged: () => () => {},
  },
  catPanel: {
    onPlacement: () => () => {},
    open: async (request) => {
      fallbackCatPanelVisible = true
      fallbackCatPanelSide = 'right'
      fallbackActiveCatSessionId = request?.sessionId || fallbackActiveCatSessionId
      return {
        visible: true,
        side: fallbackCatPanelSide,
      }
    },
    getActiveSession: async () => ({
      sessionId: fallbackActiveCatSessionId,
      updatedAt: Date.now(),
    }),
    setActiveSession: async (request) => {
      fallbackActiveCatSessionId = typeof request === 'string' ? request : request.sessionId
      return {
        sessionId: fallbackActiveCatSessionId,
        updatedAt: Date.now(),
      }
    },
    onActiveSessionChanged: () => () => {},
    getDraft: async (request) => {
      const sessionId =
        typeof request === 'string' ? request : request?.sessionId || fallbackActiveCatSessionId
      return sessionId ? fallbackCatDrafts.get(sessionId) || null : null
    },
    stageDraftAttachments: async (request) => {
      const previous = fallbackCatDrafts.get(request.sessionId)
      const draft = {
        sessionId: request.sessionId,
        attachments: [...(previous?.attachments || []), ...request.attachments],
        updatedAt: Date.now(),
      }
      fallbackCatDrafts.set(request.sessionId, draft)
      return draft
    },
    clearDraft: async (request) => {
      const sessionId = typeof request === 'string' ? request : request.sessionId
      const attachmentIds =
        typeof request === 'string' ? undefined : new Set(request.attachmentIds || [])
      const previous = fallbackCatDrafts.get(sessionId)
      if (!previous) return null
      if (!attachmentIds?.size) {
        fallbackCatDrafts.delete(sessionId)
        return { ...previous, attachments: [], updatedAt: Date.now() }
      }
      const draft = {
        ...previous,
        attachments: previous.attachments.filter((item) => !attachmentIds.has(item.attachmentId)),
        updatedAt: Date.now(),
      }
      fallbackCatDrafts.set(sessionId, draft)
      return draft
    },
    onDraftChanged: () => () => {},
  },
  catNotification: {
    onEvent: () => () => {},
    close: async () => {},
    viewResult: async (request) => {
      const sessionId = typeof request === 'string' ? undefined : request.sessionId
      if (sessionId) {
        fallbackActiveCatSessionId = sessionId
        fallbackCatPanelVisible = true
        fallbackCatPanelSide = 'right'
      }
    },
  },
  catPet: {
    getState: async () => fallbackCatPetState(),
    getInventory: async (request): Promise<CatPetInventoryResponse> => ({
      roleId: request.roleId,
      unlockedGifts: [],
    }),
    perform: async () => ({ ok: false, reason: 'daily_limit', state: fallbackCatPetState() }),
    updateInteractions: () =>
      rejectFallbackPersistence<CatPetUpdateInteractionsResponse>('catPet.updateInteractions'),
    onChanged: () => () => {},
  },
  settings: {
    load: async () => fallbackSettingsConfig(),
    save: () => rejectFallbackPersistence<BridgeDesktopSettingsConfig>('settings.save'),
    reset: () => rejectFallbackPersistence<BridgeDesktopSettingsConfig>('settings.reset'),
    pickBackgroundImage: () =>
      rejectFallbackPersistence<BridgePickDesktopBackgroundImageResponse>(
        'settings.pickBackgroundImage'
      ),
    status: async () => ({
      path: '',
      backupPath: '',
      exists: false,
      backupExists: false,
      loaded: true,
      version: 1,
      recoverable: false,
    }),
    onChanged: () => () => {},
  },
  shortcuts: {
    status: async () => fallbackShortcutStatus(),
    setCaptureMode: async () => fallbackShortcutStatus(),
    onChanged: () => () => {},
  },
  memory: {
    list: async () => ({ items: [], total: 0 }),
    search: async () => ({ items: [], total: 0 }),
    inspect: async () => null,
    create: () => rejectFallbackPersistence<CompanionMemoryItem>('memory.create'),
    update: () => rejectFallbackPersistence<CompanionMemoryItem | null>('memory.update'),
    archive: () => rejectFallbackPersistence<CompanionMemoryItem | null>('memory.archive'),
    delete: () => rejectFallbackPersistence<{ deleted: boolean }>('memory.delete'),
    setImportance: () =>
      rejectFallbackPersistence<CompanionMemoryItem | null>('memory.setImportance'),
    listProposals: async () => ({ items: [], total: 0 }),
    updateProposal: () =>
      rejectFallbackPersistence<CompanionMemoryMaintenanceProposal | null>('memory.updateProposal'),
    getSettings: async () => fallbackSettingsConfig().app.memory,
    updateSettings: () => rejectFallbackPersistence<DesktopMemorySettings>('memory.updateSettings'),
  },
  companionRole: {
    importCard: () =>
      rejectFallbackPersistence<ImportCompanionRoleCardResponse>('companionRole.importCard'),
    exportCard: () =>
      rejectFallbackPersistence<ExportCompanionRoleCardResponse>('companionRole.exportCard'),
  },
  observation: {
    permissionStatus: async () => ({
      platform: 'fallback',
      screen: 'unsupported',
      canPrompt: false,
      message: 'Observation is only available in the Electron runtime.',
    }),
    status: async () => ({
      activeRuns: [],
      permission: {
        platform: 'fallback',
        screen: 'unsupported',
        canPrompt: false,
        message: 'Observation is only available in the Electron runtime.',
      },
      updatedAt: Date.now(),
    }),
    start: () => rejectFallbackPersistence<ObservationState>('observation.start'),
    stop: () => rejectFallbackPersistence<ObservationState>('observation.stop'),
    trigger: () => rejectFallbackPersistence<ObservationState>('observation.trigger'),
    onChanged: () => () => {},
    onNotification: () => () => {},
  },
  chat: {
    listSessions: async (request) => {
      const now = Date.now()
      const chatSession: BridgeChatSession = {
        id: 'welcome',
        title: '默认会话',
        kind: 'chat',
        status: 'active',
        defaultProviderId: 'omniinfer-local',
        defaultModelId: 'local-small-model',
        createdAt: now,
        updatedAt: now,
      }
      const catSession: BridgeChatSession = {
        id: fallbackActiveCatSessionId || 'fallback-cat',
        title: '小猫会话',
        kind: 'cat',
        status: 'active',
        defaultProviderId: 'omniinfer-local',
        defaultModelId: 'local-small-model',
        createdAt: now,
        updatedAt: now,
      }
      const visionSession: BridgeChatSession = {
        id: 'fallback-vision',
        title: '主动视觉',
        kind: 'vision',
        status: 'active',
        defaultProviderId: 'omniinfer-local',
        defaultModelId: 'local-small-model',
        createdAt: now,
        updatedAt: now,
      }
      if (request?.kind === 'cat') return [catSession]
      if (request?.kind === 'cron') return []
      if (request?.kind === 'vision') return [visionSession]
      if (request?.kind === 'all') return [chatSession, catSession, visionSession]
      return [chatSession]
    },
    getSession: async (sessionId) =>
      (await fallbackBridge.chat.listSessions({ kind: 'all' })).find(
        (session) => session.id === sessionId
      ) ?? null,
    createSession: async (request) => {
      const now = Date.now()

      return {
        id: crypto.randomUUID(),
        title:
          request?.title ||
          (request?.kind === 'cat'
            ? '小猫会话'
            : request?.kind === 'vision'
              ? '主动视觉'
              : '新会话'),
        kind: request?.kind === 'cat' || request?.kind === 'vision' ? request.kind : 'chat',
        status: 'active',
        defaultProviderId: request?.providerId || 'omniinfer-local',
        defaultModelId: request?.modelId || 'local-small-model',
        createdAt: now,
        updatedAt: now,
      }
    },
    updateSession: async (sessionId, patch) => ({
      id: sessionId,
      title: patch.title || '新会话',
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...patch,
    }),
    updateSessionTitle: async (sessionId, title) => ({
      id: sessionId,
      title,
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
    deleteSession: async () => ({ deleted: true }),
    listMessages: async () => [],
    sendMessage: async () => ({
      runId: crypto.randomUUID(),
      userMessageId: crypto.randomUUID(),
      assistantMessageId: crypto.randomUUID(),
      messageId: crypto.randomUUID(),
      accepted: true,
    }),
    abortRun: async () => {},
    approveToolCall: () =>
      rejectFallbackPersistence<BridgeToolApprovalResponse>('chat.approveToolCall'),
    editMessage: async () => ({ needsRegenerate: true, truncatedAfterMessage: true }),
    regenerateMessage: async () => ({
      runId: crypto.randomUUID(),
      assistantMessageId: crypto.randomUUID(),
      accepted: true,
    }),
    onSessionChanged: () => () => {},
    onStreamEvent: () => () => {},
    onToken: () => () => {},
    onDone: () => () => {},
  },
  attachment: {
    upload: async ({ name, type, size }) => ({
      id: crypto.randomUUID(),
      kind: type.startsWith('image/')
        ? 'image'
        : type.startsWith('audio/')
          ? 'audio'
          : type.startsWith('video/')
            ? 'video'
            : 'file',
      originalName: name,
      filename: name,
      mimeType: type,
      sizeBytes: size,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
    getPreviewUrl: async () => '',
  },
  provider: {
    load: async () => ({
      registry: emptyProviderRegistry(),
      status: emptyProviderRegistryStatus(),
    }),
    status: async () => emptyProviderRegistryStatus(),
    list: async () => [],
    listPresets: async () => [
      {
        id: 'openai-compatible',
        name: 'OpenAI Compatible',
        type: 'openai-compatible',
        api: 'openai-chat-completions',
        baseUrl: 'https://api.openai.com/v1',
        description: 'OpenAI API and compatible services.',
      },
      {
        id: 'anthropic-compatible',
        name: 'Anthropic Compatible',
        type: 'anthropic-compatible',
        api: 'anthropic-messages',
        baseUrl: 'https://api.anthropic.com/v1',
        authHeader: 'x-api-key',
        description: 'Anthropic Messages API and compatible services.',
      },
      {
        id: 'openai-codex',
        name: 'OpenAI Codex OAuth',
        type: 'openai-codex',
        api: 'openai-codex-responses',
        baseUrl: 'https://chatgpt.com/backend-api',
        description: 'ChatGPT/Codex OAuth provider backed by OpenAI Codex Responses.',
      },
      {
        id: 'ollama',
        name: 'Ollama',
        type: 'ollama',
        api: 'ollama',
        baseUrl: 'http://localhost:11434/v1',
        description: 'Local Ollama OpenAI-compatible endpoint.',
      },
      {
        id: 'omniinfer-local',
        name: 'OmniInfer Local',
        type: 'omniinfer',
        api: 'omniinfer',
        baseUrl: 'http://localhost:11434/v1',
        description: 'Local OmniInfer-compatible model service.',
      },
    ],
    createFromPreset: () =>
      rejectFallbackPersistence<BridgeProviderConfig>('provider.createFromPreset'),
    upsertSource: () =>
      rejectFallbackPersistence<BridgeProviderRegistryMutationResult>('provider.upsertSource'),
    upsertModel: () =>
      rejectFallbackPersistence<BridgeProviderRegistryMutationResult>('provider.upsertModel'),
    upsert: () => rejectFallbackPersistence<BridgeProviderConfig>('provider.upsert'),
    deleteSource: () =>
      rejectFallbackPersistence<BridgeProviderRegistryMutationResult>('provider.deleteSource'),
    deleteModel: () =>
      rejectFallbackPersistence<BridgeProviderRegistryMutationResult>('provider.deleteModel'),
    delete: () => rejectFallbackPersistence<{ ok?: boolean; error?: unknown }>('provider.delete'),
    setDefaultModel: () =>
      rejectFallbackPersistence<BridgeProviderRegistryMutationResult>('provider.setDefaultModel'),
    setFallbackModels: () =>
      rejectFallbackPersistence<BridgeProviderRegistryMutationResult>('provider.setFallbackModels'),
    setTitleModel: () =>
      rejectFallbackPersistence<BridgeProviderRegistryMutationResult>('provider.setTitleModel'),
    setEmbeddingModel: () =>
      rejectFallbackPersistence<BridgeProviderRegistryMutationResult>('provider.setEmbeddingModel'),
    setObservationModels: () =>
      rejectFallbackPersistence<BridgeProviderRegistryMutationResult>(
        'provider.setObservationModels'
      ),
    listModels: async () => [],
    refreshModels: () => rejectFallbackPersistence<BridgeProviderModel[]>('provider.refreshModels'),
    test: () => rejectFallbackPersistence<{ ok: boolean; error?: unknown }>('provider.test'),
    setSessionModel: () => rejectFallbackPersistence<BridgeChatSession>('provider.setSessionModel'),
    openAICodexOAuthStatus: async (request) => ({
      providerId: typeof request === 'string' ? request : request.providerId,
      authenticated: false,
    }),
    openAICodexOAuthLogin: () =>
      rejectFallbackPersistence<BridgeOpenAICodexOAuthStatus>('provider.openAICodexOAuthLogin'),
    openAICodexOAuthLogout: () =>
      rejectFallbackPersistence<BridgeOpenAICodexOAuthStatus>('provider.openAICodexOAuthLogout'),
    onChanged: () => () => {},
  },
  skill: {
    list: async () => ({
      skills: [],
      status: {
        path: '',
        backupPath: '',
        exists: false,
        backupExists: false,
        loaded: true,
        version: 1,
        recoverable: false,
      },
    }),
    refresh: () => rejectFallbackPersistence<BridgeSkillListResponse>('skill.refresh'),
    setEnabled: () => rejectFallbackPersistence<BridgeLocalSkillSummary>('skill.setEnabled'),
    importSkill: () => rejectFallbackPersistence<BridgeImportSkillResponse>('skill.importSkill'),
    onChanged: () => () => {},
  },
  cron: {
    list: async () => ({ tasks: [] }),
    create: () => rejectFallbackPersistence<CreateCronTaskResponse>('cron.create'),
    update: () => rejectFallbackPersistence<UpdateCronTaskResponse>('cron.update'),
    delete: () => rejectFallbackPersistence<DeleteCronTaskResponse>('cron.delete'),
    runNow: () => rejectFallbackPersistence<RunCronTaskNowResponse>('cron.runNow'),
    listRuns: async () => ({ runs: [] }),
    onChanged: () => () => {},
  },
  tools: {
    list: async () => [
      {
        name: 'system_time',
        label: 'System time',
        description: 'Get the current local time, timezone, and UTC offset.',
        parameters: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        risk: 'safe',
        profiles: ['minimal', 'assistant', 'power'],
        source: 'builtin',
        enabled: true,
      },
    ],
    setEnabled: () =>
      rejectFallbackPersistence<{ tool: BridgeManagedToolInfo; tools: BridgeManagedToolInfo[] }>(
        'tools.setEnabled'
      ),
  },
  workspace: {
    status: () => rejectFallbackPersistence<AgentWorkspaceStatus>('workspace.status'),
    listFiles: () => rejectFallbackPersistence<ListWorkspaceFilesResponse>('workspace.listFiles'),
    readFile: () => rejectFallbackPersistence<ReadWorkspaceFileResponse>('workspace.readFile'),
    exportFile: () =>
      rejectFallbackPersistence<ExportWorkspaceFileResponse>('workspace.exportFile'),
    revealFile: () =>
      rejectFallbackPersistence<RevealWorkspaceFileResponse>('workspace.revealFile'),
    deleteFile: () =>
      rejectFallbackPersistence<DeleteWorkspaceFileResponse>('workspace.deleteFile'),
    cleanup: () => rejectFallbackPersistence<CleanupWorkspaceResponse>('workspace.cleanup'),
  },
  terminalProcess: {
    list: async () => [],
    get: async () => null,
    kill: () => rejectFallbackPersistence<KillLocalProcessResponse>('terminalProcess.kill'),
  },
  omniinfer: {
    getStatus: async () => ({
      process: {
        state: 'not_bundled',
        lastUpdatedAt: 0,
      },
      server: {
        online: false,
        baseUrl: 'http://127.0.0.1:19157',
        host: '127.0.0.1',
        port: 19157,
        lastCheckedAt: 0,
      },
      loadedModel: null,
      thinking: false,
      backends: [],
      externallyManaged: false,
    }),
    start: () => rejectFallbackPersistence<OmniInferRuntimeSnapshot>('omniinfer.start'),
    stop: () => rejectFallbackPersistence<OmniInferRuntimeSnapshot>('omniinfer.stop'),
    selectModel: () => rejectFallbackPersistence<OmniInferRuntimeSnapshot>('omniinfer.selectModel'),
    unloadModel: () => rejectFallbackPersistence<OmniInferRuntimeSnapshot>('omniinfer.unloadModel'),
    setThinking: () => rejectFallbackPersistence<OmniInferRuntimeSnapshot>('omniinfer.setThinking'),
    getLogsPath: async () => ({ path: '', exists: false }),
    pickLocalGguf: () =>
      rejectFallbackPersistence<PickLocalGgufResponse>('omniinfer.pickLocalGguf'),
    pickInstallDir: () =>
      rejectFallbackPersistence<PickOmniInferInstallDirResponse>('omniinfer.pickInstallDir'),
    rescanModels: async () => ({ models: [], modelsDir: '' }),
    listInstalledModels: async () => [],
    onStatusChanged: () => () => {},
    onLog: () => () => {},
  },
  mcp: {
    listServers: async () => ({
      servers: [],
      status: {
        path: '',
        backupPath: '',
        exists: false,
        backupExists: false,
        loaded: true,
        version: 1,
        recoverable: false,
      },
    }),
    saveServer: () => rejectFallbackPersistence<BridgeMcpServerSummary>('mcp.saveServer'),
    deleteServer: () => rejectFallbackPersistence<BridgeMcpServerListResponse>('mcp.deleteServer'),
    setServerEnabled: () =>
      rejectFallbackPersistence<BridgeMcpServerSummary>('mcp.setServerEnabled'),
    refreshServer: () =>
      rejectFallbackPersistence<BridgeMcpServerListResponse>('mcp.refreshServer'),
    listTools: async () => ({ tools: [], servers: [] }),
    onChanged: () => () => {},
  },
}

function fallbackShortcutStatus(): BridgeShortcutStatusChangedEvent {
  const config = fallbackSettingsConfig()
  const updatedAt = Date.now()
  return {
    statuses: SHORTCUT_ACTIONS.map((action) => {
      const binding = config.app.shortcuts.bindings[action]
      return {
        action,
        enabled: true,
        accelerator: binding.accelerator,
        state: 'disabled',
        message: '快捷键仅在 Electron 桌面端可用。',
        updatedAt,
      }
    }),
  }
}

function fallbackCompanionRole(): BridgeDesktopSettingsConfig['app']['companionRoles'][number] {
  return {
    id: FALLBACK_COMPANION_ROLE_ID,
    name: '小万',
    introduction: '你最好的桌面伙伴',
    avatar: {
      source: 'appearance-idle',
    },
    appearancePackId: 'builtin',
    userNickname: '',
    personality: '温柔、可靠、带一点轻松感',
    speechStyle: '简短、自然、日常感',
    relationship: '桌面伙伴',
    background: '',
    proactiveStyle: '适度主动提醒，但不打扰用户专注。',
    advanced: {
      enabled: false,
      systemPrompt: '',
      exampleDialogue: '',
      finalInstructions: '',
    },
    petInteractions: defaultCatPetInteractionConfigs(),
    petGifts: defaultCatPetGiftConfigs(),
    knowledgeSettings: {
      scanDepth: 8,
      maxTokens: 900,
    },
    knowledgeEntries: [],
    source: undefined,
    defaultProviderId: undefined,
    defaultModelId: undefined,
  }
}

function fallbackSettingsConfig(): BridgeDesktopSettingsConfig {
  return {
    version: 1,
    app: {
      language: 'system',
      theme: 'system',
      initialized: false,
      minimizeToTrayOnStartup: false,
      welcomeTitle: '',
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
      systemContext: {
        baseSystemPrompt: '',
        mask: {
          enabled: false,
          label: 'Mask',
          text: '',
        },
      },
      companionRoles: [fallbackCompanionRole()],
      activeCompanionRoleId: FALLBACK_COMPANION_ROLE_ID,
      background: {
        enabled: false,
        opacity: 0.35,
        blur: 0,
        image: undefined,
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
}

const exposedBridge = typeof window === 'undefined' ? undefined : window.omniPaw

export const bridgeRuntime: BridgeRuntime = exposedBridge ? 'electron' : 'fallback'
export const isFallbackBridge = bridgeRuntime === 'fallback'

function createAppBridge(bridge: OmniPawBridge['app'] | undefined): OmniPawBridge['app'] {
  if (!bridge) {
    return fallbackBridge.app
  }

  return {
    ...fallbackBridge.app,
    ...bridge,
  }
}

function createWindowBridge(bridge: OmniPawBridge['window'] | undefined): OmniPawBridge['window'] {
  if (!bridge) {
    return fallbackBridge.window
  }

  return {
    ...fallbackBridge.window,
    ...bridge,
  }
}

function createCatBridge(bridge: OmniPawBridge['cat'] | undefined): OmniPawBridge['cat'] {
  if (!bridge) {
    return fallbackBridge.cat
  }

  return {
    ...fallbackBridge.cat,
    ...bridge,
  }
}

function createCatAppearanceBridge(
  bridge: OmniPawBridge['catAppearance'] | undefined
): OmniPawBridge['catAppearance'] {
  if (!bridge) {
    return fallbackBridge.catAppearance
  }

  return {
    ...fallbackBridge.catAppearance,
    ...bridge,
  }
}

function createCatPetBridge(bridge: OmniPawBridge['catPet'] | undefined): OmniPawBridge['catPet'] {
  const fallbackCatPetBridge = fallbackBridge.catPet
  if (!bridge || !fallbackCatPetBridge) {
    return bridge ?? fallbackCatPetBridge
  }

  return {
    ...fallbackCatPetBridge,
    ...bridge,
  }
}

function createSettingsBridge(
  bridge: OmniPawBridge['settings'] | undefined
): OmniPawBridge['settings'] {
  if (!bridge) {
    return fallbackBridge.settings
  }

  return {
    ...fallbackBridge.settings,
    ...bridge,
    save: (request) => bridge.save(stripProviderRegistryFromSettingsRequest(request)),
  }
}

function createShortcutsBridge(
  bridge: OmniPawBridge['shortcuts'] | undefined
): OmniPawBridge['shortcuts'] {
  if (!bridge) {
    return fallbackBridge.shortcuts
  }

  return {
    ...fallbackBridge.shortcuts,
    ...bridge,
  }
}

function createMemoryBridge(bridge: OmniPawBridge['memory'] | undefined): OmniPawBridge['memory'] {
  if (!bridge) {
    return fallbackBridge.memory
  }

  return {
    ...fallbackBridge.memory,
    ...bridge,
  }
}

function createCompanionRoleBridge(
  bridge: OmniPawBridge['companionRole'] | undefined
): OmniPawBridge['companionRole'] {
  if (!bridge) {
    return fallbackBridge.companionRole
  }

  return {
    ...fallbackBridge.companionRole,
    ...bridge,
  }
}

function createProviderBridge(
  bridge: OmniPawBridge['provider'] | undefined
): OmniPawBridge['provider'] {
  if (!bridge) {
    return fallbackBridge.provider
  }

  return {
    ...fallbackBridge.provider,
    ...bridge,
    load: bridge.load ?? fallbackBridge.provider.load,
    status: bridge.status ?? fallbackBridge.provider.status,
    onChanged: bridge.onChanged ?? fallbackBridge.provider.onChanged,
  }
}

function createObservationBridge(
  bridge: OmniPawBridge['observation'] | undefined
): OmniPawBridge['observation'] {
  if (!bridge) {
    return fallbackBridge.observation
  }

  return {
    ...fallbackBridge.observation,
    ...bridge,
  }
}

function createLoggingBridge(
  bridge: OmniPawBridge['logging'] | undefined
): OmniPawBridge['logging'] {
  if (!bridge) {
    return fallbackBridge.logging
  }

  return {
    ...fallbackBridge.logging,
    ...bridge,
  }
}

function createCronBridge(bridge: OmniPawBridge['cron'] | undefined): OmniPawBridge['cron'] {
  if (!bridge) {
    return fallbackBridge.cron
  }

  return {
    ...fallbackBridge.cron,
    ...bridge,
    list: bridge.list ?? fallbackBridge.cron.list,
    listRuns: bridge.listRuns ?? fallbackBridge.cron.listRuns,
    onChanged: bridge.onChanged ?? fallbackBridge.cron.onChanged,
  }
}

function createOmniInferBridge(
  bridge: OmniPawBridge['omniinfer'] | undefined
): OmniPawBridge['omniinfer'] {
  if (!bridge) {
    return fallbackBridge.omniinfer
  }

  return {
    ...fallbackBridge.omniinfer,
    ...bridge,
  }
}

export const appBridge: OmniPawBridge = exposedBridge
  ? {
      ...fallbackBridge,
      ...exposedBridge,
      app: createAppBridge(exposedBridge.app),
      window: createWindowBridge(exposedBridge.window),
      cat: createCatBridge(exposedBridge.cat),
      catAppearance: createCatAppearanceBridge(exposedBridge.catAppearance),
      catPet: createCatPetBridge(exposedBridge.catPet),
      logging: createLoggingBridge(exposedBridge.logging),
      settings: createSettingsBridge(exposedBridge.settings),
      shortcuts: createShortcutsBridge(exposedBridge.shortcuts),
      memory: createMemoryBridge(exposedBridge.memory),
      companionRole: createCompanionRoleBridge(exposedBridge.companionRole),
      observation: createObservationBridge(exposedBridge.observation),
      provider: createProviderBridge(exposedBridge.provider),
      cron: createCronBridge(exposedBridge.cron),
      omniinfer: createOmniInferBridge(exposedBridge.omniinfer),
    }
  : fallbackBridge

export function ensureElectronBridge(operation = '该操作'): void {
  if (isFallbackBridge) {
    throw new Error(`${fallbackBridgePersistenceMessage} (${operation})`)
  }
}

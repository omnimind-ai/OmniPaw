import type { ToolProfile, ToolRisk } from '@shared/types/chat'
import type {
  McpErrorCode,
  McpHttpTransportConfig,
  McpOperationError,
  McpRegistryVersion,
  McpSafeTransport,
  McpServerRecord,
  McpServerRegistry,
  McpServerSummary,
  McpServerTransportConfig,
  McpStdioTransportConfig,
  McpValidationIssue,
} from '@shared/types/mcp'

export const MCP_REGISTRY_FILE_NAME = 'mcp_server.json'
export const CURRENT_MCP_REGISTRY_VERSION: McpRegistryVersion = 1
export const DEFAULT_MCP_SERVER_TIMEOUT_MS = 10_000
export const DEFAULT_MCP_TOOL_TIMEOUT_MS = 30_000
export const DEFAULT_MCP_TOOL_PROFILES: ToolProfile[] = ['assistant', 'power']

export const defaultMcpRegistry: McpServerRegistry = {
  version: CURRENT_MCP_REGISTRY_VERSION,
  servers: [],
}

export interface NormalizeMcpRegistryResult {
  registry: McpServerRegistry
  changed: boolean
}

export class McpValidationError extends Error {
  readonly details: McpOperationError

  constructor(details: McpOperationError) {
    super(details.message)
    this.name = 'McpValidationError'
    this.details = details
  }
}

export function cloneDefaultMcpRegistry(): McpServerRegistry {
  return cloneRegistry(defaultMcpRegistry)
}

export function cloneRegistry(registry: McpServerRegistry): McpServerRegistry {
  return structuredClone(registry)
}

export function normalizeMcpRegistry(raw: unknown): NormalizeMcpRegistryResult {
  const migrated = migrateRegistry(raw)
  const issues: McpValidationIssue[] = []
  const registry = normalizeRegistryShape(migrated, issues)
  validateRegistryShape(registry, issues)

  if (issues.length) {
    throwValidationError('invalid_registry', 'MCP server registry is invalid.', issues)
  }

  const normalized = sortRegistry(registry)
  return {
    registry: normalized,
    changed: stableComparable(normalized) !== stableComparable(raw),
  }
}

export function validateMcpRegistry(input: unknown): McpServerRegistry {
  const issues: McpValidationIssue[] = []

  if (!isPlainObject(input)) {
    throwValidationError('invalid_registry', 'MCP server registry is invalid.', [
      { path: '', message: 'Registry must be an object.', code: 'invalid_type' },
    ])
  }

  const registry = input as unknown as McpServerRegistry
  validateRegistryShape(registry, issues)
  if (issues.length) {
    throwValidationError('invalid_registry', 'MCP server registry is invalid.', issues)
  }
  return sortRegistry(registry)
}

export function serializeMcpRegistry(registry: McpServerRegistry): string {
  return `${JSON.stringify(validateMcpRegistry(registry), null, 2)}\n`
}

export function mcpError(
  code: McpErrorCode,
  message: string,
  options: {
    path?: string
    recoverable?: boolean
    issues?: McpValidationIssue[]
  } = {},
): McpOperationError {
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

export function maskMcpTransport(transport: McpServerTransportConfig): McpSafeTransport {
  if (transport.type === 'stdio') {
    return {
      type: 'stdio',
      command: transport.command,
      args: maskCommandArgs(transport.args),
      cwd: transport.cwd,
      envKeys: Object.keys(transport.env).sort(),
    }
  }

  return {
    type: 'http',
    url: maskUrl(transport.url),
    headerKeys: Object.keys(transport.headers).sort(),
  }
}

export function createMcpServerSummary(
  server: McpServerRecord,
  state: Pick<McpServerSummary, 'status' | 'tools'> & { error?: string },
): McpServerSummary {
  return {
    id: server.id,
    name: server.name,
    enabled: server.enabled,
    transport: maskMcpTransport(server.transport),
    timeoutMs: server.timeoutMs,
    toolTimeoutMs: server.toolTimeoutMs,
    status: server.enabled ? state.status : 'disabled',
    error: state.error ? redactSecretText(state.error) : undefined,
    tools: state.tools.map((tool) => ({ ...tool })),
    createdAt: server.createdAt,
    updatedAt: server.updatedAt,
  }
}

export function normalizeMcpServerRecord(raw: unknown, path = 'servers'): McpServerRecord {
  const issues: McpValidationIssue[] = []
  const server = normalizeServerRecord(raw, path, issues)
  validateServerRecord(server, path, issues)

  if (issues.length) {
    throwValidationError('validation_failed', 'MCP server definition is invalid.', issues)
  }

  return server
}

export function normalizeMcpServerId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function redactSecretText(text: string): string {
  return text
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^,\s]+/gi, '$1[redacted]')
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[:=]\s*)[^,\s]+/gi, '$1[redacted]')
}

export function isKnownToolRisk(value: unknown): value is ToolRisk {
  return value === 'safe' || value === 'read' || value === 'write' || value === 'network' || value === 'exec'
}

function migrateRegistry(raw: unknown): unknown {
  if (raw === undefined || raw === null) {
    return cloneDefaultMcpRegistry()
  }
  if (!isPlainObject(raw)) {
    throwValidationError('invalid_registry', 'MCP server registry is invalid.', [
      { path: '', message: 'Registry must be an object.', code: 'invalid_type' },
    ])
  }

  const version = typeof raw.version === 'number' ? raw.version : CURRENT_MCP_REGISTRY_VERSION
  if (version > CURRENT_MCP_REGISTRY_VERSION) {
    throw new McpValidationError(mcpError(
      'unsupported_version',
      `MCP registry version ${version} is newer than supported version ${CURRENT_MCP_REGISTRY_VERSION}.`,
      {
        issues: [
          {
            path: 'version',
            message: `Unsupported future MCP registry version ${version}.`,
            code: 'unsupported_version',
          },
        ],
      },
    ))
  }

  if (version < CURRENT_MCP_REGISTRY_VERSION) {
    return {
      ...raw,
      version: CURRENT_MCP_REGISTRY_VERSION,
    }
  }

  return raw
}

function normalizeRegistryShape(raw: unknown, issues: McpValidationIssue[]): McpServerRegistry {
  if (!isPlainObject(raw)) {
    issues.push({ path: '', message: 'Registry must be an object.', code: 'invalid_type' })
    return cloneDefaultMcpRegistry()
  }

  const servers = raw.servers === undefined || raw.servers === null
    ? []
    : Array.isArray(raw.servers)
      ? raw.servers.map((server, index) => normalizeServerRecord(server, `servers.${index}`, issues))
      : issueAndReturn<McpServerRecord[]>(issues, 'servers', 'Servers must be an array.', 'invalid_type', [])

  return {
    version: typeof raw.version === 'number' ? raw.version as McpRegistryVersion : CURRENT_MCP_REGISTRY_VERSION,
    servers,
  }
}

function normalizeServerRecord(raw: unknown, path: string, issues: McpValidationIssue[]): McpServerRecord {
  if (!isPlainObject(raw)) {
    issues.push({ path, message: 'Server must be an object.', code: 'invalid_type' })
    return defaultServerRecord()
  }

  const id = typeof raw.id === 'string' ? normalizeMcpServerId(raw.id) : ''
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  const now = Date.now()

  return {
    id,
    name,
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : false,
    transport: normalizeTransport(raw.transport, `${path}.transport`, issues),
    timeoutMs: normalizeTimeout(raw.timeoutMs, DEFAULT_MCP_SERVER_TIMEOUT_MS),
    toolTimeoutMs: normalizeTimeout(raw.toolTimeoutMs, DEFAULT_MCP_TOOL_TIMEOUT_MS),
    createdAt: typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : now,
  }
}

function normalizeTransport(raw: unknown, path: string, issues: McpValidationIssue[]): McpServerTransportConfig {
  if (!isPlainObject(raw)) {
    issues.push({ path, message: 'Transport must be an object.', code: 'invalid_type' })
    return { type: 'stdio', command: '', args: [], env: {} }
  }

  if (raw.type === 'stdio') {
    return {
      type: 'stdio',
      command: typeof raw.command === 'string' ? raw.command.trim() : '',
      args: normalizeStringArray(raw.args, `${path}.args`, issues),
      cwd: typeof raw.cwd === 'string' && raw.cwd.trim() ? raw.cwd.trim() : undefined,
      env: normalizeStringRecord(raw.env, `${path}.env`, issues),
    }
  }

  if (raw.type === 'http') {
    return {
      type: 'http',
      url: typeof raw.url === 'string' ? raw.url.trim() : '',
      headers: normalizeStringRecord(raw.headers, `${path}.headers`, issues),
    }
  }

  issues.push({ path: `${path}.type`, message: 'Transport type must be stdio or http.', code: 'invalid_enum' })
  return { type: 'stdio', command: '', args: [], env: {} }
}

function validateRegistryShape(registry: McpServerRegistry, issues: McpValidationIssue[]): void {
  if (registry.version !== CURRENT_MCP_REGISTRY_VERSION) {
    issues.push({
      path: 'version',
      message: `Registry version must be ${CURRENT_MCP_REGISTRY_VERSION}.`,
      code: 'invalid_version',
    })
  }

  if (!Array.isArray(registry.servers)) {
    issues.push({ path: 'servers', message: 'Servers must be an array.', code: 'invalid_type' })
    return
  }

  const ids = new Set<string>()
  for (const [index, server] of registry.servers.entries()) {
    const path = `servers.${index}`
    validateServerRecord(server, path, issues)
    if (ids.has(server.id)) {
      issues.push({ path: `${path}.id`, message: 'Server ID must be unique.', code: 'duplicate' })
    }
    ids.add(server.id)
  }
}

function validateServerRecord(server: McpServerRecord, path: string, issues: McpValidationIssue[]): void {
  if (!server.id) {
    issues.push({ path: `${path}.id`, message: 'Server ID is required.', code: 'required' })
  }
  if (!server.name) {
    issues.push({ path: `${path}.name`, message: 'Server name is required.', code: 'required' })
  }
  if (typeof server.enabled !== 'boolean') {
    issues.push({ path: `${path}.enabled`, message: 'Server enabled state must be boolean.', code: 'invalid_type' })
  }
  validateTransport(server.transport, `${path}.transport`, issues)
  validateTimeout(server.timeoutMs, `${path}.timeoutMs`, issues)
  validateTimeout(server.toolTimeoutMs, `${path}.toolTimeoutMs`, issues)
  if (!Number.isFinite(server.createdAt)) {
    issues.push({ path: `${path}.createdAt`, message: 'Created timestamp must be a number.', code: 'invalid_type' })
  }
  if (!Number.isFinite(server.updatedAt)) {
    issues.push({ path: `${path}.updatedAt`, message: 'Updated timestamp must be a number.', code: 'invalid_type' })
  }
}

function validateTransport(transport: McpServerTransportConfig, path: string, issues: McpValidationIssue[]): void {
  if (transport.type === 'stdio') {
    validateStdioTransport(transport, path, issues)
    return
  }
  if (transport.type === 'http') {
    validateHttpTransport(transport, path, issues)
    return
  }
  issues.push({ path: `${path}.type`, message: 'Transport type must be stdio or http.', code: 'invalid_enum' })
}

function validateStdioTransport(transport: McpStdioTransportConfig, path: string, issues: McpValidationIssue[]): void {
  if (!transport.command) {
    issues.push({ path: `${path}.command`, message: 'Command is required for stdio MCP servers.', code: 'required' })
  }
  if (!Array.isArray(transport.args) || !transport.args.every((arg) => typeof arg === 'string')) {
    issues.push({ path: `${path}.args`, message: 'Command arguments must be strings.', code: 'invalid_type' })
  }
  if (!isStringRecord(transport.env)) {
    issues.push({ path: `${path}.env`, message: 'Environment values must be strings.', code: 'invalid_type' })
  }
}

function validateHttpTransport(transport: McpHttpTransportConfig, path: string, issues: McpValidationIssue[]): void {
  if (!transport.url) {
    issues.push({ path: `${path}.url`, message: 'URL is required for HTTP MCP servers.', code: 'required' })
  } else {
    try {
      const parsed = new URL(transport.url)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        issues.push({ path: `${path}.url`, message: 'URL must use http or https.', code: 'invalid_url' })
      }
    } catch {
      issues.push({ path: `${path}.url`, message: 'URL must be valid.', code: 'invalid_url' })
    }
  }
  if (!isStringRecord(transport.headers)) {
    issues.push({ path: `${path}.headers`, message: 'Header values must be strings.', code: 'invalid_type' })
  }
}

function validateTimeout(value: number, path: string, issues: McpValidationIssue[]): void {
  if (!Number.isInteger(value) || value < 1_000 || value > 300_000) {
    issues.push({ path, message: 'Timeout must be an integer between 1000 and 300000 milliseconds.', code: 'out_of_range' })
  }
}

function normalizeTimeout(value: unknown, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback
  }
  return Math.max(1_000, Math.min(Math.floor(value as number), 300_000))
}

function normalizeStringArray(value: unknown, path: string, issues: McpValidationIssue[]): string[] {
  if (value === undefined || value === null) {
    return []
  }
  if (!Array.isArray(value)) {
    issues.push({ path, message: 'Value must be an array of strings.', code: 'invalid_type' })
    return []
  }
  const result: string[] = []
  for (const [index, item] of value.entries()) {
    if (typeof item === 'string') {
      result.push(item)
    } else {
      issues.push({ path: `${path}.${index}`, message: 'Value must be a string.', code: 'invalid_type' })
    }
  }
  return result
}

function normalizeStringRecord(value: unknown, path: string, issues: McpValidationIssue[]): Record<string, string> {
  if (value === undefined || value === null) {
    return {}
  }
  if (!isPlainObject(value)) {
    issues.push({ path, message: 'Value must be an object with string values.', code: 'invalid_type' })
    return {}
  }

  const result: Record<string, string> = {}
  for (const [key, item] of Object.entries(value).sort(([left], [right]) => left.localeCompare(right))) {
    if (!key.trim()) {
      issues.push({ path, message: 'Record keys must be non-empty strings.', code: 'invalid_key' })
      continue
    }
    if (typeof item === 'string') {
      result[key] = item
    } else {
      issues.push({ path: `${path}.${key}`, message: 'Record values must be strings.', code: 'invalid_type' })
    }
  }
  return result
}

function sortRegistry(registry: McpServerRegistry): McpServerRegistry {
  return {
    version: CURRENT_MCP_REGISTRY_VERSION,
    servers: registry.servers
      .map((server) => ({
        id: server.id,
        name: server.name,
        enabled: server.enabled,
        transport: sortTransport(server.transport),
        timeoutMs: server.timeoutMs,
        toolTimeoutMs: server.toolTimeoutMs,
        createdAt: server.createdAt,
        updatedAt: server.updatedAt,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  }
}

function sortTransport(transport: McpServerTransportConfig): McpServerTransportConfig {
  if (transport.type === 'stdio') {
    return {
      type: 'stdio',
      command: transport.command,
      args: [...transport.args],
      cwd: transport.cwd,
      env: sortRecord(transport.env),
    }
  }

  return {
    type: 'http',
    url: transport.url,
    headers: sortRecord(transport.headers),
  }
}

function sortRecord(record: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(record).sort(([left], [right]) => left.localeCompare(right)))
}

function maskCommandArgs(args: string[]): string[] {
  const masked: string[] = []
  let previousWasSecretFlag = false
  for (const arg of args) {
    if (previousWasSecretFlag) {
      masked.push('[redacted]')
      previousWasSecretFlag = false
      continue
    }

    if (/^(?:--?)(?:api[_-]?key|token|password|secret)(?:$|=)/i.test(arg)) {
      masked.push(arg.includes('=') ? arg.replace(/=.*/, '=[redacted]') : arg)
      previousWasSecretFlag = !arg.includes('=')
      continue
    }

    masked.push(redactSecretText(arg))
  }
  return masked
}

function maskUrl(value: string): string {
  try {
    const url = new URL(value)
    if (url.username) {
      url.username = '[redacted]'
    }
    if (url.password) {
      url.password = '[redacted]'
    }
    for (const key of [...url.searchParams.keys()]) {
      if (/api[_-]?key|token|password|secret/i.test(key)) {
        url.searchParams.set(key, '[redacted]')
      }
    }
    return url.toString()
  } catch {
    return redactSecretText(value)
  }
}

function stableComparable(value: unknown): string {
  return JSON.stringify(stableValue(value))
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue)
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    )
  }
  return value
}

function throwValidationError(code: McpErrorCode, message: string, issues: McpValidationIssue[]): never {
  throw new McpValidationError(mcpError(code, message, { issues }))
}

function defaultServerRecord(): McpServerRecord {
  const now = Date.now()
  return {
    id: '',
    name: '',
    enabled: false,
    transport: { type: 'stdio', command: '', args: [], env: {} },
    timeoutMs: DEFAULT_MCP_SERVER_TIMEOUT_MS,
    toolTimeoutMs: DEFAULT_MCP_TOOL_TIMEOUT_MS,
    createdAt: now,
    updatedAt: now,
  }
}

function issueAndReturn<T>(
  issues: McpValidationIssue[],
  path: string,
  message: string,
  code: string,
  value: T,
): T {
  issues.push({ path, message, code })
  return value
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isPlainObject(value) && Object.values(value).every((item) => typeof item === 'string')
}

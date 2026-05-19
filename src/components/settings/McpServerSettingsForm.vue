<script setup lang="ts">
import {
  AlertCircleIcon,
  GlobeIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  ServerIcon,
  TerminalIcon,
  Trash2Icon,
} from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type {
  BridgeManagedToolInfo,
  BridgeMcpChangedEvent,
  BridgeMcpDiscoveryStatus,
  BridgeMcpRegistryStatus,
  BridgeMcpSafeTransport,
  BridgeMcpServerSummary,
  BridgeSaveMcpServerRequest,
} from '@/bridge/app'
import { appBridge, isFallbackBridge } from '@/bridge/app'
import McpServerDeleteModal from '@/components/settings/mcp-server-settings/McpServerDeleteModal.vue'
import McpServerFormModal from '@/components/settings/mcp-server-settings/McpServerFormModal.vue'
import type {
  McpKeyValueRow,
  McpSecretRowType,
  McpServerDraft,
} from '@/components/settings/mcp-server-settings/types'
import SettingsSection from '@/components/settings/SettingsSection.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { errorToText, useToast } from '@/utils/toast'

const DEFAULT_TIMEOUT_MS = '15000'
const DEFAULT_TOOL_TIMEOUT_MS = '30000'

const toast = useToast()

const servers = ref<BridgeMcpServerSummary[]>([])
const registryStatus = ref<BridgeMcpRegistryStatus>()
const productTools = ref<BridgeManagedToolInfo[]>([])
const loading = ref(false)
const productToolsLoading = ref(false)
const operationError = ref('')
const pendingKeys = ref<Set<string>>(new Set())
const formOpen = ref(false)
const deleteDialogOpen = ref(false)
const editingServer = ref<BridgeMcpServerSummary>()
const deleteTarget = ref<BridgeMcpServerSummary>()
const formErrors = ref<Record<string, string>>({})
const draft = ref(createEmptyDraft())
let nextRowId = 1
let unsubscribeMcp: (() => void) | undefined

const mcpUnavailable = computed(() => !appBridge.mcp)
const enabledCount = computed(() => servers.value.filter((server) => server.enabled).length)
const discoveredToolCount = computed(() =>
  servers.value.reduce((count, server) => count + server.tools.length, 0)
)
const anyPending = computed(() => pendingKeys.value.size > 0)
const registryError = computed(() => registryStatus.value?.error?.message || '')
const existingSecretKeys = computed(() => {
  const server = editingServer.value
  if (!server || server.transport.type !== draft.value.transportType) return []
  if (server.transport.type === 'stdio') return server.transport.envKeys
  return server.transport.headerKeys
})
const deletePending = computed(() =>
  deleteTarget.value ? isPending(`delete:${deleteTarget.value.id}`) : false
)
const productOwnedTools = computed(() =>
  productTools.value.filter((tool) => tool.source === 'builtin')
)

onMounted(async () => {
  unsubscribeMcp = appBridge.mcp?.onChanged((event: BridgeMcpChangedEvent) => {
    servers.value = event.servers
    registryStatus.value = event.status
  })

  await loadServers()
  void loadProductTools()
})

onBeforeUnmount(() => {
  unsubscribeMcp?.()
  unsubscribeMcp = undefined
})

function createEmptyDraft(): McpServerDraft {
  return {
    name: '',
    enabled: true,
    transportType: 'stdio',
    command: '',
    argsText: '',
    cwd: '',
    envRows: [],
    url: '',
    headerRows: [],
    timeoutMs: DEFAULT_TIMEOUT_MS,
    toolTimeoutMs: DEFAULT_TOOL_TIMEOUT_MS,
  }
}

function createDraftFromServer(server: BridgeMcpServerSummary): McpServerDraft {
  const baseDraft = createEmptyDraft()
  baseDraft.id = server.id
  baseDraft.name = server.name
  baseDraft.enabled = server.enabled
  baseDraft.transportType = server.transport.type
  baseDraft.timeoutMs = String(server.timeoutMs || DEFAULT_TIMEOUT_MS)
  baseDraft.toolTimeoutMs = String(server.toolTimeoutMs || DEFAULT_TOOL_TIMEOUT_MS)

  if (server.transport.type === 'stdio') {
    baseDraft.command = server.transport.command
    baseDraft.argsText = server.transport.args.join('\n')
    baseDraft.cwd = server.transport.cwd || ''
  } else {
    baseDraft.url = server.transport.url
  }

  return baseDraft
}

async function loadServers() {
  if (!appBridge.mcp) {
    operationError.value = 'MCP 管理桥接尚未就绪。'
    return
  }

  loading.value = true
  operationError.value = ''

  try {
    const response = await appBridge.mcp.listServers()
    servers.value = response.servers
    registryStatus.value = response.status

    const inventory = await appBridge.mcp.listTools()
    if (inventory.servers.length) {
      servers.value = inventory.servers
    }
  } catch (error) {
    showOperationError(error, 'MCP 服务器加载失败。')
  } finally {
    loading.value = false
  }
}

async function loadProductTools() {
  if (!appBridge.tools?.list) return

  productToolsLoading.value = true
  try {
    productTools.value = await appBridge.tools.list()
  } catch {
    productTools.value = []
  } finally {
    productToolsLoading.value = false
  }
}

function openCreateForm() {
  editingServer.value = undefined
  draft.value = createEmptyDraft()
  formErrors.value = {}
  operationError.value = ''
  formOpen.value = true
}

function openEditForm(server: BridgeMcpServerSummary) {
  editingServer.value = server
  draft.value = createDraftFromServer(server)
  formErrors.value = {}
  operationError.value = ''
  formOpen.value = true
}

function closeForm() {
  formOpen.value = false
  editingServer.value = undefined
  formErrors.value = {}
}

function openDeleteDialog(server: BridgeMcpServerSummary) {
  deleteTarget.value = server
  deleteDialogOpen.value = true
}

async function saveServer() {
  if (!appBridge.mcp) return

  const request = buildSaveRequest()
  if (!request) return

  await withPending('save', async () => {
    try {
      const saved = await appBridge.mcp?.saveServer(request)
      if (saved) upsertServer(saved)
      closeForm()
      toast.success(`${request.server.name} 已保存。`)
    } catch (error) {
      showOperationError(error, 'MCP 服务器保存失败。')
    }
  })
}

async function deleteServer() {
  if (!appBridge.mcp || !deleteTarget.value) return

  const target = deleteTarget.value
  await withPending(`delete:${target.id}`, async () => {
    try {
      const response = await appBridge.mcp?.deleteServer({ serverId: target.id })
      if (response) {
        servers.value = response.servers
        registryStatus.value = response.status
      }
      deleteDialogOpen.value = false
      deleteTarget.value = undefined
      toast.success(`${target.name} 已删除。`)
    } catch (error) {
      showOperationError(error, 'MCP 服务器删除失败。')
    }
  })
}

async function setServerEnabled(server: BridgeMcpServerSummary, enabled: boolean) {
  if (!appBridge.mcp) return

  await withPending(`enable:${server.id}`, async () => {
    try {
      const updated = await appBridge.mcp?.setServerEnabled({ serverId: server.id, enabled })
      if (updated) upsertServer(updated)
      toast.success(`${server.name} 已${enabled ? '启用' : '停用'}。`)
    } catch (error) {
      showOperationError(error, 'MCP 服务器状态更新失败。')
    }
  })
}

async function refreshServers(serverId?: string) {
  if (!appBridge.mcp) return

  const pendingKey = serverId ? `refresh:${serverId}` : 'refresh:all'
  await withPending(pendingKey, async () => {
    try {
      const response = await appBridge.mcp?.refreshServer(serverId ? { serverId } : undefined)
      if (response) {
        servers.value = response.servers
        registryStatus.value = response.status
      }
      toast.success(serverId ? 'MCP 服务器已刷新。' : 'MCP 服务器列表已刷新。')
    } catch (error) {
      showOperationError(error, 'MCP 服务器刷新失败。')
    }
  })
}

function buildSaveRequest(): BridgeSaveMcpServerRequest | undefined {
  const nextErrors: Record<string, string> = {}
  const name = draft.value.name.trim()
  const timeoutMs = parsePositiveInteger(draft.value.timeoutMs)
  const toolTimeoutMs = parsePositiveInteger(draft.value.toolTimeoutMs)

  if (!name) {
    nextErrors.name = '请输入服务器名称。'
  }
  if (!timeoutMs) {
    nextErrors.timeoutMs = '请输入有效的连接超时时间。'
  }
  if (!toolTimeoutMs) {
    nextErrors.toolTimeoutMs = '请输入有效的工具超时时间。'
  }

  const server: BridgeSaveMcpServerRequest['server'] = {
    id: draft.value.id,
    name,
    enabled: draft.value.enabled,
    transport: {
      type: 'stdio',
      command: '',
      args: [],
      env: {},
    },
    timeoutMs,
    toolTimeoutMs,
  }

  if (draft.value.transportType === 'stdio') {
    const command = draft.value.command.trim()
    if (!command) {
      nextErrors.command = '请输入启动命令。'
    }
    server.transport = {
      type: 'stdio',
      command,
      args: parseLines(draft.value.argsText),
      cwd: draft.value.cwd.trim() || undefined,
      env: rowsToRecord(draft.value.envRows),
    }
  } else {
    const url = draft.value.url.trim()
    if (!/^https?:\/\//i.test(url)) {
      nextErrors.url = '请输入 http 或 https 地址。'
    }
    server.transport = {
      type: 'http',
      url,
      headers: rowsToRecord(draft.value.headerRows),
    }
  }

  formErrors.value = nextErrors
  if (Object.keys(nextErrors).length) return undefined

  return { server }
}

function parseLines(value: string) {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function parsePositiveInteger(value: string) {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function rowsToRecord(rows: McpKeyValueRow[]) {
  return rows.reduce<Record<string, string>>((record, row) => {
    const key = row.key.trim()
    if (!key) return record
    record[key] = row.value
    return record
  }, {})
}

function addKeyValueRow(type: McpSecretRowType) {
  const row = { id: `row-${nextRowId++}`, key: '', value: '' }
  if (type === 'env') {
    draft.value.envRows.push(row)
  } else {
    draft.value.headerRows.push(row)
  }
}

function removeKeyValueRow(type: McpSecretRowType, rowId: string) {
  if (type === 'env') {
    draft.value.envRows = draft.value.envRows.filter((row) => row.id !== rowId)
  } else {
    draft.value.headerRows = draft.value.headerRows.filter((row) => row.id !== rowId)
  }
}

function upsertServer(server: BridgeMcpServerSummary) {
  const index = servers.value.findIndex((item) => item.id === server.id)
  if (index === -1) {
    servers.value = [server, ...servers.value]
    return
  }

  servers.value = servers.value.map((item) => (item.id === server.id ? server : item))
}

async function withPending(key: string, operation: () => Promise<void>) {
  if (pendingKeys.value.has(key)) return
  pendingKeys.value = new Set([...pendingKeys.value, key])
  try {
    await operation()
  } finally {
    const next = new Set(pendingKeys.value)
    next.delete(key)
    pendingKeys.value = next
  }
}

function isPending(key: string) {
  return pendingKeys.value.has(key)
}

function isServerPending(serverId: string) {
  return Array.from(pendingKeys.value).some((key) => key.endsWith(`:${serverId}`))
}

function showOperationError(error: unknown, fallback: string) {
  const message = redactDraftSecrets(errorToText(error, fallback))
  operationError.value = message
  toast.error(message)
}

function redactDraftSecrets(message: string) {
  return [...draft.value.envRows, ...draft.value.headerRows].reduce((text, row) => {
    if (row.value.length < 3) return text
    return text.split(row.value).join('••••')
  }, message)
}

function statusLabel(status: BridgeMcpDiscoveryStatus) {
  const labels: Record<BridgeMcpDiscoveryStatus, string> = {
    idle: '未发现',
    refreshing: '刷新中',
    available: '可用',
    error: '错误',
    disabled: '已停用',
  }
  return labels[status] || status
}

function statusVariant(status: BridgeMcpDiscoveryStatus) {
  if (status === 'error') return 'destructive'
  if (status === 'available') return 'secondary'
  return 'outline'
}

function riskLabel(risk: string) {
  const labels: Record<string, string> = {
    safe: '安全',
    read: '读取',
    network: '网络',
    write: '写入',
    exec: '执行',
  }
  return labels[risk] || risk
}

function riskVariant(risk: string) {
  return ['write', 'exec', 'network'].includes(risk) ? 'destructive' : 'outline'
}

function transportLabel(transport: BridgeMcpSafeTransport) {
  return transport.type === 'stdio' ? '本地命令' : 'HTTP'
}

function transportIcon(transport: BridgeMcpSafeTransport) {
  return transport.type === 'stdio' ? TerminalIcon : GlobeIcon
}

function transportTarget(transport: BridgeMcpSafeTransport) {
  if (transport.type === 'stdio') return transport.command
  return transport.url
}

function transportDetails(transport: BridgeMcpSafeTransport) {
  if (transport.type === 'stdio') {
    return [
      transport.args.length ? `${transport.args.length} 个参数` : '无参数',
      transport.cwd ? `cwd: ${transport.cwd}` : '默认工作目录',
      transport.envKeys.length ? `环境变量: ${transport.envKeys.join(', ')}` : '无环境变量',
    ]
  }

  return [transport.headerKeys.length ? `请求头: ${transport.headerKeys.join(', ')}` : '无请求头']
}
</script>

<template>
  <SettingsSection
    title="工具设置"
    description="管理用户配置的 MCP 服务器。"
  >
    <div class="flex flex-col">
      <div class="flex flex-col gap-3 border-b px-4 py-4 md:flex-row md:items-center md:justify-between">
        <div class="flex min-w-0 flex-col gap-1">
          <div class="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">
              {{ servers.length }} 个服务器
            </Badge>
            <Badge variant="outline">
              {{ enabledCount }} 个已启用
            </Badge>
            <Badge variant="outline">
              {{ discoveredToolCount }} 个 MCP 工具
            </Badge>
          </div>
          <p class="text-sm text-muted-foreground">
            内置工具由 OpenOmniClaw 管理，外部扩展通过 MCP 服务器接入。
          </p>
        </div>

        <div class="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            :disabled="loading || anyPending || mcpUnavailable"
            @click="refreshServers()"
          >
            <RefreshCwIcon
              data-icon="inline-start"
              :class="cn(isPending('refresh:all') && 'animate-spin')"
            />
            刷新
          </Button>
          <Button
            size="sm"
            :disabled="mcpUnavailable"
            @click="openCreateForm"
          >
            <PlusIcon data-icon="inline-start" />
            添加服务器
          </Button>
        </div>
      </div>

      <div
        v-if="mcpUnavailable"
        class="border-b px-4 py-4 text-sm text-muted-foreground"
      >
        MCP 管理桥接尚未就绪，请在 Electron 运行时中打开设置。
      </div>

      <div
        v-if="isFallbackBridge"
        class="border-b px-4 py-3 text-sm text-muted-foreground"
      >
        当前是预览运行时，可以查看空列表，但保存、删除和刷新操作不会写入本地注册表。
      </div>

      <div
        v-if="operationError || registryError"
        class="border-b px-4 py-4"
      >
        <div class="flex gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircleIcon class="mt-0.5 shrink-0" />
          <span>{{ operationError || registryError }}</span>
        </div>
      </div>

      <div
        v-if="loading"
        class="flex flex-col gap-3 px-4 py-4"
      >
        <Skeleton class="h-24 w-full" />
        <Skeleton class="h-24 w-full" />
      </div>

      <div
        v-else-if="!servers.length"
        class="flex flex-col items-start gap-3 px-4 py-8"
      >
        <div class="flex items-center gap-2 text-sm font-medium">
          <ServerIcon class="text-muted-foreground" />
          暂无 MCP 服务器
        </div>
        <p class="max-w-2xl text-sm text-muted-foreground">
          添加本地命令或 HTTP MCP 服务器后，发现到的工具会显示在这里。
        </p>
        <Button
          size="sm"
          :disabled="mcpUnavailable"
          @click="openCreateForm"
        >
          <PlusIcon data-icon="inline-start" />
          添加服务器
        </Button>
      </div>

      <ul
        v-else
        class="flex flex-col"
      >
        <li
          v-for="server in servers"
          :key="server.id"
          class="flex flex-col gap-3 border-b px-4 py-4 last:border-b-0"
        >
          <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div class="flex min-w-0 flex-col gap-2">
              <div class="flex flex-wrap items-center gap-2">
                <h3 class="truncate text-sm font-medium">
                  {{ server.name }}
                </h3>
                <Badge :variant="statusVariant(server.status)">
                  {{ statusLabel(server.status) }}
                </Badge>
                <Badge variant="outline">
                  <component
                    :is="transportIcon(server.transport)"
                    data-icon="inline-start"
                  />
                  {{ transportLabel(server.transport) }}
                </Badge>
                <Badge :variant="server.enabled ? 'secondary' : 'outline'">
                  {{ server.enabled ? '已启用' : '已停用' }}
                </Badge>
              </div>

              <p class="truncate text-xs text-muted-foreground">
                {{ server.id }}
              </p>
              <p class="truncate text-sm text-muted-foreground">
                {{ transportTarget(server.transport) }}
              </p>
              <div class="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span
                  v-for="detail in transportDetails(server.transport)"
                  :key="detail"
                >
                  {{ detail }}
                </span>
                <span>连接 {{ server.timeoutMs }}ms</span>
                <span>工具 {{ server.toolTimeoutMs }}ms</span>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-2">
              <Field
                orientation="horizontal"
                class="items-center gap-2"
              >
                <Switch
                  :id="`mcp-enabled-${server.id}`"
                  :model-value="server.enabled"
                  :disabled="isServerPending(server.id) || mcpUnavailable"
                  :aria-label="`${server.enabled ? '停用' : '启用'} ${server.name}`"
                  @update:model-value="setServerEnabled(server, $event)"
                />
                <FieldLabel :for="`mcp-enabled-${server.id}`">
                  启用
                </FieldLabel>
              </Field>

              <Button
                variant="outline"
                size="sm"
                :disabled="isServerPending(server.id) || mcpUnavailable"
                @click="refreshServers(server.id)"
              >
                <RefreshCwIcon
                  data-icon="inline-start"
                  :class="cn(isPending(`refresh:${server.id}`) && 'animate-spin')"
                />
                刷新
              </Button>
              <Button
                variant="outline"
                size="sm"
                :disabled="isServerPending(server.id)"
                @click="openEditForm(server)"
              >
                <PencilIcon data-icon="inline-start" />
                编辑
              </Button>
              <Button
                variant="outline"
                size="sm"
                :disabled="isServerPending(server.id) || mcpUnavailable"
                @click="openDeleteDialog(server)"
              >
                <Trash2Icon data-icon="inline-start" />
                删除
              </Button>
            </div>
          </div>

          <div
            v-if="server.error"
            class="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {{ server.error }}
          </div>

          <div
            v-if="server.tools.length"
            class="flex flex-col gap-2"
          >
            <div class="text-xs font-medium text-muted-foreground">
              已发现工具
            </div>
            <div class="grid grid-cols-1 gap-2 xl:grid-cols-2">
              <div
                v-for="tool in server.tools"
                :key="`${server.id}:${tool.providerName}`"
                class="flex min-w-0 flex-col gap-2 rounded-md border bg-background px-3 py-2"
              >
                <div class="flex flex-wrap items-center gap-2">
                  <span class="truncate text-sm font-medium">
                    {{ tool.label || tool.name }}
                  </span>
                  <Badge variant="outline">
                    {{ tool.providerName }}
                  </Badge>
                  <Badge :variant="riskVariant(tool.risk)">
                    {{ riskLabel(tool.risk) }}
                  </Badge>
                  <Badge :variant="tool.enabled ? 'secondary' : 'outline'">
                    {{ tool.enabled ? '可用' : '不可用' }}
                  </Badge>
                </div>
                <p class="line-clamp-2 text-sm text-muted-foreground">
                  {{ tool.description || '未提供描述。' }}
                </p>
                <div class="flex flex-wrap gap-1">
                  <Badge
                    v-for="profile in tool.profiles"
                    :key="profile"
                    variant="outline"
                  >
                    {{ profile }}
                  </Badge>
                </div>
              </div>
            </div>
          </div>

          <div
            v-else
            class="rounded-md border px-3 py-2 text-sm text-muted-foreground"
          >
            当前没有可展示的 MCP 工具。
          </div>
        </li>
      </ul>
    </div>
  </SettingsSection>

  <McpServerFormModal
    v-model:open="formOpen"
    v-model:draft="draft"
    :editing="Boolean(editingServer)"
    :existing-secret-keys="existingSecretKeys"
    :form-errors="formErrors"
    :saving="isPending('save')"
    :disabled="mcpUnavailable"
    @submit="saveServer"
    @close="closeForm"
    @add-row="addKeyValueRow"
    @remove-row="removeKeyValueRow"
  />

  <McpServerDeleteModal
    v-model:open="deleteDialogOpen"
    :target="deleteTarget"
    :pending="deletePending"
    @delete="deleteServer"
  />
</template>

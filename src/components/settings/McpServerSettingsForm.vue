<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type {
  BridgeMcpChangedEvent,
  BridgeMcpRegistryStatus,
  BridgeMcpServerSummary,
  BridgeSaveMcpServerRequest,
} from '@/bridge/app'
import { appBridge, isFallbackBridge } from '@/bridge/app'
import McpServerDeleteModal from '@/components/settings/mcp-server-settings/McpServerDeleteModal.vue'
import McpServerFormModal from '@/components/settings/mcp-server-settings/McpServerFormModal.vue'
import McpServerList from '@/components/settings/mcp-server-settings/McpServerList.vue'
import type {
  McpKeyValueRow,
  McpSecretRowType,
  McpServerDraft,
} from '@/components/settings/mcp-server-settings/types'
import { useDelayedFlag } from '@/composables/useDelayedFlag'
import { errorToText, useToast } from '@/utils/toast'

const DEFAULT_TIMEOUT_MS = '15000'
const DEFAULT_TOOL_TIMEOUT_MS = '30000'

const toast = useToast()

const servers = ref<BridgeMcpServerSummary[]>([])
const registryStatus = ref<BridgeMcpRegistryStatus>()
const loading = ref(false)
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
const showServerListSkeleton = useDelayedFlag(() => loading.value)

onMounted(async () => {
  unsubscribeMcp = appBridge.mcp?.onChanged((event: BridgeMcpChangedEvent) => {
    servers.value = event.servers
    registryStatus.value = event.status
  })

  await loadServers()
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
</script>

<template>
  <div class="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
    <McpServerList
      class="min-h-0 flex-1"
      :servers="servers"
      :loading="loading"
      :show-skeleton="showServerListSkeleton"
      :any-pending="anyPending"
      :mcp-unavailable="mcpUnavailable"
      :fallback-runtime="isFallbackBridge"
      :operation-error="operationError"
      :registry-error="registryError"
      :is-pending="isPending"
      :is-server-pending="isServerPending"
      @create="openCreateForm"
      @refresh="refreshServers"
      @edit="openEditForm"
      @enable="setServerEnabled"
      @delete="openDeleteDialog"
    />

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
  </div>
</template>

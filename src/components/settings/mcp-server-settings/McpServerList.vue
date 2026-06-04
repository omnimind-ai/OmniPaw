<script setup lang="ts">
import {
  AlertCircleIcon,
  GlobeIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  ServerIcon,
  TerminalIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-vue-next'
import { computed, ref } from 'vue'
import type {
  BridgeMcpDiscoveredToolSummary,
  BridgeMcpDiscoveryStatus,
  BridgeMcpSafeTransport,
  BridgeMcpServerSummary,
} from '@/bridge/app'

import SettingsPanelHeader from '@/components/settings/common/SettingsPanelHeader.vue'
import SettingsPanelItem from '@/components/settings/common/SettingsPanelItem.vue'
import SettingsSearchBar from '@/components/settings/common/SettingsSearchBar.vue'
import { Badge, type BadgeVariants } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

const props = defineProps<{
  servers: BridgeMcpServerSummary[]
  loading: boolean
  showSkeleton: boolean
  anyPending: boolean
  mcpUnavailable: boolean
  fallbackRuntime: boolean
  operationError: string
  registryError: string
  isPending: (key: string) => boolean
  isServerPending: (serverId: string) => boolean
}>()

const emit = defineEmits<{
  create: []
  refresh: [serverId?: string]
  edit: [server: BridgeMcpServerSummary]
  enable: [server: BridgeMcpServerSummary, enabled: boolean]
  delete: [server: BridgeMcpServerSummary]
}>()

const searchQuery = ref('')
const enabledCount = computed(() => props.servers.filter((server) => server.enabled).length)
const discoveredToolCount = computed(() =>
  props.servers.reduce((count, server) => count + server.tools.length, 0)
)
const filteredServers = computed(() => {
  const query = normalizeSearchText(searchQuery.value)
  if (!query) return props.servers
  return props.servers.filter((server) =>
    normalizeSearchText(serverSearchText(server)).includes(query)
  )
})
const searchEmpty = computed(() => props.servers.length > 0 && filteredServers.value.length === 0)

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

function statusVariant(status: BridgeMcpDiscoveryStatus): BadgeVariants['variant'] {
  if (status === 'error') return 'destructive'
  if (status === 'available') return 'secondary'
  return 'outline'
}

function riskLabel(risk: BridgeMcpDiscoveredToolSummary['risk']) {
  const labels: Record<string, string> = {
    safe: '安全',
    read: '读取',
    network: '网络',
    write: '写入',
    exec: '执行',
  }
  return labels[risk] || risk
}

function riskVariant(risk: BridgeMcpDiscoveredToolSummary['risk']): BadgeVariants['variant'] {
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
      transport.localExecution ? '本地进程执行面' : undefined,
      transport.args.length ? `${transport.args.length} 个参数` : '无参数',
      transport.cwd ? `cwd: ${transport.cwd}` : '默认工作目录',
      transport.envKeys.length ? `环境变量: ${transport.envKeys.join(', ')}` : '无环境变量',
    ].filter(Boolean) as string[]
  }

  return [transport.headerKeys.length ? `请求头: ${transport.headerKeys.join(', ')}` : '无请求头']
}

function serverSearchText(server: BridgeMcpServerSummary) {
  return [
    server.name,
    server.id,
    transportLabel(server.transport),
    transportTarget(server.transport),
    ...transportDetails(server.transport),
    ...server.tools.flatMap((tool) => [
      tool.name,
      tool.label,
      tool.providerName,
      tool.description,
      riskLabel(tool.risk),
      ...tool.profiles,
    ]),
  ]
    .filter(Boolean)
    .join(' ')
}

function normalizeSearchText(value: string) {
  return value.trim().toLocaleLowerCase()
}

function clearSearch() {
  searchQuery.value = ''
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
    <Card class="grid h-full min-h-0 flex-1 grid-rows-[auto_auto_minmax(0,1fr)] gap-0 rounded-md border border-border py-0 ring-0">
      <SettingsPanelHeader
        title="MCP 服务器"
        :icon="ServerIcon"
      >
        <template #description>
          管理外部 MCP 服务器。内置工具由 OpenOmniClaw 管理，外部扩展通过 MCP 接入。
        </template>
      </SettingsPanelHeader>

      <SettingsSearchBar
        v-model="searchQuery"
        class="border-b-0"
        label="搜索 MCP 服务器"
        placeholder="搜索服务器、传输方式或工具"
        clear-label="清除 MCP 搜索"
      >
        <template #summary>
          <Badge variant="secondary">
            {{ servers.length }} 个服务器
          </Badge>
        </template>

        <template #actions>
          <Button
            type="button"
            variant="outline"
            :disabled="loading || anyPending || mcpUnavailable"
            @click="emit('refresh')"
          >
            <RefreshCwIcon
              data-icon="inline-start"
              :class="cn(isPending('refresh:all') && 'animate-spin')"
            />
            刷新
          </Button>
          <Button
            type="button"
            :disabled="mcpUnavailable"
            @click="emit('create')"
          >
            <PlusIcon data-icon="inline-start" />
            添加服务器
          </Button>
        </template>
      </SettingsSearchBar>

      <CardContent class="flex min-h-0 flex-1 flex-col overflow-y-auto p-0">
        <div class="flex min-h-full flex-1 flex-col">
          <div
            v-if="mcpUnavailable"
            class="shrink-0 border-b px-4 py-4 text-sm text-muted-foreground sm:px-5"
          >
            MCP 管理桥接尚未就绪，请在 Electron 运行时中打开设置。
          </div>

          <div
            v-if="fallbackRuntime"
            class="shrink-0 border-b px-4 py-3 text-sm text-muted-foreground sm:px-5"
          >
            当前是预览运行时，可以查看空列表，但保存、删除和刷新操作不会写入本地注册表。
          </div>

          <div
            v-if="operationError || registryError"
            class="shrink-0 border-b px-4 py-4 sm:px-5"
          >
            <div class="flex gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircleIcon class="mt-0.5 shrink-0" />
              <span>{{ operationError || registryError }}</span>
            </div>
          </div>

          <div
            v-if="loading"
            class="flex shrink-0 flex-col gap-3 px-4 py-4 sm:px-5"
          >
            <template v-if="showSkeleton">
              <Skeleton class="h-28 w-full" />
              <Skeleton class="h-28 w-full" />
            </template>
          </div>

          <div
            v-else-if="!servers.length"
            class="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-10 text-center text-sm text-muted-foreground sm:px-5"
          >
            <ServerIcon class="size-8 opacity-50" />
            <div class="flex flex-col gap-1">
              <p class="font-medium text-foreground">暂无 MCP 服务器。</p>
              <p>添加本地命令或 HTTP MCP 服务器后，发现到的工具会显示在这里。</p>
            </div>
            <Button
              type="button"
              size="sm"
              :disabled="mcpUnavailable"
              @click="emit('create')"
            >
              <PlusIcon data-icon="inline-start" />
              添加服务器
            </Button>
          </div>

          <div
            v-else-if="searchEmpty"
            class="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-10 text-center text-sm text-muted-foreground sm:px-5"
          >
            <SearchIcon class="size-8 opacity-50" />
            <div class="flex flex-col gap-1">
              <p class="font-medium text-foreground">没有匹配的 MCP 服务器。</p>
              <p>换一个服务器、传输方式或工具关键词试试。</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              @click="clearSearch"
            >
              <XIcon data-icon="inline-start" />
              清除搜索
            </Button>
          </div>

          <div
            v-else
            class="flex flex-1 flex-col gap-3 px-4 py-4 sm:px-5"
          >
            <SettingsPanelItem
              v-for="server in filteredServers"
              :key="server.id"
              :title="server.name"
              :description="transportTarget(server.transport)"
              :icon="transportIcon(server.transport)"
              :pending="isServerPending(server.id)"
            >
              <template #badges>
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
              </template>

              <template #meta>
                <p class="truncate text-xs text-muted-foreground">
                  {{ server.id }}
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
              </template>

              <template #actions>
                <Switch
                  :id="`mcp-enabled-${server.id}`"
                  size="sm"
                  :model-value="server.enabled"
                  :disabled="isServerPending(server.id) || mcpUnavailable"
                  :aria-label="`${server.enabled ? '停用' : '启用'} ${server.name}`"
                  @update:model-value="emit('enable', server, $event)"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  :disabled="isServerPending(server.id) || mcpUnavailable"
                  @click="emit('refresh', server.id)"
                >
                  <RefreshCwIcon
                    data-icon="inline-start"
                    :class="cn(isPending(`refresh:${server.id}`) && 'animate-spin')"
                  />
                  刷新
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  :disabled="isServerPending(server.id)"
                  @click="emit('edit', server)"
                >
                  <PencilIcon data-icon="inline-start" />
                  编辑
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  :disabled="isServerPending(server.id) || mcpUnavailable"
                  @click="emit('delete', server)"
                >
                  <Trash2Icon data-icon="inline-start" />
                  删除
                </Button>
              </template>

              <div
                v-if="server.error"
                class="mt-3 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {{ server.error }}
              </div>

              <div
                v-if="server.tools.length"
                class="mt-3 flex flex-col gap-2"
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
                class="mt-3 rounded-md border px-3 py-2 text-sm text-muted-foreground"
              >
                当前没有可展示的 MCP 工具。
              </div>
            </SettingsPanelItem>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
</template>

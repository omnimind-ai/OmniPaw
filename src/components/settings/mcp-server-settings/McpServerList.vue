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
import { computed } from 'vue'
import type {
  BridgeMcpDiscoveredToolSummary,
  BridgeMcpDiscoveryStatus,
  BridgeMcpSafeTransport,
  BridgeMcpServerSummary,
} from '@/bridge/app'

import SettingsListIconButton from '@/components/settings/SettingsListIconButton.vue'
import SettingsListItem from '@/components/settings/SettingsListItem.vue'
import SettingsListSection from '@/components/settings/SettingsListSection.vue'
import { Badge, type BadgeVariants } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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

const enabledCount = computed(() => props.servers.filter((server) => server.enabled).length)
const discoveredToolCount = computed(() =>
  props.servers.reduce((count, server) => count + server.tools.length, 0)
)

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
</script>

<template>
  <SettingsListSection
    title="MCP 服务器"
    :description="`${servers.length} 个服务器`"
    lead="内置工具由 OpenOmniClaw 管理，外部扩展通过 MCP 服务器接入。"
    :loading="loading"
    :show-skeleton="showSkeleton"
    :empty="!servers.length"
    empty-title="暂无 MCP 服务器"
    empty-description="添加本地命令或 HTTP MCP 服务器后，发现到的工具会显示在这里。"
    :empty-icon="ServerIcon"
  >
    <template #actions>
      <Button
        variant="outline"
        size="sm"
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
        size="sm"
        :disabled="mcpUnavailable"
        @click="emit('create')"
      >
        <PlusIcon data-icon="inline-start" />
        添加服务器
      </Button>
    </template>

    <template #summary>
      <Badge variant="secondary">
        {{ servers.length }} 个服务器
      </Badge>
      <Badge variant="outline">
        {{ enabledCount }} 个已启用
      </Badge>
      <Badge variant="outline">
        {{ discoveredToolCount }} 个 MCP 工具
      </Badge>
    </template>

    <template #notices>
      <div
        v-if="mcpUnavailable"
        class="border-b px-4 py-4 text-sm text-muted-foreground"
      >
        MCP 管理桥接尚未就绪，请在 Electron 运行时中打开设置。
      </div>

      <div
        v-if="fallbackRuntime"
        class="border-b px-4 py-3 text-sm text-muted-foreground"
      >
        当前是预览运行时，可以查看空列表，但保存、删除和刷新操作不会写入本地注册表。
      </div>
    </template>

    <template #error>
      <div
        v-if="operationError || registryError"
        class="border-b px-4 py-4"
      >
        <div class="flex gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircleIcon class="mt-0.5 shrink-0" />
          <span>{{ operationError || registryError }}</span>
        </div>
      </div>
    </template>

    <template #empty-actions>
      <Button
        size="sm"
        :disabled="mcpUnavailable"
        @click="emit('create')"
      >
        <PlusIcon data-icon="inline-start" />
        添加服务器
      </Button>
    </template>

    <SettingsListItem
      v-for="server in servers"
      :key="server.id"
    >
      <template #title>
        {{ server.name }}
      </template>

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

        <SettingsListIconButton
          label="刷新服务器"
          :icon="RefreshCwIcon"
          :icon-class="cn(isPending(`refresh:${server.id}`) && 'animate-spin')"
          :disabled="isServerPending(server.id) || mcpUnavailable"
          @click="emit('refresh', server.id)"
        />
        <SettingsListIconButton
          label="编辑服务器"
          :icon="PencilIcon"
          :disabled="isServerPending(server.id)"
          @click="emit('edit', server)"
        />
        <Button
          variant="outline"
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
    </SettingsListItem>
  </SettingsListSection>
</template>

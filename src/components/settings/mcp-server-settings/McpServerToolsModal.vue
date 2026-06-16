<script setup lang="ts">
import { GlobeIcon, TerminalIcon, WrenchIcon } from 'lucide-vue-next'
import { computed } from 'vue'
import type {
  BridgeMcpDiscoveredToolSummary,
  BridgeMcpSafeTransport,
  BridgeMcpServerSummary,
} from '@/bridge/app'
import { Badge, type BadgeVariants } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const open = defineModel<boolean>('open', { required: true })

const props = defineProps<{
  server?: BridgeMcpServerSummary
}>()

const tools = computed(() => props.server?.tools ?? [])
const transportLabel = computed(() => {
  if (!props.server) return ''
  return props.server.transport.type === 'stdio' ? '本地命令' : 'HTTP'
})
const transportIcon = computed(() => {
  if (!props.server) return WrenchIcon
  return props.server.transport.type === 'stdio' ? TerminalIcon : GlobeIcon
})
const transportTarget = computed(() => transportTargetOf(props.server?.transport))

function transportTargetOf(transport: BridgeMcpSafeTransport | undefined) {
  if (!transport) return ''
  return transport.type === 'stdio' ? transport.command : transport.url
}

function riskLabel(risk: BridgeMcpDiscoveredToolSummary['risk'] | string) {
  const labels: Record<string, string> = {
    safe: '安全',
    read: '读取',
    network: '网络',
    write: '写入',
    exec: '执行',
  }
  return labels[risk] || risk
}

function riskVariant(
  risk: BridgeMcpDiscoveredToolSummary['risk'] | string
): BadgeVariants['variant'] {
  return ['write', 'exec', 'network'].includes(risk) ? 'destructive' : 'outline'
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle>
          {{ server?.name ?? 'MCP 服务器' }} 工具
        </DialogTitle>
        <DialogDescription>
          <span class="flex flex-wrap items-center gap-2">
            <Badge variant="outline">
              <component
                :is="transportIcon"
                data-icon="inline-start"
              />
              {{ transportLabel }}
            </Badge>
            <span
              v-if="transportTarget"
              class="truncate text-xs text-muted-foreground"
            >
              {{ transportTarget }}
            </span>
          </span>
        </DialogDescription>
      </DialogHeader>

      <div class="max-h-[65vh] overflow-y-auto">
        <div
          v-if="tools.length"
          class="grid grid-cols-1 gap-2 xl:grid-cols-2"
        >
          <div
            v-for="tool in tools"
            :key="`${server?.id ?? ''}:${tool.providerName}`"
            class="flex min-w-0 flex-col gap-2 rounded-md border bg-background/40 px-3 py-2"
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
            <p class="line-clamp-3 text-sm text-muted-foreground">
              {{ tool.description || '未提供描述。' }}
            </p>
            <div
              v-if="tool.profiles.length"
              class="flex flex-wrap gap-1"
            >
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

        <div
          v-else
          class="flex flex-col items-center justify-center gap-3 rounded-md border px-4 py-10 text-center text-sm text-muted-foreground"
        >
          <WrenchIcon class="size-8 opacity-50" />
          <div class="flex flex-col gap-1">
            <p class="font-medium text-foreground">当前没有可展示的 MCP 工具。</p>
            <p>启动 MCP 服务器或刷新后，发现到的工具会显示在这里。</p>
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>

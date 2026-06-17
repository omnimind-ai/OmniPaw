<script setup lang="ts">
import { GlobeIcon, TerminalIcon, WrenchIcon } from 'lucide-vue-next'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
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

const { t } = useI18n()

const tools = computed(() => props.server?.tools ?? [])
const transportLabel = computed(() => {
  if (!props.server) return ''
  return props.server.transport.type === 'stdio'
    ? t('settings.mcpServer.transportLabels.stdio')
    : t('settings.mcpServer.transportLabels.http')
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
    safe: t('settings.mcpServer.tools.riskLabels.safe'),
    read: t('settings.mcpServer.tools.riskLabels.read'),
    network: t('settings.mcpServer.tools.riskLabels.network'),
    write: t('settings.mcpServer.tools.riskLabels.write'),
    exec: t('settings.mcpServer.tools.riskLabels.exec'),
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
          {{ server?.name ?? t('settings.mcpServer.tools.title') }} {{ t('settings.mcpServer.tools.title') }}
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
                {{ tool.enabled ? t('settings.mcpServer.tools.toolAvailable') : t('settings.mcpServer.tools.toolUnavailable') }}
              </Badge>
            </div>
            <p class="line-clamp-3 text-sm text-muted-foreground">
              {{ tool.description || t('settings.mcpServer.tools.noDescription') }}
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
            <p class="font-medium text-foreground">{{ t('settings.mcpServer.tools.noToolsTitle') }}</p>
            <p>{{ t('settings.mcpServer.tools.noToolsDesc') }}</p>
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>

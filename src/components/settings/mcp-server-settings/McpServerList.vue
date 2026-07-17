<script setup lang="ts">
import {
  AlertCircleIcon,
  GlobeIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  ServerIcon,
  SlidersHorizontalIcon,
  TerminalIcon,
  Trash2Icon,
  WrenchIcon,
  XIcon,
} from '@lucide/vue'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { BridgeMcpSafeTransport, BridgeMcpServerSummary } from '@/bridge/app'

import SettingsPanelHeader from '@/components/settings/common/SettingsPanelHeader.vue'
import SettingsPanelItem from '@/components/settings/common/SettingsPanelItem.vue'
import SettingsSearchBar from '@/components/settings/common/SettingsSearchBar.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

const props = defineProps<{
  servers: BridgeMcpServerSummary[]
  builtinToolCount: number
  enabledBuiltinToolCount: number
  loading: boolean
  showSkeleton: boolean
  anyPending: boolean
  mcpUnavailable: boolean
  toolsUnavailable: boolean
  fallbackRuntime: boolean
  operationError: string
  registryError: string
  isPending: (key: string) => boolean
  isServerPending: (serverId: string) => boolean
}>()

const emit = defineEmits<{
  create: []
  builtinTools: []
  refresh: [serverId?: string]
  edit: [server: BridgeMcpServerSummary]
  enable: [server: BridgeMcpServerSummary, enabled: boolean]
  delete: [server: BridgeMcpServerSummary]
  details: [server: BridgeMcpServerSummary]
}>()

const { t } = useI18n()

const searchQuery = ref('')
const filteredServers = computed(() => {
  const query = normalizeSearchText(searchQuery.value)
  if (!query) return props.servers
  return props.servers.filter((server) =>
    normalizeSearchText(serverSearchText(server)).includes(query)
  )
})
const searchEmpty = computed(() => props.servers.length > 0 && filteredServers.value.length === 0)

function transportLabel(transport: BridgeMcpSafeTransport) {
  return transport.type === 'stdio'
    ? t('settings.mcpServer.transportLabels.stdio')
    : t('settings.mcpServer.transportLabels.http')
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
      transport.localExecution ? t('settings.mcpServer.transportProcessExecution') : undefined,
      transport.args.length
        ? `${transport.args.length} ${t('settings.mcpServer.transportArgsCount')}`
        : t('settings.mcpServer.transportNoArgs'),
      transport.cwd ? `cwd: ${transport.cwd}` : t('settings.mcpServer.transportDefaultCwd'),
      transport.envKeys.length
        ? `${t('settings.mcpServer.transportEnvVars')}: ${transport.envKeys.join(', ')}`
        : t('settings.mcpServer.transportNoEnv'),
    ].filter(Boolean) as string[]
  }

  return [
    transport.headerKeys.length
      ? `${t('settings.mcpServer.transportHeaders')}: ${transport.headerKeys.join(', ')}`
      : t('settings.mcpServer.transportNoHeaders'),
  ]
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
        :title="t('settings.mcpServer.title')"
        :icon="ServerIcon"
      />

      <SettingsSearchBar
        v-model="searchQuery"
        class="border-b-0"
        :label="t('settings.mcpServer.searchLabel')"
        :placeholder="t('settings.mcpServer.searchPlaceholder')"
        :clear-label="t('settings.mcpServer.searchClearLabel')"
      >
        <template #summary>
          <Badge variant="secondary">
            {{ servers.length }} {{ t('settings.mcpServer.summaryCount') }}
          </Badge>
        </template>

        <template #actions>
          <Button
            type="button"
            variant="outline"
            :disabled="toolsUnavailable"
            @click="emit('builtinTools')"
          >
            <SlidersHorizontalIcon data-icon="inline-start" />
            {{ t('settings.mcpServer.builtinToolsButton') }} {{ enabledBuiltinToolCount }}/{{ builtinToolCount }}
          </Button>
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
            {{ t('settings.mcpServer.refreshButton') }}
          </Button>
          <Button
            type="button"
            :disabled="mcpUnavailable"
            @click="emit('create')"
          >
            <PlusIcon data-icon="inline-start" />
            {{ t('settings.mcpServer.addServerButton') }}
          </Button>
        </template>
      </SettingsSearchBar>

      <CardContent class="flex min-h-0 flex-1 flex-col overflow-y-auto p-0">
        <div class="flex min-h-full flex-1 flex-col">
          <div
            v-if="mcpUnavailable"
            class="shrink-0 border-b px-4 py-4 text-sm text-muted-foreground sm:px-5"
          >
            {{ t('settings.mcpServer.mcpUnavailableMsg') }}
          </div>

          <div
            v-if="toolsUnavailable"
            class="shrink-0 border-b px-4 py-4 text-sm text-muted-foreground sm:px-5"
          >
            {{ t('settings.mcpServer.toolsUnavailableMsg') }}
          </div>

          <div
            v-if="fallbackRuntime"
            class="shrink-0 border-b px-4 py-3 text-sm text-muted-foreground sm:px-5"
          >
            {{ t('settings.mcpServer.fallbackRuntimeMsg') }}
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
              <p class="font-medium text-foreground">{{ t('settings.mcpServer.noServersTitle') }}</p>
              <p>{{ t('settings.mcpServer.noServersDesc') }}</p>
            </div>
            <Button
              type="button"
              size="sm"
              :disabled="mcpUnavailable"
              @click="emit('create')"
            >
              <PlusIcon data-icon="inline-start" />
              {{ t('settings.mcpServer.addServerButton') }}
            </Button>
          </div>

          <div
            v-else-if="searchEmpty"
            class="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-10 text-center text-sm text-muted-foreground sm:px-5"
          >
            <SearchIcon class="size-8 opacity-50" />
            <div class="flex flex-col gap-1">
              <p class="font-medium text-foreground">{{ t('settings.mcpServer.noMatchTitle') }}</p>
              <p>{{ t('settings.mcpServer.noMatchDesc') }}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              @click="clearSearch"
            >
              <XIcon data-icon="inline-start" />
              {{ t('settings.mcpServer.clearSearchButton') }}
            </Button>
          </div>

          <div
            v-else
            class="flex flex-1 flex-col gap-3 px-4 py-4 sm:px-5"
          >
            <div class="flex flex-col gap-3">
              <SettingsPanelItem
                v-for="server in filteredServers"
                :key="server.id"
                :title="server.name"
                :description="transportTarget(server.transport)"
                :icon="transportIcon(server.transport)"
                :pending="isServerPending(server.id)"
              >
                <template #actions>
                  <Switch
                    :id="`mcp-enabled-${server.id}`"
                    size="sm"
                    :model-value="server.enabled"
                    :disabled="isServerPending(server.id) || mcpUnavailable"
                    :aria-label="`${server.enabled ? t('settings.mcpServer.enabledSwitch') : t('settings.mcpServer.disabledSwitch')} ${server.name}`"
                    @update:model-value="emit('enable', server, $event)"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    :aria-label="`${t('settings.mcpServer.toolsCountLabel')} ${server.tools.length}`"
                    :title="`${t('settings.mcpServer.toolsCountLabel')} ${server.tools.length}`"
                    @click="emit('details', server)"
                  >
                    <WrenchIcon />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    :aria-label="t('settings.mcpServer.refreshServerLabel')"
                    :title="t('settings.mcpServer.refreshServerLabel')"
                    :disabled="isServerPending(server.id) || mcpUnavailable"
                    @click="emit('refresh', server.id)"
                  >
                    <RefreshCwIcon
                      :class="cn(isPending(`refresh:${server.id}`) && 'animate-spin')"
                    />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    :aria-label="t('settings.mcpServer.editServerLabel')"
                    :title="t('settings.mcpServer.editServerLabel')"
                    :disabled="isServerPending(server.id)"
                    @click="emit('edit', server)"
                  >
                    <PencilIcon />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    :disabled="isServerPending(server.id) || mcpUnavailable"
                    :aria-label="t('settings.mcpServer.deleteAriaLabel')"
                    :title="t('settings.mcpServer.deleteAriaLabel')"
                    @click="emit('delete', server)"
                  >
                    <Trash2Icon />
                  </Button>
                </template>

                <div
                  v-if="server.error"
                  class="mt-3 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {{ server.error }}
                </div>
              </SettingsPanelItem>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
</template>

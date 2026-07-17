<script setup lang="ts">
import { GlobeIcon, PencilIcon, TerminalIcon, WrenchIcon, XIcon } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type {
  BridgeMcpDiscoveredToolSummary,
  BridgeMcpSafeTransport,
  BridgeMcpServerSummary,
} from '@/bridge/app'
import { Badge, type BadgeVariants } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

const open = defineModel<boolean>('open', { required: true })

const props = defineProps<{
  server?: BridgeMcpServerSummary
}>()

const emit = defineEmits<{
  edit: [server: BridgeMcpServerSummary]
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

function transportTargetOf(transport: BridgeMcpSafeTransport | undefined): string {
  if (!transport) return ''
  return transport.type === 'stdio' ? transport.command : transport.url
}

function riskLabel(risk: BridgeMcpDiscoveredToolSummary['risk'] | string): string {
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

function formatTime(value: number): string {
  return new Date(value).toLocaleString()
}

function editServer(): void {
  if (!props.server) return
  open.value = false
  emit('edit', props.server)
}
</script>

<template>
  <Sheet v-model:open="open">
    <SheetContent
      side="right"
      class="w-full gap-0 p-0 sm:max-w-xl"
      :show-close-button="false"
    >
      <SheetHeader class="flex-row items-start gap-3 px-5 py-4 text-left">
        <div class="min-w-0 flex-1">
          <SheetTitle>
            {{ server?.name ?? t('settings.mcpServer.tools.title') }}
          </SheetTitle>
          <SheetDescription class="flex items-center gap-2">
            <component
              :is="transportIcon"
              class="size-4"
              aria-hidden="true"
            />
            <span>{{ transportLabel }}</span>
            <span
              v-if="transportTarget"
              class="truncate"
            >
              · {{ transportTarget }}
            </span>
          </SheetDescription>
        </div>
        <SheetClose as-child>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            :aria-label="t('settings.mcpServer.tools.close')"
          >
            <XIcon />
          </Button>
        </SheetClose>
      </SheetHeader>

      <Separator />

      <div
        v-if="server"
        class="min-h-0 flex-1 overflow-y-auto px-5 py-5"
      >
        <FieldGroup>
          <div class="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">
              {{ t(`settings.mcpServer.statusLabels.${server.status}`) }}
            </Badge>
            <Badge variant="outline">
              {{ server.enabled ? t('settings.mcpServer.serverEnabledBadge') : t('settings.mcpServer.serverDisabledBadge') }}
            </Badge>
          </div>

          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field class="rounded-md border px-3 py-2">
              <FieldLabel>{{ t('settings.mcpServer.tools.connectionTimeout') }}</FieldLabel>
              <FieldDescription>{{ server.timeoutMs }} ms</FieldDescription>
            </Field>
            <Field class="rounded-md border px-3 py-2">
              <FieldLabel>{{ t('settings.mcpServer.tools.toolTimeout') }}</FieldLabel>
              <FieldDescription>{{ server.toolTimeoutMs }} ms</FieldDescription>
            </Field>
            <Field class="rounded-md border px-3 py-2">
              <FieldLabel>{{ t('settings.mcpServer.tools.createdAt') }}</FieldLabel>
              <FieldDescription>{{ formatTime(server.createdAt) }}</FieldDescription>
            </Field>
            <Field class="rounded-md border px-3 py-2">
              <FieldLabel>{{ t('settings.mcpServer.tools.updatedAt') }}</FieldLabel>
              <FieldDescription>{{ formatTime(server.updatedAt) }}</FieldDescription>
            </Field>
          </div>

          <Field v-if="server.error" data-invalid>
            <FieldLabel class="text-destructive">
              {{ t('settings.mcpServer.tools.error') }}
            </FieldLabel>
            <FieldDescription class="text-destructive">
              {{ server.error }}
            </FieldDescription>
          </Field>

          <Separator />

          <div class="flex items-center justify-between gap-3">
            <h3 class="text-sm font-semibold">{{ t('settings.mcpServer.tools.title') }}</h3>
            <span class="text-sm text-muted-foreground">{{ tools.length }}</span>
          </div>

          <div
            v-if="tools.length"
            class="flex flex-col gap-2"
          >
            <article
              v-for="tool in tools"
              :key="`${server.id}:${tool.providerName}`"
              class="flex min-w-0 flex-col gap-2 rounded-md border bg-background/40 px-3 py-3"
            >
              <div class="flex flex-wrap items-center gap-2">
                <span class="truncate text-sm font-medium">
                  {{ tool.label || tool.name }}
                </span>
                <Badge :variant="riskVariant(tool.risk)">
                  {{ riskLabel(tool.risk) }}
                </Badge>
                <Badge :variant="tool.enabled ? 'secondary' : 'outline'">
                  {{ tool.enabled ? t('settings.mcpServer.tools.toolAvailable') : t('settings.mcpServer.tools.toolUnavailable') }}
                </Badge>
              </div>
              <p class="text-sm text-muted-foreground">
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
            </article>
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
        </FieldGroup>
      </div>

      <Separator />
      <SheetFooter class="grid grid-cols-2 p-4">
        <SheetClose as-child>
          <Button
            type="button"
            variant="outline"
          >
            {{ t('settings.mcpServer.tools.close') }}
          </Button>
        </SheetClose>
        <Button
          type="button"
          :disabled="!server"
          @click="editServer"
        >
          <PencilIcon data-icon="inline-start" />
          {{ t('settings.mcpServer.editServerLabel') }}
        </Button>
      </SheetFooter>
    </SheetContent>
  </Sheet>
</template>

<script setup lang="ts">
import { SlidersHorizontalIcon, WrenchIcon } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import type { BridgeManagedToolInfo } from '@/bridge/app'
import { Badge, type BadgeVariants } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Switch } from '@/components/ui/switch'

const open = defineModel<boolean>('open', { required: true })

defineProps<{
  tools: BridgeManagedToolInfo[]
  pending: (key: string) => boolean
  disabled: boolean
}>()

const emit = defineEmits<{
  enable: [tool: BridgeManagedToolInfo, enabled: boolean]
}>()

const { t } = useI18n()

function riskLabel(risk: string) {
  const labels: Record<string, string> = {
    safe: t('settings.mcpServer.builtin.riskLabels.safe'),
    read: t('settings.mcpServer.builtin.riskLabels.read'),
    network: t('settings.mcpServer.builtin.riskLabels.network'),
    write: t('settings.mcpServer.builtin.riskLabels.write'),
    exec: t('settings.mcpServer.builtin.riskLabels.exec'),
  }
  return labels[risk] || risk
}

function riskVariant(risk: string): BadgeVariants['variant'] {
  return ['write', 'exec', 'network'].includes(risk) ? 'destructive' : 'outline'
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle>{{ t('settings.mcpServer.builtin.title') }}</DialogTitle>
        <DialogDescription>
          {{ t('settings.mcpServer.builtin.description') }}
        </DialogDescription>
      </DialogHeader>

      <FieldGroup class="max-h-[65vh] gap-0 overflow-y-auto rounded-md border">
        <Field
          v-for="tool in tools"
          :key="tool.name"
          orientation="responsive"
          class="border-b px-4 py-3 last:border-b-0"
          :data-disabled="pending(`tool:${tool.name}`) || disabled ? '' : undefined"
        >
          <FieldContent>
            <FieldLabel :for="`builtin-tool-enabled-${tool.name}`">
              <span class="flex min-w-0 flex-wrap items-center gap-2">
                <WrenchIcon data-icon="inline-start" />
                <span>{{ tool.label || tool.name }}</span>
                <Badge variant="outline">{{ tool.name }}</Badge>
                <Badge :variant="riskVariant(tool.risk)">
                  {{ riskLabel(tool.risk) }}
                </Badge>
              </span>
            </FieldLabel>
            <FieldDescription>
              {{ tool.description }}
            </FieldDescription>
            <div class="flex flex-wrap gap-1 pt-1">
              <Badge
                v-for="profile in tool.profiles"
                :key="profile"
                variant="outline"
              >
                {{ profile }}
              </Badge>
            </div>
          </FieldContent>
          <Switch
            :id="`builtin-tool-enabled-${tool.name}`"
            :model-value="tool.enabled"
            :disabled="pending(`tool:${tool.name}`) || disabled"
            :aria-label="`${tool.enabled ? t('settings.mcpServer.builtin.toolEnabledSwitch') : t('settings.mcpServer.builtin.toolDisabledSwitch')} ${tool.label || tool.name}`"
            @update:model-value="emit('enable', tool, $event)"
          />
        </Field>

        <Field
          v-if="!tools.length"
          class="px-4 py-6"
        >
          <FieldContent>
            <FieldLabel>
              <span class="flex items-center gap-2">
                <SlidersHorizontalIcon data-icon="inline-start" />
                {{ t('settings.mcpServer.builtin.noTools') }}
              </span>
            </FieldLabel>
            <FieldDescription>{{ t('settings.mcpServer.builtin.noToolsDesc') }}</FieldDescription>
          </FieldContent>
        </Field>
      </FieldGroup>
    </DialogContent>
  </Dialog>
</template>

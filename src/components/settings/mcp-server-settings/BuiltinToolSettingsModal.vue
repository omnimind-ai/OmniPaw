<script setup lang="ts">
import { SlidersHorizontalIcon, WrenchIcon } from 'lucide-vue-next'
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

function riskVariant(risk: string): BadgeVariants['variant'] {
  return ['write', 'exec', 'network'].includes(risk) ? 'destructive' : 'outline'
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle>内置工具</DialogTitle>
        <DialogDescription>
          调整 OpenOmniClaw 内置工具是否参与 Agent 工具清单。
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
            :aria-label="`${tool.enabled ? '停用' : '启用'} ${tool.label || tool.name}`"
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
                暂无内置工具
              </span>
            </FieldLabel>
            <FieldDescription>内置工具清单尚未加载。</FieldDescription>
          </FieldContent>
        </Field>
      </FieldGroup>
    </DialogContent>
  </Dialog>
</template>

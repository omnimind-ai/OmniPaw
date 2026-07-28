<script setup lang="ts">
import { BrainCircuitIcon, ImageIcon, RadioTowerIcon, WrenchIcon } from '@lucide/vue'
import type { Component } from 'vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

const props = defineProps<{
  supportsStreaming?: boolean
  supportsTools?: boolean
  supportsReasoning?: boolean
  supportsVision?: boolean
}>()

const { t } = useI18n()

interface CapabilityBadge {
  key: 'streaming' | 'tools' | 'reasoning' | 'vision'
  label: string
  icon: Component
  toneClass: string
}

const capabilityBadges = computed<CapabilityBadge[]>(() =>
  [
    props.supportsStreaming && {
      key: 'streaming' as const,
      label: t('settings.provider.models.item.streaming'),
      icon: RadioTowerIcon,
      toneClass:
        'border-transparent bg-model-capability-streaming/15 text-model-capability-streaming',
    },
    props.supportsTools && {
      key: 'tools' as const,
      label: t('settings.provider.models.item.tools'),
      icon: WrenchIcon,
      toneClass: 'border-transparent bg-model-capability-tools/15 text-model-capability-tools',
    },
    props.supportsReasoning && {
      key: 'reasoning' as const,
      label: t('settings.provider.models.item.reasoning'),
      icon: BrainCircuitIcon,
      toneClass:
        'border-transparent bg-model-capability-reasoning/15 text-model-capability-reasoning',
    },
    props.supportsVision && {
      key: 'vision' as const,
      label: t('settings.provider.models.item.vision'),
      icon: ImageIcon,
      toneClass: 'border-transparent bg-model-capability-vision/15 text-model-capability-vision',
    },
  ].filter((value): value is CapabilityBadge => Boolean(value))
)
</script>

<template>
  <TooltipProvider
    v-if="capabilityBadges.length"
    :delay-duration="120"
  >
    <div class="flex shrink-0 items-center gap-1">
      <Tooltip
        v-for="capability in capabilityBadges"
        :key="capability.key"
      >
        <TooltipTrigger as-child>
          <Badge
            as="span"
            variant="outline"
            role="img"
            tabindex="0"
            :aria-label="capability.label"
            :class="cn('size-6 rounded-full p-0', capability.toneClass)"
          >
            <component
              :is="capability.icon"
              aria-hidden="true"
            />
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {{ capability.label }}
        </TooltipContent>
      </Tooltip>
    </div>
  </TooltipProvider>
</template>

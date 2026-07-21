<script setup lang="ts">
import {
  BrainCircuitIcon,
  ChevronDownIcon,
  RadioTowerIcon,
  Trash2Icon,
  WrenchIcon,
} from '@lucide/vue'
import type { Component } from 'vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { ModelInput, ProviderModelDraft } from './types'

const { t } = useI18n()

const props = defineProps<{
  model: ProviderModelDraft
  index: number
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [open: boolean]
  remove: []
  'set-optional-number': [key: 'contextWindow' | 'maxOutputTokens', value: string | number]
  'update-model-input': [input: ModelInput, checked: boolean | 'indeterminate']
}>()

const modelInputs: ModelInput[] = ['text', 'image', 'audio', 'file']

interface CapabilityBadge {
  key: 'streaming' | 'tools' | 'reasoning'
  label: string
  icon: Component
  toneClass: string
}

const capabilityBadges = computed<CapabilityBadge[]>(() =>
  [
    props.model.supportsStreaming && {
      key: 'streaming' as const,
      label: t('settings.provider.models.item.streaming'),
      icon: RadioTowerIcon,
      toneClass:
        'border-transparent bg-model-capability-streaming/15 text-model-capability-streaming',
    },
    props.model.supportsTools && {
      key: 'tools' as const,
      label: t('settings.provider.models.item.tools'),
      icon: WrenchIcon,
      toneClass: 'border-transparent bg-model-capability-tools/15 text-model-capability-tools',
    },
    props.model.supportsReasoning && {
      key: 'reasoning' as const,
      label: t('settings.provider.models.item.reasoning'),
      icon: BrainCircuitIcon,
      toneClass:
        'border-transparent bg-model-capability-reasoning/15 text-model-capability-reasoning',
    },
  ].filter((value): value is CapabilityBadge => Boolean(value))
)

function isModelInputChecked(input: ModelInput) {
  return props.model.input.includes(input)
}
</script>

<template>
  <Collapsible
    :open="open"
    class="rounded-lg border"
    @update:open="emit('update:open', $event)"
  >
    <div class="flex items-start gap-3 p-3">
      <CollapsibleTrigger as-child>
        <button
          type="button"
          class="group flex min-w-0 flex-1 items-start gap-3 text-left"
        >
          <ChevronDownIcon
            class="mt-0.5 shrink-0 transition-transform group-data-[state=closed]:-rotate-90"
            aria-hidden="true"
          />
          <span class="min-w-0 flex-1 overflow-hidden">
            <span class="flex min-w-0 flex-wrap items-center gap-2">
              <span class="truncate text-sm font-medium">
                {{ model.name || model.remoteId || t('settings.provider.models.item.unnamed') }}
              </span>
            </span>
            <span
              v-if="model.remoteId"
              class="mt-1 block min-w-0 truncate text-xs text-muted-foreground"
            >
              {{ model.remoteId }}
            </span>
          </span>
        </button>
      </CollapsibleTrigger>

      <div class="flex shrink-0 items-center gap-2 pt-0.5">
        <TooltipProvider
          v-if="capabilityBadges.length"
          :delay-duration="120"
        >
          <div class="flex items-center gap-1">
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

        <Switch
          :id="`model-enabled-${index}`"
          v-model="model.enabled"
          :aria-label="t('settings.provider.models.item.enable')"
          @click.stop
        />
        <FieldLabel
          :for="`model-enabled-${index}`"
          class="sr-only"
        >
          {{ t('settings.provider.models.item.enable') }}
        </FieldLabel>

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          :aria-label="t('settings.provider.models.item.remove')"
          @click="emit('remove')"
        >
          <Trash2Icon />
        </Button>
      </div>
    </div>

    <CollapsibleContent>
      <div class="flex flex-col gap-4 border-t p-4">
        <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Field>
            <FieldLabel :for="`model-name-${index}`">{{ t('settings.provider.models.item.displayName') }}</FieldLabel>
            <Input
              :id="`model-name-${index}`"
              v-model="model.name"
            />
          </Field>
          <Field>
            <FieldLabel :for="`model-remote-${index}`">{{ t('settings.provider.models.item.remoteId') }}</FieldLabel>
            <Input
              :id="`model-remote-${index}`"
              v-model="model.remoteId"
            />
          </Field>
        </div>

        <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Field>
            <FieldLabel :for="`model-context-${index}`">{{ t('settings.provider.models.item.contextWindow') }}</FieldLabel>
            <Input
              :id="`model-context-${index}`"
              type="number"
              min="0"
              :model-value="model.contextWindow ?? ''"
              @update:model-value="emit('set-optional-number', 'contextWindow', $event)"
            />
          </Field>
          <Field>
            <FieldLabel :for="`model-output-${index}`">{{ t('settings.provider.models.item.maxOutputTokens') }}</FieldLabel>
            <Input
              :id="`model-output-${index}`"
              type="number"
              min="0"
              :model-value="model.maxOutputTokens ?? ''"
              @update:model-value="emit('set-optional-number', 'maxOutputTokens', $event)"
            />
          </Field>
        </div>

        <FieldSet>
          <FieldLegend variant="label">{{ t('settings.provider.models.item.inputCapabilities') }}</FieldLegend>
          <FieldGroup
            data-slot="checkbox-group"
            class="grid grid-cols-2 gap-3 md:grid-cols-4"
          >
            <Field
              v-for="input in modelInputs"
              :key="input"
              orientation="horizontal"
              class="items-center"
            >
              <Checkbox
                :id="`model-${index}-${input}`"
                :model-value="isModelInputChecked(input)"
                @update:model-value="emit('update-model-input', input, $event)"
              />
              <FieldLabel :for="`model-${index}-${input}`">
                {{ input }}
              </FieldLabel>
            </Field>
          </FieldGroup>
        </FieldSet>
      </div>
    </CollapsibleContent>
  </Collapsible>
</template>

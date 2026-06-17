<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { BridgeDesktopSettingsConfig } from '@/bridge/app'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

const { t } = useI18n()

const open = defineModel<boolean>('open', { required: true })

const props = defineProps<{
  draft: BridgeDesktopSettingsConfig
}>()

const memorySettings = computed(() => props.draft.app.memory)
const minConfidencePercent = computed({
  get: () => Math.round(memorySettings.value.minConfidence * 100),
  set: (value: string | number) => {
    memorySettings.value.minConfidence = clampInteger(value, 0, 100) / 100
  },
})
const lowConfidenceReviewPercent = computed({
  get: () => Math.round(memorySettings.value.lowConfidenceReviewThreshold * 100),
  set: (value: string | number) => {
    memorySettings.value.lowConfidenceReviewThreshold = clampInteger(value, 0, 100) / 100
  },
})
const maxContextItems = computed({
  get: () => memorySettings.value.maxContextItems,
  set: (value: string | number) => {
    memorySettings.value.maxContextItems = clampInteger(value, 0, 24)
  },
})
const maxContextTokens = computed({
  get: () => memorySettings.value.maxContextTokens,
  set: (value: string | number) => {
    memorySettings.value.maxContextTokens = clampInteger(value, 0, 4000)
  },
})

function clampInteger(value: string | number, min: number, max: number): number {
  const next = Math.round(Number(value))
  if (!Number.isFinite(next)) return min
  return Math.min(max, Math.max(min, next))
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{{ t('settings.memory.policyModal.title') }}</DialogTitle>
        <DialogDescription>
          {{ t('settings.memory.policyModal.description') }}
        </DialogDescription>
      </DialogHeader>

      <FieldGroup class="gap-0 rounded-md border">
        <Field
          orientation="responsive"
          class="border-b px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="memory-enabled">{{ t('settings.memory.policyModal.enabled') }}</FieldLabel>
            <FieldDescription>{{ t('settings.memory.policyModal.enabledDescription') }}</FieldDescription>
          </FieldContent>
          <Switch
            id="memory-enabled"
            v-model="memorySettings.enabled"
            :aria-label="t('settings.memory.policyModal.enabled')"
          />
        </Field>

        <Field
          orientation="responsive"
          class="border-b px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="memory-semantic-extraction">{{ t('settings.memory.policyModal.semanticExtraction') }}</FieldLabel>
            <FieldDescription>{{ t('settings.memory.policyModal.semanticExtractionDescription') }}</FieldDescription>
          </FieldContent>
          <Switch
            id="memory-semantic-extraction"
            v-model="memorySettings.semanticExtractionEnabled"
            :disabled="!memorySettings.enabled || !memorySettings.extractionEnabled"
            :aria-label="t('settings.memory.policyModal.semanticExtraction')"
          />
        </Field>

        <Field
          orientation="responsive"
          class="border-b px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="memory-tool-write">{{ t('settings.memory.policyModal.activeToolWrite') }}</FieldLabel>
            <FieldDescription>{{ t('settings.memory.policyModal.activeToolWriteDescription') }}</FieldDescription>
          </FieldContent>
          <Switch
            id="memory-tool-write"
            v-model="memorySettings.activeToolWriteEnabled"
            :disabled="!memorySettings.enabled"
            :aria-label="t('settings.memory.policyModal.activeToolWrite')"
          />
        </Field>

        <Field
          orientation="responsive"
          class="border-b px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="memory-maintenance">{{ t('settings.memory.policyModal.maintenance') }}</FieldLabel>
            <FieldDescription>{{ t('settings.memory.policyModal.maintenanceDescription') }}</FieldDescription>
          </FieldContent>
          <Switch
            id="memory-maintenance"
            v-model="memorySettings.maintenanceEnabled"
            :disabled="!memorySettings.enabled"
            :aria-label="t('settings.memory.policyModal.maintenance')"
          />
        </Field>

        <Field
          orientation="responsive"
          class="border-b px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="memory-destructive-confirm">{{ t('settings.memory.policyModal.destructiveConfirm') }}</FieldLabel>
            <FieldDescription>{{ t('settings.memory.policyModal.destructiveConfirmDescription') }}</FieldDescription>
          </FieldContent>
          <Switch
            id="memory-destructive-confirm"
            v-model="memorySettings.destructiveToolRequiresConfirmation"
            :disabled="!memorySettings.enabled"
            :aria-label="t('settings.memory.policyModal.destructiveConfirm')"
          />
        </Field>

        <Field
          orientation="responsive"
          class="border-b px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="memory-extraction">{{ t('settings.memory.policyModal.extraction') }}</FieldLabel>
            <FieldDescription>{{ t('settings.memory.policyModal.extractionDescription') }}</FieldDescription>
          </FieldContent>
          <Switch
            id="memory-extraction"
            v-model="memorySettings.extractionEnabled"
            :disabled="!memorySettings.enabled"
            :aria-label="t('settings.memory.policyModal.extraction')"
          />
        </Field>

        <Field
          orientation="responsive"
          class="border-b px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="memory-retrieval">{{ t('settings.memory.policyModal.retrieval') }}</FieldLabel>
            <FieldDescription>{{ t('settings.memory.policyModal.retrievalDescription') }}</FieldDescription>
          </FieldContent>
          <Switch
            id="memory-retrieval"
            v-model="memorySettings.retrievalEnabled"
            :disabled="!memorySettings.enabled"
            :aria-label="t('settings.memory.policyModal.retrieval')"
          />
        </Field>

        <Field
          orientation="responsive"
          class="border-b px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="memory-max-items">{{ t('settings.memory.policyModal.maxItems') }}</FieldLabel>
            <FieldDescription>{{ t('settings.memory.policyModal.maxItemsDescription') }}</FieldDescription>
          </FieldContent>
          <Input
            id="memory-max-items"
            v-model="maxContextItems"
            class="w-full md:w-48"
            type="number"
            min="0"
            max="24"
            step="1"
          />
        </Field>

        <Field
          orientation="responsive"
          class="border-b px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="memory-max-tokens">{{ t('settings.memory.policyModal.maxTokens') }}</FieldLabel>
            <FieldDescription>{{ t('settings.memory.policyModal.maxTokensDescription') }}</FieldDescription>
          </FieldContent>
          <Input
            id="memory-max-tokens"
            v-model="maxContextTokens"
            class="w-full md:w-48"
            type="number"
            min="0"
            max="4000"
            step="1"
          />
        </Field>

        <Field
          orientation="responsive"
          class="border-b px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="memory-min-confidence">{{ t('settings.memory.policyModal.minConfidence') }}</FieldLabel>
            <FieldDescription>{{ t('settings.memory.policyModal.minConfidenceDescription') }}</FieldDescription>
          </FieldContent>
          <Input
            id="memory-min-confidence"
            v-model="minConfidencePercent"
            class="w-full md:w-48"
            type="number"
            min="0"
            max="100"
            step="1"
          />
        </Field>

        <Field
          orientation="responsive"
          class="px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="memory-low-confidence">{{ t('settings.memory.policyModal.lowConfidenceReview') }}</FieldLabel>
            <FieldDescription>{{ t('settings.memory.policyModal.lowConfidenceReviewDescription') }}</FieldDescription>
          </FieldContent>
          <Input
            id="memory-low-confidence"
            v-model="lowConfidenceReviewPercent"
            class="w-full md:w-48"
            type="number"
            min="0"
            max="100"
            step="1"
          />
        </Field>
      </FieldGroup>

      <DialogFooter>
        <DialogClose as-child>
          <Button type="button">{{ t('settings.memory.policyModal.done') }}</Button>
        </DialogClose>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

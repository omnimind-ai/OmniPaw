<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { CompanionRole } from '@/components/settings/companion-role-settings/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
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

const open = defineModel<boolean>('open', { required: true })

const props = defineProps<{
  settings: CompanionRole['knowledgeSettings']
}>()

const emit = defineEmits<{
  submit: [settings: CompanionRole['knowledgeSettings']]
}>()

const { t } = useI18n()
const scanDepth = ref(8)
const maxTokens = ref(900)

watch(
  [open, () => props.settings],
  ([isOpen]) => {
    if (isOpen) {
      scanDepth.value = normalizeInteger(props.settings?.scanDepth, 8, 1, 40)
      maxTokens.value = normalizeInteger(props.settings?.maxTokens, 900, 200, 8000)
    }
  },
  { immediate: true }
)

function submit(): void {
  emit('submit', {
    scanDepth: normalizeInteger(scanDepth.value, 8, 1, 40),
    maxTokens: normalizeInteger(maxTokens.value, 900, 200, 8000),
  })
  open.value = false
}

function updateScanDepth(value: string | number): void {
  scanDepth.value = normalizeInteger(value, 8, 1, 40)
}

function updateMaxTokens(value: string | number): void {
  maxTokens.value = normalizeInteger(value, 900, 200, 8000)
}

function normalizeInteger(
  value: string | number | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(max, Math.max(min, Math.round(numeric)))
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{{ t('settings.catAppearance.role.knowledge.settingsModal.title') }}</DialogTitle>
        <DialogDescription>
          {{ t('settings.catAppearance.role.knowledge.settingsModal.description') }}
        </DialogDescription>
      </DialogHeader>

      <FieldGroup class="gap-0 rounded-md border">
        <Field
          orientation="responsive"
          class="border-b px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="role-knowledge-scan-depth">
              {{ t('settings.catAppearance.role.knowledge.settings.scanDepth') }}
            </FieldLabel>
            <FieldDescription>
              {{ t('settings.catAppearance.role.knowledge.settings.scanDepthDescription') }}
            </FieldDescription>
          </FieldContent>
          <Input
            id="role-knowledge-scan-depth"
            :model-value="scanDepth"
            class="w-full md:w-48"
            type="number"
            min="1"
            max="40"
            step="1"
            @update:model-value="updateScanDepth"
          />
        </Field>

        <Field
          orientation="responsive"
          class="px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="role-knowledge-max-tokens">
              {{ t('settings.catAppearance.role.knowledge.settings.maxTokens') }}
            </FieldLabel>
            <FieldDescription>
              {{ t('settings.catAppearance.role.knowledge.settings.maxTokensDescription') }}
            </FieldDescription>
          </FieldContent>
          <Input
            id="role-knowledge-max-tokens"
            :model-value="maxTokens"
            class="w-full md:w-48"
            type="number"
            min="200"
            max="8000"
            step="1"
            @update:model-value="updateMaxTokens"
          />
        </Field>
      </FieldGroup>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          @click="open = false"
        >
          {{ t('settings.catAppearance.role.knowledge.settingsModal.cancel') }}
        </Button>
        <Button
          type="button"
          @click="submit"
        >
          {{ t('settings.catAppearance.role.knowledge.settingsModal.save') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

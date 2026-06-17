<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
  FieldSet,
} from '@/components/ui/field'
import type { ProviderModelOption } from '@/stores/provider'

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  options: ProviderModelOption[]
  disabled: boolean
}>()

const emit = defineEmits<{
  confirm: [modelKeys: string[]]
}>()

const { t } = useI18n()

const selectedKeys = ref<string[]>([])
const selectedKeySet = computed(() => new Set(selectedKeys.value))
const confirmLabel = computed(() =>
  selectedKeys.value.length
    ? t('settings.defaultModel.fallback.confirmAdd', { count: selectedKeys.value.length })
    : t('settings.defaultModel.fallback.addButton')
)

watch(open, (value) => {
  if (value) {
    selectedKeys.value = []
  }
})

watch(
  () => props.options.map((option) => option.key),
  (keys) => {
    const available = new Set(keys)
    selectedKeys.value = selectedKeys.value.filter((key) => available.has(key))
  }
)

function toggleModel(modelKey: string, checked: boolean | 'indeterminate') {
  const selected = checked === true
  if (selected && !selectedKeySet.value.has(modelKey)) {
    selectedKeys.value = [...selectedKeys.value, modelKey]
    return
  }
  if (!selected) {
    selectedKeys.value = selectedKeys.value.filter((key) => key !== modelKey)
  }
}

function selectAll() {
  selectedKeys.value = props.options.map((option) => option.key)
}

function confirmSelection() {
  const selected = props.options
    .map((option) => option.key)
    .filter((key) => selectedKeySet.value.has(key))
  if (!selected.length) return

  emit('confirm', selected)
  open.value = false
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{{ t('settings.defaultModel.fallback.pickerTitle') }}</DialogTitle>
        <DialogDescription>
          {{ t('settings.defaultModel.fallback.pickerDescription') }}
        </DialogDescription>
      </DialogHeader>

      <FieldSet>
        <FieldGroup
          v-if="options.length"
          class="max-h-[55vh] gap-0 overflow-y-auto rounded-md border"
        >
          <Field
            v-for="option in options"
            :key="option.key"
            orientation="horizontal"
            class="border-b px-4 py-3 last:border-b-0"
            :data-disabled="disabled ? '' : undefined"
          >
            <Checkbox
              :id="`fallback-picker-${option.key}`"
              :model-value="selectedKeySet.has(option.key)"
              :disabled="disabled"
              @update:model-value="toggleModel(option.key, $event)"
            />
            <FieldContent class="min-w-0 gap-1">
              <FieldLabel
                :for="`fallback-picker-${option.key}`"
                class="flex min-w-0 flex-wrap items-center gap-2"
              >
                <span class="truncate">{{ option.modelName }}</span>
                <Badge variant="outline">{{ option.providerName }}</Badge>
              </FieldLabel>
              <FieldDescription class="truncate">
                {{ option.providerName }} / {{ option.modelId }}
              </FieldDescription>
            </FieldContent>
          </Field>
        </FieldGroup>

        <Field
          v-else
          class="rounded-md border px-4 py-6"
        >
          <FieldContent>
            <FieldLabel>{{ t('settings.defaultModel.fallback.noAddable') }}</FieldLabel>
            <FieldDescription>
              {{ t('settings.defaultModel.fallback.noAddableDesc') }}
            </FieldDescription>
          </FieldContent>
        </Field>
      </FieldSet>

      <DialogFooter class="gap-2">
        <Button
          type="button"
          variant="outline"
          :disabled="disabled || !options.length"
          @click="selectAll"
        >
          {{ t('settings.defaultModel.fallback.selectAll') }}
        </Button>
        <Button
          type="button"
          variant="outline"
          @click="open = false"
        >
          {{ t('settings.defaultModel.fallback.cancel') }}
        </Button>
        <Button
          type="button"
          :disabled="disabled || !selectedKeys.length"
          @click="confirmSelection"
        >
          {{ confirmLabel }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

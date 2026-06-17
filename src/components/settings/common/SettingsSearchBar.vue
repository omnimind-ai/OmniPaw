<script setup lang="ts">
import { SearchIcon, XIcon } from 'lucide-vue-next'
import type { HTMLAttributes } from 'vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group'
import { cn } from '@/lib/utils'

const props = defineProps<{
  modelValue: string
  placeholder?: string
  label?: string
  clearLabel?: string
  disabled?: boolean
  class?: HTMLAttributes['class']
  searchClass?: HTMLAttributes['class']
  actionsClass?: HTMLAttributes['class']
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  clear: []
}>()

const { t } = useI18n()

const placeholderText = computed(
  () => props.placeholder ?? t('settings.common.searchBar.placeholder')
)
const labelText = computed(() => props.label ?? t('settings.common.searchBar.label'))
const clearLabelText = computed(() => props.clearLabel ?? t('settings.common.searchBar.clearLabel'))

const searchValue = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', String(value)),
})
const hasSearchValue = computed(() => props.modelValue.trim().length > 0)

function clearSearch(): void {
  emit('update:modelValue', '')
  emit('clear')
}
</script>

<template>
  <div
    data-slot="settings-search-bar"
    :class="cn('flex flex-wrap items-center justify-between gap-4 border-b px-4 py-3 sm:px-5', props.class)"
  >
    <div :class="cn('flex min-w-[min(100%,18rem)] flex-1 flex-col gap-2 sm:max-w-md', searchClass)">
      <InputGroup class="h-8 bg-background/70">
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          v-model="searchValue"
          :aria-label="labelText"
          :placeholder="placeholderText"
          :disabled="disabled"
        />
        <InputGroupAddon
          v-if="hasSearchValue"
          align="inline-end"
        >
          <InputGroupButton
            size="icon-xs"
            :aria-label="clearLabelText"
            :disabled="disabled"
            @click="clearSearch"
          >
            <XIcon data-icon="inline-start" />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </div>

    <div
      v-if="$slots.summary || $slots.actions"
      :class="cn(
        'flex shrink-0 flex-wrap items-center justify-end gap-2 [&_[data-slot=badge]]:h-8 [&_[data-slot=badge]]:rounded-lg [&_[data-slot=badge]]:px-3 [&_[data-slot=badge]]:text-sm [&_[data-slot=button]]:h-8',
        actionsClass,
      )"
    >
      <slot name="summary" />
      <slot name="actions" />
    </div>
  </div>
</template>

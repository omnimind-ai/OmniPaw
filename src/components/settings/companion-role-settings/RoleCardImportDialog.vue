<script setup lang="ts">
import { FileJsonIcon } from 'lucide-vue-next'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

const props = defineProps<{
  open: boolean
  jsonContent: string
  importDisabled: boolean
  canImportJson: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'update:jsonContent': [value: string]
  chooseFile: []
  importJson: []
}>()

const { t } = useI18n()

const jsonContentModel = computed({
  get: () => props.jsonContent,
  set: (value: string) => emit('update:jsonContent', value),
})
</script>

<template>
  <Dialog
    :open="open"
    @update:open="emit('update:open', $event)"
  >
    <DialogContent class="sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>{{ t('settings.catAppearance.role.importDialog.title') }}</DialogTitle>
        <DialogDescription>
          {{ t('settings.catAppearance.role.importDialog.description') }}
        </DialogDescription>
      </DialogHeader>

      <div class="flex flex-col gap-3">
        <Textarea
          v-model="jsonContentModel"
          class="min-h-52 font-mono text-xs"
          :placeholder="t('settings.catAppearance.role.importDialog.jsonPlaceholder')"
        />
      </div>

      <DialogFooter class="gap-2 sm:justify-between">
        <Button
          type="button"
          variant="outline"
          :disabled="importDisabled"
          @click="emit('chooseFile')"
        >
          <FileJsonIcon data-icon="inline-start" />
          {{ t('settings.catAppearance.role.importDialog.chooseFile') }}
        </Button>
        <Button
          type="button"
          :disabled="!canImportJson"
          @click="emit('importJson')"
        >
          {{ t('settings.catAppearance.role.importDialog.importJson') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

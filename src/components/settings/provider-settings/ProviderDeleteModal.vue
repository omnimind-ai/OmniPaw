<script setup lang="ts">
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

const { t } = useI18n()
const open = defineModel<boolean>('open', { default: false })

defineProps<{
  providerName: string
  saving: boolean
}>()

const emit = defineEmits<{
  confirm: []
}>()
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ t('settings.provider.delete.title') }}</DialogTitle>
        <DialogDescription>
          {{ t('settings.provider.delete.description', { name: providerName }) }}
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          @click="open = false"
        >
          {{ t('settings.provider.cancelButton') }}
        </Button>
        <Button
          type="button"
          variant="destructive"
          :disabled="saving"
          @click="emit('confirm')"
        >
          {{ t('settings.provider.deleteButton') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

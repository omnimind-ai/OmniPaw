<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { BridgeMcpServerSummary } from '@/bridge/app'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const open = defineModel<boolean>('open', { required: true })

defineProps<{
  target?: BridgeMcpServerSummary
  pending: boolean
}>()

const emit = defineEmits<{
  delete: []
}>()

const { t } = useI18n()
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ t('settings.mcpServer.delete.title') }}</DialogTitle>
        <DialogDescription>
          {{ t('settings.mcpServer.delete.description', { name: target?.name || t('settings.mcpServer.delete.serverName') }) }}
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button
          variant="outline"
          :disabled="pending"
          @click="open = false"
        >
          {{ t('settings.mcpServer.delete.cancelButton') }}
        </Button>
        <Button
          variant="destructive"
          :disabled="!target || pending"
          @click="emit('delete')"
        >
          {{ t('settings.mcpServer.delete.deleteButton') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

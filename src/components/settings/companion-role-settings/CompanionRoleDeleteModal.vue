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

const open = defineModel<boolean>('open', { default: false })

defineProps<{
  roleName: string
}>()

const emit = defineEmits<{
  confirm: []
}>()

const { t } = useI18n()
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ t('settings.catAppearance.role.deleteDialog.title') }}</DialogTitle>
        <DialogDescription>
          {{ t('settings.catAppearance.role.deleteDialog.description', { name: roleName }) }}
        </DialogDescription>
      </DialogHeader>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          @click="open = false"
        >
          {{ t('settings.catAppearance.role.deleteDialog.cancel') }}
        </Button>
        <Button
          type="button"
          variant="destructive"
          @click="emit('confirm')"
        >
          {{ t('settings.catAppearance.role.deleteDialog.confirm') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

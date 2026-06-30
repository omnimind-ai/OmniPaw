<script setup lang="ts">
import type { CatAppearancePackSummary } from '@shared/types/cat-appearance'
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

const open = defineModel<boolean>('open', { required: true })

defineProps<{
  pack?: CatAppearancePackSummary
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
        <DialogTitle>{{ t('settings.catAppearance.delete.title') }}</DialogTitle>
        <DialogDescription>
          {{ t('settings.catAppearance.delete.description', { name: pack?.name || t('settings.catAppearance.delete.packName') }) }}
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          :disabled="pending"
          @click="open = false"
        >
          {{ t('settings.catAppearance.delete.cancelButton') }}
        </Button>
        <Button
          type="button"
          variant="destructive"
          :disabled="!pack || pending"
          @click="emit('delete')"
        >
          {{ t('settings.catAppearance.delete.deleteButton') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

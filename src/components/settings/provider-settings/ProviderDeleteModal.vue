<script setup lang="ts">
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
        <DialogTitle>删除 Provider</DialogTitle>
        <DialogDescription>
          删除 {{ providerName }} 后，其下模型也会从配置中移除。
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          @click="open = false"
        >
          取消
        </Button>
        <Button
          type="button"
          variant="destructive"
          :disabled="saving"
          @click="emit('confirm')"
        >
          删除
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
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
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>删除 MCP 服务器</DialogTitle>
        <DialogDescription>
          删除 {{ target?.name || '该服务器' }} 后，它发现的 MCP 工具会从后续聊天运行中移除。
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button
          variant="outline"
          :disabled="pending"
          @click="open = false"
        >
          取消
        </Button>
        <Button
          variant="destructive"
          :disabled="!target || pending"
          @click="emit('delete')"
        >
          删除
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

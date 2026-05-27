<script setup lang="ts">
import { ShieldAlertIcon } from 'lucide-vue-next'
import { computed } from 'vue'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const props = defineProps<{
  open: boolean
  vision: boolean
  reaction: boolean
  busy?: boolean
}>()

const emit = defineEmits<{
  'update:open': [open: boolean]
  confirm: []
}>()

const description = computed(() => {
  if (props.vision && props.reaction) {
    return '截图会发送给外部视觉模型，视觉摘要也可能发送给外部 reaction 模型。'
  }
  if (props.vision) {
    return '截图会发送给外部视觉模型。'
  }
  return '视觉摘要可能发送给外部 reaction 模型。'
})
</script>

<template>
  <Dialog
    :open="open"
    @update:open="emit('update:open', $event)"
  >
    <DialogContent>
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <ShieldAlertIcon />
          外部模型风险确认
        </DialogTitle>
        <DialogDescription>
          {{ description }}
        </DialogDescription>
      </DialogHeader>

      <div class="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
        主动视觉观察默认不会保存截图。继续后，本次限时观察会按当前设置使用外部模型。
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          :disabled="busy"
          @click="emit('update:open', false)"
        >
          取消
        </Button>
        <Button
          type="button"
          :disabled="busy"
          @click="emit('confirm')"
        >
          确认并开始
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

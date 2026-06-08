<script setup lang="ts">
import type { CompanionMemoryKind, CreateCompanionMemoryRequest } from '@shared/types/memory'
import { computed, ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
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
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

const open = defineModel<boolean>('open', { required: true })

defineProps<{
  saving: boolean
}>()

const emit = defineEmits<{
  submit: [request: CreateCompanionMemoryRequest]
}>()

const content = ref('')
const kind = ref<CompanionMemoryKind>('fact')
const importance = ref(3)
const canSubmit = computed(() => content.value.trim().length > 0)

watch(open, (isOpen) => {
  if (!isOpen) {
    resetDraft()
  }
})

function submit(): void {
  const trimmedContent = content.value.trim()
  if (!trimmedContent) return

  emit('submit', {
    kind: kind.value,
    scope: 'user',
    content: trimmedContent,
    importance: clampInteger(importance.value, 1, 5),
    confidence: 1,
  })
}

function resetDraft(): void {
  content.value = ''
  kind.value = 'fact'
  importance.value = 3
}

function clampInteger(value: string | number, min: number, max: number): number {
  const next = Math.round(Number(value))
  if (!Number.isFinite(next)) return min
  return Math.min(max, Math.max(min, next))
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>新建记忆</DialogTitle>
        <DialogDescription>
          手动写入一条长期记忆，保存后会进入记忆列表。
        </DialogDescription>
      </DialogHeader>

      <FieldGroup>
        <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field>
            <FieldLabel for="memory-create-kind">记忆类型</FieldLabel>
            <Select v-model="kind">
              <SelectTrigger
                id="memory-create-kind"
                class="w-full"
              >
                <SelectValue placeholder="选择类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="fact">事实</SelectItem>
                  <SelectItem value="preference">偏好</SelectItem>
                  <SelectItem value="profile">画像</SelectItem>
                  <SelectItem value="relationship">关系</SelectItem>
                  <SelectItem value="episode">经历</SelectItem>
                  <SelectItem value="plan">计划</SelectItem>
                  <SelectItem value="boundary">边界</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel for="memory-create-importance">重要度</FieldLabel>
            <Input
              id="memory-create-importance"
              v-model="importance"
              type="number"
              min="1"
              max="5"
              step="1"
            />
            <FieldDescription>范围 1 到 5。</FieldDescription>
          </Field>
        </div>

        <Field>
          <FieldLabel for="memory-create-content">记忆内容</FieldLabel>
          <Textarea
            id="memory-create-content"
            v-model="content"
            rows="5"
            placeholder="输入要保存的记忆内容"
          />
        </Field>
      </FieldGroup>

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
          :disabled="saving || !canSubmit"
          @click="submit"
        >
          保存
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

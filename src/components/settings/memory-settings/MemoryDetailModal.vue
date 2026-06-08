<script setup lang="ts">
import type {
  CompanionMemoryInspectResponse,
  CompanionMemoryItem,
  CompanionMemoryKind,
  CompanionMemorySourceEvidence,
  CompanionMemoryStatus,
  UpdateCompanionMemoryRequest,
} from '@shared/types/memory'
import { computed, ref, watch } from 'vue'
import { Badge } from '@/components/ui/badge'
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
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  formatMemoryTime,
  memoryKindLabel,
  memoryScopeLabel,
  memoryStatusLabel,
  memoryStatusVariant,
  percentLabel,
} from './format'

const open = defineModel<boolean>('open', { required: true })

const props = defineProps<{
  memory?: CompanionMemoryInspectResponse['memory']
  sources: CompanionMemorySourceEvidence[]
  loading: boolean
  saving: boolean
}>()

const emit = defineEmits<{
  submit: [request: UpdateCompanionMemoryRequest]
}>()

const content = ref('')
const kind = ref<CompanionMemoryKind>('fact')
const status = ref<CompanionMemoryStatus>('active')
const importance = ref(3)

const hasMemory = computed(() => Boolean(props.memory))
const canSubmit = computed(() => {
  const memory = props.memory
  if (!memory || props.loading) return false
  return (
    content.value.trim() !== memory.content ||
    kind.value !== memory.kind ||
    status.value !== memory.status ||
    clampInteger(importance.value, 1, 5) !== memory.importance
  )
})

watch(
  () => props.memory,
  (memory) => {
    if (memory) {
      resetDraft(memory)
    }
  },
  { immediate: true }
)

function submit(): void {
  const memory = props.memory
  if (!memory) return

  emit('submit', {
    memoryId: memory.id,
    kind: kind.value,
    status: status.value,
    content: content.value.trim(),
    importance: clampInteger(importance.value, 1, 5),
  })
}

function resetDraft(memory: CompanionMemoryItem): void {
  content.value = memory.content
  kind.value = memory.kind
  status.value = memory.status
  importance.value = memory.importance
}

function sourceKindLabel(source: CompanionMemorySourceEvidence): string {
  if (source.sourceKind === 'chat-turn') return '聊天回合'
  if (source.sourceKind === 'message-window') return '消息窗口'
  return '手动写入'
}

function sourceTime(source: CompanionMemorySourceEvidence): string {
  return formatMemoryTime(source.sourceCreatedAt || source.createdAt)
}

function clampInteger(value: string | number, min: number, max: number): number {
  const next = Math.round(Number(value))
  if (!Number.isFinite(next)) return min
  return Math.min(max, Math.max(min, next))
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle>记忆详情</DialogTitle>
        <DialogDescription>
          {{ memory ? `${memoryKindLabel(memory.kind)} · ${formatMemoryTime(memory.updatedAt)}` : '选择一条记忆查看或修改。' }}
        </DialogDescription>
      </DialogHeader>

      <div
        v-if="loading && !hasMemory"
        class="flex flex-col gap-3"
      >
        <Skeleton class="h-12 w-full" />
        <Skeleton class="h-40 w-full" />
        <Skeleton class="h-24 w-full" />
      </div>

      <FieldGroup v-else-if="memory">
        <div class="flex flex-wrap items-center gap-2">
          <Badge :variant="memoryStatusVariant(memory.status)">
            {{ memoryStatusLabel(memory.status) }}
          </Badge>
          <Badge variant="outline">{{ memoryScopeLabel(memory.scope) }}</Badge>
          <Badge variant="outline">{{ percentLabel(memory.confidence) }}</Badge>
        </div>

        <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Field>
            <FieldLabel for="memory-detail-kind">类型</FieldLabel>
            <Select v-model="kind">
              <SelectTrigger
                id="memory-detail-kind"
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
            <FieldLabel for="memory-detail-status">状态</FieldLabel>
            <Select v-model="status">
              <SelectTrigger
                id="memory-detail-status"
                class="w-full"
              >
                <SelectValue placeholder="选择状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="active">活跃</SelectItem>
                  <SelectItem value="disabled">停用</SelectItem>
                  <SelectItem value="archived">归档</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel for="memory-detail-importance">重要度</FieldLabel>
            <Input
              id="memory-detail-importance"
              v-model="importance"
              type="number"
              min="1"
              max="5"
              step="1"
            />
          </Field>
        </div>

        <Field>
          <FieldLabel for="memory-detail-content">记忆内容</FieldLabel>
          <Textarea
            id="memory-detail-content"
            v-model="content"
            rows="8"
          />
        </Field>

        <Separator />

        <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field class="rounded-md border px-3 py-2">
            <FieldLabel>记忆 ID</FieldLabel>
            <FieldDescription class="break-all">{{ memory.id }}</FieldDescription>
          </Field>
          <Field class="rounded-md border px-3 py-2">
            <FieldLabel>创建时间</FieldLabel>
            <FieldDescription>{{ formatMemoryTime(memory.createdAt) }}</FieldDescription>
          </Field>
          <Field class="rounded-md border px-3 py-2">
            <FieldLabel>更新时间</FieldLabel>
            <FieldDescription>{{ formatMemoryTime(memory.updatedAt) }}</FieldDescription>
          </Field>
          <Field class="rounded-md border px-3 py-2">
            <FieldLabel>观察时间</FieldLabel>
            <FieldDescription>{{ formatMemoryTime(memory.observedAt) }}</FieldDescription>
          </Field>
        </div>

        <template v-if="sources.length">
          <Separator />

          <Field>
            <FieldContent>
              <FieldLabel>来源</FieldLabel>
              <FieldDescription>这条记忆关联的证据记录。</FieldDescription>
            </FieldContent>
          </Field>

          <div class="flex flex-col gap-2">
            <div
              v-for="source in sources"
              :key="source.id"
              class="rounded-md border px-3 py-2 text-sm"
            >
              <div class="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{{ sourceKindLabel(source) }}</Badge>
                <span class="text-muted-foreground">{{ sourceTime(source) }}</span>
              </div>
              <p
                v-if="source.sessionId"
                class="mt-2 break-all text-xs text-muted-foreground"
              >
                会话 {{ source.sessionId }}
              </p>
            </div>
          </div>
        </template>
      </FieldGroup>

      <div
        v-else
        class="rounded-md border px-4 py-6 text-sm text-muted-foreground"
      >
        记忆详情尚未加载。
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          @click="open = false"
        >
          关闭
        </Button>
        <Button
          type="button"
          :disabled="saving || !canSubmit"
          @click="submit"
        >
          保存修改
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

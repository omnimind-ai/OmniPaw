<script setup lang="ts">
import { computed } from 'vue'
import type { BridgeDesktopSettingsConfig } from '@/bridge/app'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
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
import { Switch } from '@/components/ui/switch'

const open = defineModel<boolean>('open', { required: true })

const props = defineProps<{
  draft: BridgeDesktopSettingsConfig
}>()

const memorySettings = computed(() => props.draft.app.memory)
const minConfidencePercent = computed({
  get: () => Math.round(memorySettings.value.minConfidence * 100),
  set: (value: string | number) => {
    memorySettings.value.minConfidence = clampInteger(value, 0, 100) / 100
  },
})
const maxContextItems = computed({
  get: () => memorySettings.value.maxContextItems,
  set: (value: string | number) => {
    memorySettings.value.maxContextItems = clampInteger(value, 0, 24)
  },
})
const maxContextTokens = computed({
  get: () => memorySettings.value.maxContextTokens,
  set: (value: string | number) => {
    memorySettings.value.maxContextTokens = clampInteger(value, 0, 4000)
  },
})

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
        <DialogTitle>记忆策略</DialogTitle>
        <DialogDescription>
          管理自动提取、上下文检索和每次请求的记忆预算。
        </DialogDescription>
      </DialogHeader>

      <FieldGroup class="gap-0 rounded-md border">
        <Field
          orientation="responsive"
          class="border-b px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="memory-enabled">启用伙伴记忆</FieldLabel>
            <FieldDescription>关闭后停止自动提取和检索，手动管理仍可用。</FieldDescription>
          </FieldContent>
          <Switch
            id="memory-enabled"
            v-model="memorySettings.enabled"
            aria-label="启用伙伴记忆"
          />
        </Field>

        <Field
          orientation="responsive"
          class="border-b px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="memory-extraction">自动提取</FieldLabel>
            <FieldDescription>成功回复后异步提取新记忆，不会自动覆盖或删除已有记忆。</FieldDescription>
          </FieldContent>
          <Switch
            id="memory-extraction"
            v-model="memorySettings.extractionEnabled"
            :disabled="!memorySettings.enabled"
            aria-label="自动提取记忆"
          />
        </Field>

        <Field
          orientation="responsive"
          class="border-b px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="memory-retrieval">上下文检索</FieldLabel>
            <FieldDescription>发送前检索相关记忆，并按预算注入为独立上下文。</FieldDescription>
          </FieldContent>
          <Switch
            id="memory-retrieval"
            v-model="memorySettings.retrievalEnabled"
            :disabled="!memorySettings.enabled"
            aria-label="上下文检索记忆"
          />
        </Field>

        <Field
          orientation="responsive"
          class="border-b px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="memory-max-items">最大记忆条数</FieldLabel>
            <FieldDescription>每次请求最多选入的相关记忆数量。</FieldDescription>
          </FieldContent>
          <Input
            id="memory-max-items"
            v-model="maxContextItems"
            class="w-full md:w-48"
            type="number"
            min="0"
            max="24"
            step="1"
          />
        </Field>

        <Field
          orientation="responsive"
          class="border-b px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="memory-max-tokens">上下文 token 预算</FieldLabel>
            <FieldDescription>记忆上下文在单次请求中的最大 token 数。</FieldDescription>
          </FieldContent>
          <Input
            id="memory-max-tokens"
            v-model="maxContextTokens"
            class="w-full md:w-48"
            type="number"
            min="0"
            max="4000"
            step="1"
          />
        </Field>

        <Field
          orientation="responsive"
          class="px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="memory-min-confidence">最低置信度</FieldLabel>
            <FieldDescription>低于该百分比的记忆不会进入检索候选。</FieldDescription>
          </FieldContent>
          <Input
            id="memory-min-confidence"
            v-model="minConfidencePercent"
            class="w-full md:w-48"
            type="number"
            min="0"
            max="100"
            step="1"
          />
        </Field>
      </FieldGroup>

      <DialogFooter>
        <DialogClose as-child>
          <Button type="button">完成</Button>
        </DialogClose>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

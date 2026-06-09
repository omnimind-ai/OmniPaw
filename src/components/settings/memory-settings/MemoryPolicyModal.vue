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
const lowConfidenceReviewPercent = computed({
  get: () => Math.round(memorySettings.value.lowConfidenceReviewThreshold * 100),
  set: (value: string | number) => {
    memorySettings.value.lowConfidenceReviewThreshold = clampInteger(value, 0, 100) / 100
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
            <FieldLabel for="memory-semantic-extraction">语义抽取</FieldLabel>
            <FieldDescription>优先使用已配置模型理解长期事实，失败时降级为本地规则。</FieldDescription>
          </FieldContent>
          <Switch
            id="memory-semantic-extraction"
            v-model="memorySettings.semanticExtractionEnabled"
            :disabled="!memorySettings.enabled || !memorySettings.extractionEnabled"
            aria-label="语义抽取记忆"
          />
        </Field>

        <Field
          orientation="responsive"
          class="border-b px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="memory-tool-write">主动工具写入</FieldLabel>
            <FieldDescription>用户明确要求记住、更新或忘记时，允许助手调用受控记忆工具。</FieldDescription>
          </FieldContent>
          <Switch
            id="memory-tool-write"
            v-model="memorySettings.activeToolWriteEnabled"
            :disabled="!memorySettings.enabled"
            aria-label="主动工具写入记忆"
          />
        </Field>

        <Field
          orientation="responsive"
          class="border-b px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="memory-maintenance">维护建议</FieldLabel>
            <FieldDescription>异步生成去重、关联、冲突和过期计划建议。</FieldDescription>
          </FieldContent>
          <Switch
            id="memory-maintenance"
            v-model="memorySettings.maintenanceEnabled"
            :disabled="!memorySettings.enabled"
            aria-label="维护记忆"
          />
        </Field>

        <Field
          orientation="responsive"
          class="border-b px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="memory-destructive-confirm">破坏性操作确认</FieldLabel>
            <FieldDescription>删除、归档或覆盖记忆默认生成待确认建议。</FieldDescription>
          </FieldContent>
          <Switch
            id="memory-destructive-confirm"
            v-model="memorySettings.destructiveToolRequiresConfirmation"
            :disabled="!memorySettings.enabled"
            aria-label="破坏性记忆操作需要确认"
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
          class="border-b px-4 py-3"
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

        <Field
          orientation="responsive"
          class="px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="memory-low-confidence">低置信复核阈值</FieldLabel>
            <FieldDescription>低于该百分比的自动候选会进入待确认状态。</FieldDescription>
          </FieldContent>
          <Input
            id="memory-low-confidence"
            v-model="lowConfidenceReviewPercent"
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

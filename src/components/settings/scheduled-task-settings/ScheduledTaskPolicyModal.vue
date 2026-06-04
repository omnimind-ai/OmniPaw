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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

const open = defineModel<boolean>('open', { required: true })

const props = defineProps<{
  draft: BridgeDesktopSettingsConfig
}>()

const misfireGraceMinutes = computed({
  get: () => Math.round(props.draft.scheduledTasks.misfireGraceMs / 60_000),
  set: (value: string | number) => {
    const minutes = Math.max(0, Math.round(Number(value) || 0))
    props.draft.scheduledTasks.misfireGraceMs = minutes * 60_000
  },
})

const misfireStartupLimit = computed({
  get: () => props.draft.scheduledTasks.misfireStartupLimit,
  set: (value: string | number) => {
    props.draft.scheduledTasks.misfireStartupLimit = Math.max(0, Math.round(Number(value) || 0))
  },
})
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>计划任务策略</DialogTitle>
        <DialogDescription>
          管理本地计划任务运行、补跑策略和启动补跑限制。
        </DialogDescription>
      </DialogHeader>

      <FieldGroup class="gap-0 rounded-md border">
        <Field
          orientation="responsive"
          class="border-b px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="scheduled-enabled">启用计划任务</FieldLabel>
            <FieldDescription>关闭后不会自动运行或补跑，手动运行和管理仍可用。</FieldDescription>
          </FieldContent>
          <Switch
            id="scheduled-enabled"
            v-model="draft.scheduledTasks.enabled"
            aria-label="启用计划任务"
          />
        </Field>

        <Field
          orientation="responsive"
          class="border-b px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="scheduled-misfire-policy">补跑策略</FieldLabel>
            <FieldDescription>桌面端关闭期间错过的重复任务如何处理。</FieldDescription>
          </FieldContent>
          <Select
            v-model="draft.scheduledTasks.misfirePolicy"
            class="w-full md:w-48"
          >
            <SelectTrigger
              id="scheduled-misfire-policy"
              class="w-full md:w-48"
            >
              <SelectValue placeholder="选择补跑策略" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="run_once">最多补跑一次</SelectItem>
                <SelectItem value="skip">跳过错过任务</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>

        <Field
          orientation="responsive"
          class="border-b px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="scheduled-grace">单次任务宽限分钟</FieldLabel>
            <FieldDescription>超过宽限时间的单次任务会记录为错过。</FieldDescription>
          </FieldContent>
          <Input
            id="scheduled-grace"
            v-model="misfireGraceMinutes"
            class="w-full md:w-48"
            type="number"
            min="0"
            step="1"
          />
        </Field>

        <Field
          orientation="responsive"
          class="px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="scheduled-limit">启动补跑上限</FieldLabel>
            <FieldDescription>应用启动时最多补跑的任务数量。</FieldDescription>
          </FieldContent>
          <Input
            id="scheduled-limit"
            v-model="misfireStartupLimit"
            class="w-full md:w-48"
            type="number"
            min="0"
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

<script setup lang="ts">
import { computed } from 'vue'
import type { BridgeDesktopSettingsConfig } from '@/bridge/app'
import SettingsSection from '@/components/settings/SettingsSection.vue'
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

const props = defineProps<{
  draft: BridgeDesktopSettingsConfig
}>()

const observation = computed(() => props.draft.observation)

const defaultIntervalSeconds = computed({
  get: () => Math.round(observation.value.defaultIntervalMs / 1000),
  set: (value: string | number) => {
    observation.value.defaultIntervalMs = clampInteger(value, 1) * 1000
  },
})

const defaultDurationMinutes = computed({
  get: () => Math.round(observation.value.defaultDurationMs / 60_000),
  set: (value: string | number) => {
    observation.value.defaultDurationMs = clampInteger(value, 1) * 60_000
  },
})

const minIntervalSeconds = computed({
  get: () => Math.round(observation.value.minIntervalMs / 1000),
  set: (value: string | number) => {
    observation.value.minIntervalMs = clampInteger(value, 1) * 1000
  },
})

const minDurationMinutes = computed({
  get: () => Math.round(observation.value.minDurationMs / 60_000),
  set: (value: string | number) => {
    observation.value.minDurationMs = clampInteger(value, 1) * 60_000
  },
})

const maxDurationMinutes = computed({
  get: () => Math.round(observation.value.maxDurationMs / 60_000),
  set: (value: string | number) => {
    observation.value.maxDurationMs = clampInteger(value, 1) * 60_000
  },
})

const reactionCooldownSeconds = computed({
  get: () => Math.round(observation.value.reactionCooldownMs / 1000),
  set: (value: string | number) => {
    observation.value.reactionCooldownMs = clampInteger(value, 0) * 1000
  },
})

function clampInteger(value: string | number, min: number): number {
  const next = Math.round(Number(value))
  if (!Number.isFinite(next)) return min
  return Math.max(min, next)
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <SettingsSection
      title="主动视觉观察"
      description="需要从会话中手动启动，应用重启后不会恢复。"
    >
      <FieldGroup class="gap-0">
        <Field
          orientation="responsive"
          class="border-b px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="observation-enabled">启用主动视觉观察</FieldLabel>
            <FieldDescription>关闭时聊天和小猫入口无法启动限时观察。</FieldDescription>
          </FieldContent>
          <Switch
            id="observation-enabled"
            v-model="observation.enabled"
            aria-label="启用主动视觉观察"
          />
        </Field>

        <Field
          orientation="responsive"
          class="border-b px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="observation-duration">默认时长（分钟）</FieldLabel>
            <FieldDescription>每次启动后自动停止。</FieldDescription>
          </FieldContent>
          <Input
            id="observation-duration"
            v-model="defaultDurationMinutes"
            class="w-full md:w-48"
            type="number"
            min="1"
            step="1"
          />
        </Field>

        <Field
          orientation="responsive"
          class="border-b px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="observation-interval">默认间隔（秒）</FieldLabel>
            <FieldDescription>定时截图之间的最小间隔。</FieldDescription>
          </FieldContent>
          <Input
            id="observation-interval"
            v-model="defaultIntervalSeconds"
            class="w-full md:w-48"
            type="number"
            min="1"
            step="1"
          />
        </Field>

        <Field
          orientation="responsive"
          class="border-b px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="observation-scope">默认范围</FieldLabel>
            <FieldDescription>第一版优先使用主显示器；窗口范围依赖系统可用源。</FieldDescription>
          </FieldContent>
          <Select
            v-model="observation.defaultScope"
            class="w-full md:w-48"
          >
            <SelectTrigger
              id="observation-scope"
              class="w-full md:w-48"
            >
              <SelectValue placeholder="选择范围" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="primary_display">主显示器</SelectItem>
                <SelectItem value="selected_display">显示器</SelectItem>
                <SelectItem value="selected_window">窗口</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>

        <Field
          orientation="responsive"
          class="border-b px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="observation-output">默认输出</FieldLabel>
            <FieldDescription>Reaction gate 会在该范围内决定是否展示。</FieldDescription>
          </FieldContent>
          <Select
            v-model="observation.outputMode"
            class="w-full md:w-48"
          >
            <SelectTrigger
              id="observation-output"
              class="w-full md:w-48"
            >
              <SelectValue placeholder="选择输出" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="silent">静默</SelectItem>
                <SelectItem value="ambient">小猫气泡</SelectItem>
                <SelectItem value="chat">写入会话</SelectItem>
                <SelectItem value="ask">先询问</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>

        <Field
          orientation="responsive"
          class="px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="observation-retention">保留策略</FieldLabel>
            <FieldDescription>默认只保留最终可见消息和安全 metadata。</FieldDescription>
          </FieldContent>
          <Select
            v-model="observation.retention"
            class="w-full md:w-48"
          >
            <SelectTrigger
              id="observation-retention"
              class="w-full md:w-48"
            >
              <SelectValue placeholder="选择保留策略" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="ephemeral">临时</SelectItem>
                <SelectItem value="save_to_chat">保存到会话</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      </FieldGroup>
    </SettingsSection>

    <SettingsSection title="运行限制">
      <FieldGroup class="gap-0">
        <Field
          orientation="responsive"
          class="border-b px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="observation-min-interval">最小间隔（秒）</FieldLabel>
            <FieldDescription>低于该值的启动请求会被拒绝。</FieldDescription>
          </FieldContent>
          <Input
            id="observation-min-interval"
            v-model="minIntervalSeconds"
            class="w-full md:w-48"
            type="number"
            min="1"
            step="1"
          />
        </Field>

        <Field
          orientation="responsive"
          class="border-b px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="observation-min-duration">最小时长（分钟）</FieldLabel>
            <FieldDescription>低于该值的观察不会启动。</FieldDescription>
          </FieldContent>
          <Input
            id="observation-min-duration"
            v-model="minDurationMinutes"
            class="w-full md:w-48"
            type="number"
            min="1"
            step="1"
          />
        </Field>

        <Field
          orientation="responsive"
          class="border-b px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="observation-max-duration">最大时长（分钟）</FieldLabel>
            <FieldDescription>超过该值的观察不会启动。</FieldDescription>
          </FieldContent>
          <Input
            id="observation-max-duration"
            v-model="maxDurationMinutes"
            class="w-full md:w-48"
            type="number"
            min="1"
            step="1"
          />
        </Field>

        <Field
          orientation="responsive"
          class="border-b px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="observation-daily-limit">每日截图上限</FieldLabel>
            <FieldDescription>达到上限后当天不再执行观察 tick。</FieldDescription>
          </FieldContent>
          <Input
            id="observation-daily-limit"
            v-model="observation.dailyCaptureLimit"
            class="w-full md:w-48"
            type="number"
            min="1"
            step="1"
          />
        </Field>

        <Field
          orientation="responsive"
          class="border-b px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="observation-failure-limit">连续失败上限</FieldLabel>
            <FieldDescription>截图或模型调用连续失败后停止运行态。</FieldDescription>
          </FieldContent>
          <Input
            id="observation-failure-limit"
            v-model="observation.consecutiveFailureLimit"
            class="w-full md:w-48"
            type="number"
            min="1"
            step="1"
          />
        </Field>

        <Field
          orientation="responsive"
          class="px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="observation-cooldown">Reaction 冷却（秒）</FieldLabel>
            <FieldDescription>冷却期间 gate 会保持静默。</FieldDescription>
          </FieldContent>
          <Input
            id="observation-cooldown"
            v-model="reactionCooldownSeconds"
            class="w-full md:w-48"
            type="number"
            min="0"
            step="1"
          />
        </Field>
      </FieldGroup>
    </SettingsSection>
  </div>
</template>

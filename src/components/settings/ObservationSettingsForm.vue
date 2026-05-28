<script setup lang="ts">
import { computed, onMounted } from 'vue'
import type { BridgeDesktopSettingsConfig } from '@/bridge/app'
import SettingsSection from '@/components/settings/SettingsSection.vue'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { useObservationStore } from '@/stores/observation'
import { errorToText, useToast } from '@/utils/toast'

const props = defineProps<{
  draft: BridgeDesktopSettingsConfig
}>()

const observationStore = useObservationStore()
const toast = useToast()
const observation = computed(() => props.draft.observation)
const runtime = computed(() => observationStore.runtime)
const runtimeEnabled = computed({
  get: () => runtime.value?.active === true,
  set: (enabled: boolean) => {
    void toggleRuntime(enabled)
  },
})

const evaluationIntervalSeconds = computed({
  get: () => Math.round(observation.value.evaluationIntervalMs / 1000),
  set: (value: string | number) => {
    observation.value.evaluationIntervalMs = clampInteger(value, 1) * 1000
  },
})

const minCaptureIntervalSeconds = computed({
  get: () => Math.round(observation.value.minCaptureIntervalMs / 1000),
  set: (value: string | number) => {
    observation.value.minCaptureIntervalMs = clampInteger(value, 1) * 1000
  },
})

const captureProbabilityPercent = computed({
  get: () => Math.round(observation.value.captureProbability * 100),
  set: (value: string | number) => {
    observation.value.captureProbability = clampInteger(value, 0, 100) / 100
  },
})

const reactionNudgeProbabilityPercent = computed({
  get: () => Math.round(observation.value.reactionNudgeProbability * 100),
  set: (value: string | number) => {
    observation.value.reactionNudgeProbability = clampInteger(value, 0, 100) / 100
  },
})

const defaultDurationMinutes = computed({
  get: () => Math.round(observation.value.defaultDurationMs / 60_000),
  set: (value: string | number) => {
    observation.value.defaultDurationMs = clampInteger(value, 1) * 60_000
  },
})

const notificationCooldownSeconds = computed({
  get: () => Math.round(observation.value.notificationCooldownMs / 1000),
  set: (value: string | number) => {
    observation.value.notificationCooldownMs = clampInteger(value, 0) * 1000
  },
})

onMounted(() => {
  void observationStore.load().catch((error) => {
    toast.error(errorToText(error, '主动视觉状态加载失败。'))
  })
})

async function toggleRuntime(enabled: boolean): Promise<void> {
  try {
    if (enabled) {
      await observationStore.start({
        durationMs: observation.value.defaultDurationMs,
        scope: observation.value.defaultScope,
        screenshotRetention: observation.value.screenshotRetention,
      })
    } else {
      await observationStore.stop({ reason: 'user' })
    }
  } catch (error) {
    toast.error(errorToText(error, enabled ? '主动视觉启动失败。' : '主动视觉停止失败。'))
  }
}

function clampInteger(value: string | number, min: number, max = Number.MAX_SAFE_INTEGER): number {
  const next = Math.round(Number(value))
  if (!Number.isFinite(next)) return min
  return Math.min(Math.max(min, next), max)
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <SettingsSection
      title="主动视觉运行"
      description="运行状态只影响当前应用生命周期，重启后不会自动恢复屏幕捕获。"
    >
      <FieldGroup class="gap-0">
        <Field
          orientation="responsive"
          class="border-b px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="observation-runtime">运行主动视觉</FieldLabel>
            <FieldDescription>
              开启后创建或恢复独立主动视觉会话，并按已保存策略评估是否截图。
            </FieldDescription>
          </FieldContent>
          <Switch
            id="observation-runtime"
            v-model="runtimeEnabled"
            :disabled="observationStore.running"
            aria-label="运行主动视觉"
          />
        </Field>

        <Field
          orientation="responsive"
          class="px-4 py-3"
        >
          <FieldContent>
            <FieldLabel>当前状态</FieldLabel>
            <FieldDescription>
              {{ runtime.active ? `运行中，剩余 ${Math.ceil((runtime.remainingMs ?? 0) / 60000)} 分钟` : '未运行' }}
            </FieldDescription>
          </FieldContent>
          <div class="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              :disabled="!runtime.active || observationStore.running"
              @click="observationStore.trigger()"
            >
              立即观察
            </Button>
          </div>
        </Field>
      </FieldGroup>
    </SettingsSection>

    <SettingsSection
      title="触发策略"
      description="保存策略不会启动屏幕捕获。只有运行开关开启后才会按策略执行。"
    >
      <FieldGroup class="gap-0">
        <Field
          orientation="responsive"
          class="border-b px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="observation-evaluation-interval">评估间隔（秒）</FieldLabel>
            <FieldDescription>每次评估先按概率和限制决定是否截图。</FieldDescription>
          </FieldContent>
          <Input
            id="observation-evaluation-interval"
            v-model="evaluationIntervalSeconds"
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
            <FieldLabel for="observation-reaction-nudge-after">连续静默提升（次）</FieldLabel>
            <FieldDescription>达到次数后，后续观察会更积极考虑短问候或寒暄。</FieldDescription>
          </FieldContent>
          <Input
            id="observation-reaction-nudge-after"
            v-model="observation.reactionNudgeAfterSilentCaptures"
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
            <FieldLabel for="observation-reaction-nudge-probability">寒暄倾向（%）</FieldLabel>
            <FieldDescription>连续静默达到阈值后，每次观察提升主动寒暄倾向的基础概率。</FieldDescription>
          </FieldContent>
          <Input
            id="observation-reaction-nudge-probability"
            v-model="reactionNudgeProbabilityPercent"
            class="w-full md:w-48"
            type="number"
            min="0"
            max="100"
            step="1"
          />
        </Field>

        <Field
          orientation="responsive"
          class="border-b px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="observation-capture-probability">截图概率（%）</FieldLabel>
            <FieldDescription>未命中概率时不会截图、调用模型或创建消息。</FieldDescription>
          </FieldContent>
          <Input
            id="observation-capture-probability"
            v-model="captureProbabilityPercent"
            class="w-full md:w-48"
            type="number"
            min="0"
            max="100"
            step="1"
          />
        </Field>

        <Field
          orientation="responsive"
          class="border-b px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="observation-min-capture-interval">最小截图间隔（秒）</FieldLabel>
            <FieldDescription>概率命中后仍会执行硬冷却。</FieldDescription>
          </FieldContent>
          <Input
            id="observation-min-capture-interval"
            v-model="minCaptureIntervalSeconds"
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
            <FieldLabel for="observation-duration">默认运行时长（分钟）</FieldLabel>
            <FieldDescription>每次显式启动后到期停止。</FieldDescription>
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
          class="px-4 py-3"
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
      </FieldGroup>
    </SettingsSection>

    <SettingsSection title="隐私与限制">
      <FieldGroup class="gap-0">
        <Field
          orientation="responsive"
          class="border-b px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="observation-retention">截图保留</FieldLabel>
            <FieldDescription>默认仅保留观察文字和安全 capture marker。</FieldDescription>
          </FieldContent>
          <Select
            v-model="observation.screenshotRetention"
            class="w-full md:w-48"
          >
            <SelectTrigger
              id="observation-retention"
              class="w-full md:w-48"
            >
              <SelectValue placeholder="选择截图保留" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="ephemeral">临时输入</SelectItem>
                <SelectItem value="persist">保存附件</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>

        <Field
          orientation="responsive"
          class="border-b px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="observation-remote">允许外部 Provider</FieldLabel>
            <FieldDescription>关闭时，外部 Provider 会在截图前被拒绝。</FieldDescription>
          </FieldContent>
          <Checkbox
            id="observation-remote"
            v-model="observation.allowRemoteProviders"
            aria-label="允许外部 Provider"
          />
        </Field>

        <Field
          orientation="responsive"
          class="border-b px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="observation-local-only">仅本地执行</FieldLabel>
            <FieldDescription>开启时会阻止外部视觉或 reaction 模型。</FieldDescription>
          </FieldContent>
          <Checkbox
            id="observation-local-only"
            v-model="observation.localOnly"
            aria-label="仅本地执行"
          />
        </Field>

        <Field
          orientation="responsive"
          class="border-b px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="observation-daily-limit">每日截图上限</FieldLabel>
            <FieldDescription>达到上限后当天不再执行观察。</FieldDescription>
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
            <FieldLabel for="observation-cooldown">通知冷却（秒）</FieldLabel>
            <FieldDescription>冷却期间 notify/ask 决定只写入主动视觉历史。</FieldDescription>
          </FieldContent>
          <Input
            id="observation-cooldown"
            v-model="notificationCooldownSeconds"
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

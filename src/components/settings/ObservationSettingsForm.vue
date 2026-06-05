<script setup lang="ts">
import { MessageCircleIcon, PlayCircleIcon, ShieldIcon, TimerIcon } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { appBridge, type BridgeDesktopSettingsConfig, ensureElectronBridge } from '@/bridge/app'
import SettingEntry from '@/components/settings/common/SettingEntry.vue'
import SettingsSection from '@/components/settings/common/SettingsSection.vue'
import { Button } from '@/components/ui/button'
import { FieldGroup } from '@/components/ui/field'
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
const activeRun = computed(() => observationStore.activeRun)
const showDevReactionTrigger = import.meta.env.DEV
const directCatBubblePending = ref(false)
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

async function triggerDevReaction(): Promise<void> {
  try {
    let run = activeRun.value
    if (!run) {
      const next = await observationStore.start({
        scope: observation.value.defaultScope,
        screenshotRetention: observation.value.screenshotRetention,
      })
      run = next.activeRuns.find((item) => item.status === 'active')
    }
    await observationStore.trigger({
      ...(run ? { runId: run.id } : {}),
      devForceReaction: true,
    })
  } catch (error) {
    toast.error(errorToText(error, '开发测试气泡触发失败。'))
  }
}

async function showDirectDevCatBubble(): Promise<void> {
  directCatBubblePending.value = true
  try {
    ensureElectronBridge('直接弹气泡')
    await appBridge.cat.show()
    await delay(250)
    const event = await appBridge.cat.showBubble?.({
      text: `气泡窗口测试 ${new Date().toLocaleTimeString()}`,
      kind: 'observation',
      autoDismissMs: 7_000,
      source: 'dev-direct-bubble',
    })
    if (!event) {
      throw new Error('小猫气泡窗口没有返回可见事件。')
    }
  } catch (error) {
    toast.error(errorToText(error, '手动气泡测试失败。'))
  } finally {
    directCatBubblePending.value = false
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
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
      description="控制当前应用生命周期内的观察运行态。"
      :icon="PlayCircleIcon"
    >
      <FieldGroup class="gap-0">
        <SettingEntry control-id="observation-runtime" title="运行主动视觉">
          <template #description>
            开启后创建或恢复独立主动视觉会话，并按已保存策略评估是否截图。
          </template>
          <Switch
            id="observation-runtime"
            v-model="runtimeEnabled"
            :disabled="observationStore.running"
            aria-label="运行主动视觉"
          />
        </SettingEntry>

        <SettingEntry title="当前状态" control-class="flex-wrap @md/field-group:min-w-fit">
          <template #description>
            {{ runtime.active ? '运行中，手动关闭前会持续观察' : '未运行' }}
          </template>
          <div class="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              :disabled="!runtime.active || observationStore.running"
              @click="observationStore.trigger()"
            >
              立即观察
            </Button>
            <Button
              v-if="showDevReactionTrigger"
              type="button"
              variant="outline"
              size="sm"
              :disabled="observationStore.running"
              @click="triggerDevReaction"
            >
              <MessageCircleIcon data-icon="inline-start" />
              模型测气泡
            </Button>
            <Button
              v-if="showDevReactionTrigger"
              type="button"
              variant="outline"
              size="sm"
              :disabled="directCatBubblePending"
              @click="showDirectDevCatBubble"
            >
              <MessageCircleIcon data-icon="inline-start" />
              直接弹气泡
            </Button>
          </div>
        </SettingEntry>
      </FieldGroup>
    </SettingsSection>

    <SettingsSection
      title="触发策略"
      description="设置观察频率、概率和主动反应倾向。"
      :icon="TimerIcon"
    >
      <FieldGroup class="gap-0">
        <SettingEntry
          control-id="observation-evaluation-interval"
          title="评估间隔（秒）"
          description="每次评估先按概率和限制决定是否截图。"
        >
          <Input
            id="observation-evaluation-interval"
            v-model="evaluationIntervalSeconds"
            class="w-full md:w-48"
            type="number"
            min="1"
            step="1"
          />
        </SettingEntry>

        <SettingEntry
          control-id="observation-reaction-nudge-after"
          title="连续静默提升（次）"
          description="达到次数后，后续观察会更积极考虑短问候或寒暄。"
        >
          <Input
            id="observation-reaction-nudge-after"
            v-model="observation.reactionNudgeAfterSilentCaptures"
            class="w-full md:w-48"
            type="number"
            min="1"
            step="1"
          />
        </SettingEntry>

        <SettingEntry
          control-id="observation-reaction-nudge-probability"
          title="寒暄倾向（%）"
          description="连续静默达到阈值后，每次观察提升主动寒暄倾向的基础概率。"
        >
          <Input
            id="observation-reaction-nudge-probability"
            v-model="reactionNudgeProbabilityPercent"
            class="w-full md:w-48"
            type="number"
            min="0"
            max="100"
            step="1"
          />
        </SettingEntry>

        <SettingEntry
          control-id="observation-capture-probability"
          title="截图概率（%）"
          description="未命中概率时不会截图、调用模型或创建消息。"
        >
          <Input
            id="observation-capture-probability"
            v-model="captureProbabilityPercent"
            class="w-full md:w-48"
            type="number"
            min="0"
            max="100"
            step="1"
          />
        </SettingEntry>

        <SettingEntry
          control-id="observation-min-capture-interval"
          title="最小截图间隔（秒）"
          description="概率命中后仍会执行硬冷却。"
        >
          <Input
            id="observation-min-capture-interval"
            v-model="minCaptureIntervalSeconds"
            class="w-full md:w-48"
            type="number"
            min="1"
            step="1"
          />
        </SettingEntry>

        <SettingEntry
          control-id="observation-scope"
          title="默认范围"
          description="第一版优先使用主显示器；窗口范围依赖系统可用源。"
        >
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
        </SettingEntry>
      </FieldGroup>
    </SettingsSection>

    <SettingsSection
      title="隐私与限制"
      description="限制截图保留、外部模型和失败边界。"
      :icon="ShieldIcon"
    >
      <FieldGroup class="gap-0">
        <SettingEntry
          control-id="observation-retention"
          title="截图保留"
          description="默认仅保留观察文字和安全 capture marker。"
        >
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
        </SettingEntry>

        <SettingEntry
          control-id="observation-remote"
          title="允许外部 Provider"
          description="关闭时，外部 Provider 会在截图前被拒绝。"
        >
          <Switch
            id="observation-remote"
            v-model="observation.allowRemoteProviders"
            aria-label="允许外部 Provider"
          />
        </SettingEntry>

        <SettingEntry
          control-id="observation-local-only"
          title="仅本地执行"
          description="开启时会阻止外部视觉或 reaction 模型。"
        >
          <Switch
            id="observation-local-only"
            v-model="observation.localOnly"
            aria-label="仅本地执行"
          />
        </SettingEntry>

        <SettingEntry
          control-id="observation-daily-limit"
          title="每日截图上限"
          description="达到上限后当天不再执行观察。"
        >
          <Input
            id="observation-daily-limit"
            v-model="observation.dailyCaptureLimit"
            class="w-full md:w-48"
            type="number"
            min="1"
            step="1"
          />
        </SettingEntry>

        <SettingEntry
          control-id="observation-failure-limit"
          title="连续失败上限"
          description="截图或模型调用连续失败后停止运行态。"
        >
          <Input
            id="observation-failure-limit"
            v-model="observation.consecutiveFailureLimit"
            class="w-full md:w-48"
            type="number"
            min="1"
            step="1"
          />
        </SettingEntry>

        <SettingEntry
          control-id="observation-cooldown"
          title="通知冷却（秒）"
          description="冷却期间 notify/ask 决定只写入主动视觉历史。"
        >
          <Input
            id="observation-cooldown"
            v-model="notificationCooldownSeconds"
            class="w-full md:w-48"
            type="number"
            min="0"
            step="1"
          />
        </SettingEntry>
      </FieldGroup>
    </SettingsSection>
  </div>
</template>

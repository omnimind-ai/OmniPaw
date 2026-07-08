<script setup lang="ts">
import { PlayCircleIcon, ShieldIcon, TimerIcon } from 'lucide-vue-next'
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import type { BridgeDesktopSettingsConfig } from '@/bridge/app'
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

const { t } = useI18n()
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

const notificationCooldownSeconds = computed({
  get: () => Math.round(observation.value.notificationCooldownMs / 1000),
  set: (value: string | number) => {
    observation.value.notificationCooldownMs = clampInteger(value, 0) * 1000
  },
})

onMounted(() => {
  void observationStore.load().catch((error) => {
    toast.error(errorToText(error, t('settings.observation.errors.loadFailed')))
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
    const errorKey = enabled
      ? 'settings.observation.errors.startFailed'
      : 'settings.observation.errors.stopFailed'
    toast.error(errorToText(error, t(errorKey)))
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
      :title="t('settings.observation.title')"
      :description="t('settings.observation.description')"
      :icon="PlayCircleIcon"
    >
      <FieldGroup class="gap-0">
        <SettingEntry control-id="observation-runtime" :title="t('settings.observation.runtime.title')">
          <template #description>
            {{ t('settings.observation.runtime.description') }}
          </template>
          <Switch
            id="observation-runtime"
            v-model="runtimeEnabled"
            :disabled="observationStore.running"
            :aria-label="t('settings.observation.runtime.title')"
          />
        </SettingEntry>

        <SettingEntry :title="t('settings.observation.status.title')" control-class="flex-wrap @md/field-group:min-w-fit">
          <template #description>
            {{ runtime.active ? t('settings.observation.status.running') : t('settings.observation.status.notRunning') }}
          </template>
          <div class="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              :disabled="!runtime.active || observationStore.running"
              @click="observationStore.trigger()"
            >
              {{ t('settings.observation.immediateObserve') }}
            </Button>
          </div>
        </SettingEntry>
      </FieldGroup>
    </SettingsSection>

    <SettingsSection
      :title="t('settings.observation.triggerPolicy.title')"
      :description="t('settings.observation.triggerPolicy.description')"
      :icon="TimerIcon"
    >
      <FieldGroup class="gap-0">
        <SettingEntry
          control-id="observation-evaluation-interval"
          :title="t('settings.observation.evaluationInterval.title')"
          :description="t('settings.observation.evaluationInterval.description')"
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
          :title="t('settings.observation.reactionNudgeAfter.title')"
          :description="t('settings.observation.reactionNudgeAfter.description')"
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
          :title="t('settings.observation.reactionNudgeProbability.title')"
          :description="t('settings.observation.reactionNudgeProbability.description')"
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
          :title="t('settings.observation.captureProbability.title')"
          :description="t('settings.observation.captureProbability.description')"
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
          :title="t('settings.observation.minCaptureInterval.title')"
          :description="t('settings.observation.minCaptureInterval.description')"
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
          :title="t('settings.observation.defaultScope.title')"
          :description="t('settings.observation.defaultScope.description')"
        >
          <Select
            v-model="observation.defaultScope"
            class="w-full md:w-48"
          >
            <SelectTrigger
              id="observation-scope"
              class="w-full md:w-48"
            >
              <SelectValue :placeholder="t('settings.observation.defaultScope.placeholder')" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="primary_display">{{ t('settings.observation.defaultScope.primaryDisplay') }}</SelectItem>
                <SelectItem value="selected_display">{{ t('settings.observation.defaultScope.selectedDisplay') }}</SelectItem>
                <SelectItem value="selected_window">{{ t('settings.observation.defaultScope.selectedWindow') }}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </SettingEntry>
      </FieldGroup>
    </SettingsSection>

    <SettingsSection
      :title="t('settings.observation.privacy.title')"
      :description="t('settings.observation.privacy.description')"
      :icon="ShieldIcon"
    >
      <FieldGroup class="gap-0">
        <SettingEntry
          control-id="observation-retention"
          :title="t('settings.observation.screenshotRetention.title')"
          :description="t('settings.observation.screenshotRetention.description')"
        >
          <Select
            v-model="observation.screenshotRetention"
            class="w-full md:w-48"
          >
            <SelectTrigger
              id="observation-retention"
              class="w-full md:w-48"
            >
              <SelectValue :placeholder="t('settings.observation.screenshotRetention.placeholder')" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="ephemeral">{{ t('settings.observation.screenshotRetention.ephemeral') }}</SelectItem>
                <SelectItem value="persist">{{ t('settings.observation.screenshotRetention.persist') }}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </SettingEntry>

        <SettingEntry
          control-id="observation-remote"
          :title="t('settings.observation.allowRemoteProviders.title')"
          :description="t('settings.observation.allowRemoteProviders.description')"
        >
          <Switch
            id="observation-remote"
            v-model="observation.allowRemoteProviders"
            :aria-label="t('settings.observation.allowRemoteProviders.title')"
          />
        </SettingEntry>

        <SettingEntry
          control-id="observation-local-only"
          :title="t('settings.observation.localOnly.title')"
          :description="t('settings.observation.localOnly.description')"
        >
          <Switch
            id="observation-local-only"
            v-model="observation.localOnly"
            :aria-label="t('settings.observation.localOnly.title')"
          />
        </SettingEntry>

        <SettingEntry
          control-id="observation-daily-limit"
          :title="t('settings.observation.dailyLimit.title')"
          :description="t('settings.observation.dailyLimit.description')"
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
          :title="t('settings.observation.failureLimit.title')"
          :description="t('settings.observation.failureLimit.description')"
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
          :title="t('settings.observation.notificationCooldown.title')"
          :description="t('settings.observation.notificationCooldown.description')"
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

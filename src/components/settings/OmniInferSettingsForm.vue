<script setup lang="ts">
import { CpuIcon, GaugeIcon, Loader2Icon, PlayIcon, RefreshCwIcon, SquareIcon } from '@lucide/vue'
import type { OmniInferProcessState } from '@shared/types/omniinfer'
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import SettingEntry from '@/components/settings/common/SettingEntry.vue'
import SettingsSection from '@/components/settings/common/SettingsSection.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FieldGroup } from '@/components/ui/field'
import { Switch } from '@/components/ui/switch'
import { useOmniInferStore } from '@/stores/omniinfer'
import { errorToText, useToast } from '@/utils/toast'

const store = useOmniInferStore()
const { t } = useI18n()
const toast = useToast()
const {
  snapshot,
  loadingStatus,
  backendSetup,
  loadingBackendSetup,
  installingBackend,
  backendInstallPercent,
} = storeToRefs(store)

const runtimeOperation = ref<'start' | 'stop' | null>(null)

const processStateLabels = computed<Record<OmniInferProcessState, string>>(() => ({
  not_bundled: t('settings.omniInfer.runtime.states.notBundled'),
  stopped: t('settings.omniInfer.runtime.states.stopped'),
  starting: t('settings.omniInfer.runtime.states.starting'),
  running: t('settings.omniInfer.runtime.states.running'),
  unhealthy: t('settings.omniInfer.runtime.states.unhealthy'),
  crashed: t('settings.omniInfer.runtime.states.crashed'),
}))
const processStateLabel = computed(() => processStateLabels.value[snapshot.value.process.state])
const processBadgeVariant = computed<'default' | 'secondary' | 'destructive' | 'outline'>(() => {
  if (snapshot.value.server.online) return 'default'
  if (snapshot.value.process.state === 'crashed') return 'destructive'
  if (snapshot.value.process.state === 'starting' || snapshot.value.process.state === 'unhealthy') {
    return 'secondary'
  }
  return 'outline'
})
const canStart = computed(
  () =>
    !snapshot.value.externallyManaged &&
    ['stopped', 'crashed', 'unhealthy'].includes(snapshot.value.process.state)
)
const canStop = computed(
  () => !snapshot.value.externallyManaged && snapshot.value.process.state === 'running'
)
const recommendedAcceleration = computed(() => {
  const setup = backendSetup.value
  const backend = setup?.recommendedBackend?.trim()
  if (!setup || !backend || backend === setup.baseBackend) return ''
  return setup.installedBackends.includes(backend) ? '' : backend
})
const installedAccelerators = computed(() => {
  const setup = backendSetup.value
  if (!setup) return []
  return setup.installedBackends.filter((backend) => backend !== setup.baseBackend)
})
const backendBusy = computed(() => loadingBackendSetup.value || Boolean(installingBackend.value))

onMounted(async () => {
  if (!store.available) return
  store.subscribe()
  await Promise.allSettled([store.refreshStatus(), store.refreshBackendSetup()])
})

onBeforeUnmount(() => {
  store.unsubscribe()
})

async function refreshAll() {
  try {
    await Promise.all([store.refreshStatus(), store.refreshBackendSetup()])
  } catch (error) {
    toast.error(errorToText(error, t('settings.omniInfer.messages.refreshFailed')))
  }
}

async function startRuntime() {
  runtimeOperation.value = 'start'
  try {
    await store.start()
  } catch (error) {
    toast.error(errorToText(error, t('settings.omniInfer.messages.startFailed')))
  } finally {
    runtimeOperation.value = null
  }
}

async function stopRuntime() {
  runtimeOperation.value = 'stop'
  try {
    await store.stop()
  } catch (error) {
    toast.error(errorToText(error, t('settings.omniInfer.messages.stopFailed')))
  } finally {
    runtimeOperation.value = null
  }
}

async function installRecommendedBackend() {
  const backend = recommendedAcceleration.value
  if (!backend) return
  try {
    await store.installBackend(backend)
    toast.success(t('settings.omniInfer.messages.installCompleted', { backend }))
  } catch (error) {
    toast.error(errorToText(error, t('settings.omniInfer.messages.installFailed')))
  }
}

async function toggleThinking(enabled: boolean) {
  try {
    await store.setThinking(enabled)
  } catch (error) {
    toast.error(errorToText(error, t('settings.omniInfer.messages.thinkingFailed')))
  }
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <SettingsSection
      :title="t('settings.omniInfer.runtime.title')"
      :icon="GaugeIcon"
    >
      <template #action>
        <Button
          type="button"
          variant="outline"
          size="sm"
          :disabled="loadingStatus || backendBusy"
          @click="refreshAll"
        >
          <RefreshCwIcon
            data-icon="inline-start"
            :class="{ 'animate-spin': loadingStatus || loadingBackendSetup }"
          />
          {{ t('settings.omniInfer.actions.refresh') }}
        </Button>
      </template>

      <FieldGroup class="gap-0">
        <SettingEntry
          :title="t('settings.omniInfer.runtime.status')"
          :description="t('settings.omniInfer.runtime.description')"
        >
          <div class="flex flex-wrap items-center justify-end gap-2">
            <Badge :variant="processBadgeVariant">
              {{ processStateLabel }}
            </Badge>
            <Button
              v-if="canStart"
              type="button"
              size="sm"
              :disabled="Boolean(runtimeOperation)"
              @click="startRuntime"
            >
              <Loader2Icon
                v-if="runtimeOperation === 'start'"
                data-icon="inline-start"
                class="animate-spin"
              />
              <PlayIcon
                v-else
                data-icon="inline-start"
              />
              {{ t('settings.omniInfer.actions.start') }}
            </Button>
            <Button
              v-if="canStop"
              type="button"
              variant="outline"
              size="sm"
              :disabled="Boolean(runtimeOperation)"
              @click="stopRuntime"
            >
              <Loader2Icon
                v-if="runtimeOperation === 'stop'"
                data-icon="inline-start"
                class="animate-spin"
              />
              <SquareIcon
                v-else
                data-icon="inline-start"
              />
              {{ t('settings.omniInfer.actions.stop') }}
            </Button>
          </div>
        </SettingEntry>

        <SettingEntry
          :title="t('settings.omniInfer.runtime.endpoint')"
          :description="snapshot.server.online
            ? t('settings.omniInfer.runtime.online')
            : t('settings.omniInfer.runtime.offline')"
        >
          <code class="break-all text-xs">{{ snapshot.server.baseUrl }}</code>
        </SettingEntry>

        <SettingEntry
          control-id="settings-omniinfer-thinking"
          :title="t('settings.omniInfer.runtime.thinking')"
          :description="t('settings.omniInfer.runtime.thinkingDescription')"
        >
          <Switch
            id="settings-omniinfer-thinking"
            :model-value="snapshot.thinking"
            :disabled="!snapshot.server.online"
            :aria-label="t('settings.omniInfer.runtime.thinking')"
            @update:model-value="toggleThinking"
          />
        </SettingEntry>
      </FieldGroup>
    </SettingsSection>

    <SettingsSection
      :title="t('settings.omniInfer.backends.title')"
      :icon="CpuIcon"
    >
      <FieldGroup class="gap-0">
        <SettingEntry
          :title="t('settings.omniInfer.backends.baseTitle')"
          :description="t('settings.omniInfer.backends.baseDescription')"
        >
          <div class="flex flex-wrap items-center justify-end gap-2">
            <code class="text-xs">{{ backendSetup?.baseBackend || '—' }}</code>
            <Badge :variant="backendSetup?.baseBackendInstalled ? 'default' : 'destructive'">
              {{
                backendSetup?.baseBackendInstalled
                  ? t('settings.omniInfer.backends.installed')
                  : t('settings.omniInfer.backends.missing')
              }}
            </Badge>
          </div>
        </SettingEntry>

        <SettingEntry
          :title="t('settings.omniInfer.backends.accelerationTitle')"
          :description="recommendedAcceleration
            ? t('settings.omniInfer.backends.recommendedDescription', {
              backend: recommendedAcceleration,
            })
            : t('settings.omniInfer.backends.noRecommendation')"
        >
          <Button
            v-if="recommendedAcceleration"
            type="button"
            size="sm"
            :disabled="backendBusy"
            @click="installRecommendedBackend"
          >
            <Loader2Icon
              v-if="installingBackend"
              data-icon="inline-start"
              class="animate-spin"
            />
            {{
              installingBackend
                ? t('settings.omniInfer.actions.installing', {
                  progress: backendInstallPercent,
                })
                : t('settings.omniInfer.actions.install')
            }}
          </Button>
          <Badge
            v-else
            variant="secondary"
          >
            {{ t('settings.omniInfer.backends.configured') }}
          </Badge>
        </SettingEntry>

        <SettingEntry
          :title="t('settings.omniInfer.backends.installedTitle')"
          :description="t('settings.omniInfer.backends.installedDescription')"
        >
          <div class="flex flex-wrap justify-end gap-2">
            <Badge
              v-for="backend in installedAccelerators"
              :key="backend"
              variant="outline"
            >
              {{ backend }}
            </Badge>
            <span
              v-if="installedAccelerators.length === 0"
              class="text-xs text-muted-foreground"
            >
              {{ t('settings.omniInfer.backends.noneInstalled') }}
            </span>
          </div>
        </SettingEntry>
      </FieldGroup>
    </SettingsSection>
  </div>
</template>

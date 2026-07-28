<script setup lang="ts">
import { CloudIcon, CpuIcon, FolderOpenIcon, Loader2Icon, RefreshCwIcon } from '@lucide/vue'
import type { OmniInferProcessState } from '@shared/types/omniinfer'
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { appBridge } from '@/bridge/app'
import SettingEntry from '@/components/settings/common/SettingEntry.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { useOmniInferStore } from '@/stores/omniinfer'
import { errorToText, useToast } from '@/utils/toast'
import type { ProviderDraft } from './types'

const { t } = useI18n()

const props = defineProps<{
  draft: ProviderDraft
}>()

const store = useOmniInferStore()
const {
  snapshot,
  loadingStatus,
  backendSetup,
  loadingBackendSetup,
  installingBackend,
  backendInstallPercent,
} = storeToRefs(store)
const toast = useToast()

const stateLabel: Record<OmniInferProcessState, string> = {
  not_bundled: t('settings.provider.omniInfer.notBundled'),
  stopped: t('settings.provider.omniInfer.stopped'),
  starting: t('settings.provider.omniInfer.starting'),
  running: t('settings.provider.omniInfer.running'),
  unhealthy: t('settings.provider.omniInfer.unhealthy'),
  crashed: t('settings.provider.omniInfer.crashed'),
}

const stateClass: Record<OmniInferProcessState, string> = {
  not_bundled: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200',
  stopped: 'bg-zinc-300 text-zinc-800 dark:bg-zinc-600 dark:text-zinc-100',
  starting: 'bg-amber-200 text-amber-900 dark:bg-amber-700 dark:text-amber-50',
  running: 'bg-emerald-200 text-emerald-900 dark:bg-emerald-700 dark:text-emerald-50',
  unhealthy: 'bg-amber-300 text-amber-900 dark:bg-amber-600 dark:text-amber-50',
  crashed: 'bg-red-300 text-red-900 dark:bg-red-700 dark:text-red-50',
}

const loadedModelDetails = computed(() => snapshot.value.loadedModel)
const isExternallyManaged = computed(() => snapshot.value.externallyManaged)
const canStart = computed(
  () =>
    !isExternallyManaged.value &&
    (snapshot.value.process.state === 'stopped' ||
      snapshot.value.process.state === 'crashed' ||
      snapshot.value.process.state === 'unhealthy')
)
const canStop = computed(
  () => !isExternallyManaged.value && snapshot.value.process.state === 'running'
)
const isAvailable = computed(() => store.available)
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

const effectiveStateLabel = computed(() =>
  isExternallyManaged.value
    ? t('settings.provider.omniInfer.externallyManaged')
    : stateLabel[snapshot.value.process.state]
)
const effectiveStateClass = computed(() =>
  isExternallyManaged.value
    ? 'bg-sky-200 text-sky-900 dark:bg-sky-700 dark:text-sky-50'
    : stateClass[snapshot.value.process.state]
)
const showNotBundledHint = computed(
  () => snapshot.value.process.state === 'not_bundled' && !isExternallyManaged.value
)
const showCustomInstallFields = computed(
  () => snapshot.value.process.state === 'not_bundled' || Boolean(props.draft.omniInferInstallDir)
)

const showInstallDirField = computed(() => showCustomInstallFields.value)

async function handlePickInstallDir(): Promise<void> {
  try {
    const result = await appBridge.omniinfer?.pickInstallDir()
    if (result?.path) {
      props.draft.omniInferInstallDir = result.path
    }
  } catch (error) {
    toast.error(errorToText(error, t('settings.provider.messages.pickInstallDirFailed')))
  }
}

async function handleStart(): Promise<void> {
  try {
    await store.start()
  } catch (error) {
    toast.error(errorToText(error, t('settings.provider.messages.startOmniInferFailed')))
  }
}

async function handleStop(): Promise<void> {
  try {
    await store.stop()
  } catch (error) {
    toast.error(errorToText(error, t('settings.provider.messages.stopOmniInferFailed')))
  }
}

async function handlePickGguf(): Promise<void> {
  try {
    const path = await store.pickLocalGguf()
    if (path) {
      toast.success(t('settings.provider.messages.pickGgufSuccess'))
    }
  } catch (error) {
    toast.error(errorToText(error, t('settings.provider.messages.pickFileFailed')))
  }
}

async function handleToggleThinking(value: boolean): Promise<void> {
  try {
    await store.setThinking(value)
  } catch (error) {
    toast.error(errorToText(error, t('settings.provider.messages.toggleThinkingFailed')))
  }
}

async function handleInstallRecommendedBackend(): Promise<void> {
  const backend = recommendedAcceleration.value
  if (!backend) return
  try {
    await store.installBackend(backend)
    toast.success(t('settings.omniInfer.messages.installCompleted', { backend }))
  } catch (error) {
    toast.error(errorToText(error, t('settings.omniInfer.messages.installFailed')))
  }
}

async function handleRefreshBackendSetup(): Promise<void> {
  try {
    await store.refreshBackendSetup()
  } catch (error) {
    toast.error(errorToText(error, t('settings.omniInfer.messages.refreshFailed')))
  }
}

function handleOpenLogs(): void {
  void store.openLogsLocation()
}

onMounted(async () => {
  if (!isAvailable.value) return
  store.subscribe()
  await Promise.allSettled([store.refreshStatus(), store.refreshBackendSetup()])
})

onBeforeUnmount(() => {
  store.unsubscribe()
})
</script>

<template>
  <FieldGroup>
    <Field>
      <FieldLabel for="provider-name">{{ t('settings.provider.basic.name') }}</FieldLabel>
      <Input
        id="provider-name"
        v-model="draft.name"
      />
    </Field>

    <Field>
      <FieldLabel for="provider-base-url">{{ t('settings.provider.basic.baseUrl') }}</FieldLabel>
      <InputGroup>
        <InputGroupAddon>
          <CloudIcon />
        </InputGroupAddon>
        <InputGroupInput
          id="provider-base-url"
          v-model="draft.baseUrl"
          placeholder="http://127.0.0.1:19157/v1"
        />
      </InputGroup>
    </Field>

    <Field v-if="showInstallDirField">
      <FieldLabel for="omniinfer-install-dir">{{ t('settings.provider.omniInfer.installDir') }}</FieldLabel>
      <InputGroup>
        <InputGroupAddon>
          <FolderOpenIcon />
        </InputGroupAddon>
        <InputGroupInput
          id="omniinfer-install-dir"
          v-model="draft.omniInferInstallDir"
          :placeholder="t('settings.provider.omniInfer.installDirExample')"
        />
        <Button
          size="sm"
          variant="ghost"
          @click="handlePickInstallDir"
        >
          {{ t('settings.provider.omniInfer.selectDir') }}
        </Button>
      </InputGroup>
    </Field>

    <Field
      orientation="horizontal"
      class="items-center rounded-lg border px-3 py-2"
    >
      <Switch
        id="provider-enabled"
        v-model="draft.enabled"
        :aria-label="t('settings.provider.basic.enabled')"
      />
      <FieldContent>
        <FieldLabel for="provider-enabled">{{ t('settings.provider.basic.enabled') }}</FieldLabel>
        <FieldDescription>{{ t('settings.provider.basic.enabledDescription') }}</FieldDescription>
      </FieldContent>
    </Field>

    <Separator />

    <FieldSet>
      <FieldLegend>{{ t('settings.provider.omniInfer.gatewayStatus') }}</FieldLegend>
      <FieldDescription>{{ t('settings.provider.omniInfer.gatewayDescription') }}</FieldDescription>

      <div class="flex flex-col gap-3 rounded-lg border bg-card p-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex flex-wrap items-center gap-3">
            <Badge :class="effectiveStateClass">
              {{ effectiveStateLabel }}
            </Badge>
            <span class="text-sm text-muted-foreground">
              {{ snapshot.server.baseUrl }}
              <template v-if="snapshot.server.online">· {{ t('settings.provider.omniInfer.online') }}</template>
              <template v-else>· {{ t('settings.provider.omniInfer.offline') }}</template>
            </span>
          </div>
          <div class="flex flex-wrap gap-2">
            <Button
              v-if="canStart && snapshot.process.state !== 'not_bundled'"
              size="sm"
              :disabled="loadingStatus"
              @click="handleStart"
            >
              {{ t('settings.provider.omniInfer.startButton') }}
            </Button>
            <Button
              v-if="canStop"
              size="sm"
              variant="outline"
              :disabled="loadingStatus"
              @click="handleStop"
            >
              {{ t('settings.provider.omniInfer.stopButton') }}
            </Button>
            <Button
              size="sm"
              variant="outline"
              :disabled="showNotBundledHint"
              @click="handlePickGguf"
            >
              {{ t('settings.provider.omniInfer.selectGguf') }}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              @click="handleOpenLogs"
            >
              {{ t('settings.provider.omniInfer.viewLogs') }}
            </Button>
          </div>
        </div>

        <div
          v-if="loadedModelDetails"
          class="grid grid-cols-1 gap-2 text-sm md:grid-cols-2"
        >
          <div class="min-w-0">
            <span class="text-muted-foreground">{{ t('settings.provider.omniInfer.currentModel') }}</span>
            <span class="break-all font-mono">{{ loadedModelDetails.path }}</span>
          </div>
          <div>
            <span class="text-muted-foreground">{{ t('settings.provider.omniInfer.backend') }}</span>
            {{ loadedModelDetails.backend ?? '—' }}
          </div>
          <div>
            <span class="text-muted-foreground">{{ t('settings.provider.omniInfer.contextLength') }}</span>
            {{ loadedModelDetails.ctxSize ?? '—' }}
          </div>
          <div>
            <span class="text-muted-foreground">{{ t('settings.provider.omniInfer.ready') }}</span>
            {{ loadedModelDetails.ready ? t('settings.provider.omniInfer.readyYes') : t('settings.provider.omniInfer.readyNo') }}
          </div>
        </div>
      </div>
    </FieldSet>

    <Separator />

    <FieldSet>
      <FieldLegend class="flex items-center gap-2">
        <CpuIcon class="size-4" />
        {{ t('settings.omniInfer.backends.title') }}
      </FieldLegend>
      <FieldDescription>{{ t('settings.omniInfer.backends.baseDescription') }}</FieldDescription>
      <div class="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          :disabled="backendBusy"
          @click="handleRefreshBackendSetup"
        >
          <RefreshCwIcon
            data-icon="inline-start"
            :class="{ 'animate-spin': loadingBackendSetup }"
          />
          {{ t('settings.omniInfer.actions.refresh') }}
        </Button>
      </div>

      <div class="flex flex-col gap-1 rounded-lg border p-2">
        <SettingEntry
          :title="t('settings.omniInfer.backends.baseTitle')"
          :description="t('settings.omniInfer.backends.baseDescription')"
        >
          <div class="flex flex-wrap items-center gap-2">
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
            @click="handleInstallRecommendedBackend"
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
          <div class="flex flex-wrap gap-2">
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
      </div>
    </FieldSet>

    <Field
      orientation="horizontal"
      class="items-center rounded-lg border px-3 py-2"
    >
      <Switch
        id="omniinfer-thinking"
        :model-value="snapshot.thinking"
        :aria-label="t('settings.provider.omniInfer.thinkingMode')"
        @update:model-value="handleToggleThinking"
      />
      <FieldContent>
        <FieldLabel for="omniinfer-thinking">{{ t('settings.provider.omniInfer.thinkingMode') }}</FieldLabel>
        <FieldDescription>
          {{ t('settings.provider.omniInfer.thinkingDescription') }}
        </FieldDescription>
      </FieldContent>
    </Field>
  </FieldGroup>
</template>

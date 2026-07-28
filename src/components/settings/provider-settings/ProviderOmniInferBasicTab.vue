<script setup lang="ts">
import { CloudIcon, CpuIcon, FolderOpenIcon, Loader2Icon } from '@lucide/vue'
import type { OmniInferProcessState } from '@shared/types/omniinfer'
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { appBridge } from '@/bridge/app'
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
import ProviderOmniInferBackendDialog from './ProviderOmniInferBackendDialog.vue'
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
  selectingBackend,
  backendInstallPercent,
} = storeToRefs(store)
const toast = useToast()
const backendDialogOpen = ref(false)

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
const currentBackend = computed(
  () =>
    snapshot.value.backends.find((backend) => backend.selected)?.id ??
    snapshot.value.loadedModel?.backend ??
    ''
)
const backendBusy = computed(
  () =>
    loadingBackendSetup.value || Boolean(installingBackend.value) || Boolean(selectingBackend.value)
)

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

async function handleInstallBackend(backend: string): Promise<void> {
  try {
    await store.installBackend(backend)
    toast.success(t('settings.omniInfer.messages.installCompleted', { backend }))
  } catch (error) {
    toast.error(errorToText(error, t('settings.omniInfer.messages.installFailed')))
  }
}

async function handleSelectBackend(backend: string): Promise<void> {
  try {
    await store.selectBackend(backend)
    backendDialogOpen.value = false
    toast.success(t('settings.omniInfer.messages.selectCompleted', { backend }))
  } catch (error) {
    toast.error(errorToText(error, t('settings.omniInfer.messages.selectFailed')))
  }
}

async function handleRefreshBackendSetup(): Promise<void> {
  try {
    await Promise.all([store.refreshStatus(), store.refreshBackendSetup()])
  } catch (error) {
    toast.error(errorToText(error, t('settings.omniInfer.messages.refreshFailed')))
  }
}

function handleOpenBackendDialog(): void {
  backendDialogOpen.value = true
  void handleRefreshBackendSetup()
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
        {{ t('settings.omniInfer.backends.title') }}
      </FieldLegend>
      <FieldDescription>{{ t('settings.omniInfer.backends.description') }}</FieldDescription>

      <div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
        <div class="flex min-w-0 flex-wrap items-center gap-3">
          <Badge variant="secondary">
            <Loader2Icon
              v-if="loadingBackendSetup"
              data-icon="inline-start"
              class="animate-spin"
            />
            {{ currentBackend || t('settings.omniInfer.backends.currentEmpty') }}
          </Badge>
          <span class="text-sm text-muted-foreground">
            {{
              currentBackend
                ? t('settings.omniInfer.backends.currentDescription')
                : t('settings.omniInfer.backends.currentEmptyDescription')
            }}
          </span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          :disabled="backendBusy"
          @click="handleOpenBackendDialog"
        >
          {{ t('settings.omniInfer.actions.switchBackend') }}
        </Button>
      </div>
    </FieldSet>

    <ProviderOmniInferBackendDialog
      v-model:open="backendDialogOpen"
      :setup="backendSetup"
      :current-backend="currentBackend"
      :server-online="snapshot.server.online"
      :loading="loadingBackendSetup"
      :installing-backend="installingBackend"
      :selecting-backend="selectingBackend"
      :install-progress="backendInstallPercent"
      @refresh="handleRefreshBackendSetup"
      @install="handleInstallBackend"
      @select="handleSelectBackend"
    />

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

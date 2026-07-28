<script setup lang="ts">
import { CheckIcon, DownloadIcon, Loader2Icon, RefreshCwIcon } from '@lucide/vue'
import type { OmniInferBackendSetupStatus } from '@shared/types/omniinfer'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
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
import { Progress } from '@/components/ui/progress'

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  setup: OmniInferBackendSetupStatus | null
  currentBackend: string
  serverOnline: boolean
  loading: boolean
  installingBackend: string | null
  selectingBackend: string | null
  installProgress: number
}>()

const emit = defineEmits<{
  refresh: []
  install: [backend: string]
  select: [backend: string]
}>()

const { t } = useI18n()

const installedBackends = computed(() => new Set(props.setup?.installedBackends ?? []))
const backendOptions = computed(() => {
  const options = new Set(props.setup?.compatibleBackends ?? [])
  if (props.currentBackend) {
    options.add(props.currentBackend)
  }
  return [...options]
    .filter((backend) => backend.trim().length > 0)
    .sort((left, right) => {
      if (left === props.currentBackend) return -1
      if (right === props.currentBackend) return 1
      const leftInstalled = installedBackends.value.has(left)
      const rightInstalled = installedBackends.value.has(right)
      if (leftInstalled !== rightInstalled) return leftInstalled ? -1 : 1
      return left.localeCompare(right)
    })
})
const busy = computed(
  () => props.loading || Boolean(props.installingBackend) || Boolean(props.selectingBackend)
)

function isCurrent(backend: string): boolean {
  return backend === props.currentBackend
}

function isInstalled(backend: string): boolean {
  return isCurrent(backend) || installedBackends.value.has(backend)
}

function backendDescription(backend: string): string {
  if (isCurrent(backend)) {
    return t('settings.omniInfer.backends.currentDescription')
  }
  if (isInstalled(backend)) {
    return props.serverOnline
      ? t('settings.omniInfer.backends.availableDescription')
      : t('settings.omniInfer.backends.gatewayRequired')
  }
  return t('settings.omniInfer.backends.downloadDescription')
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{{ t('settings.omniInfer.backends.switchTitle') }}</DialogTitle>
        <DialogDescription>
          {{ t('settings.omniInfer.backends.switchDescription') }}
        </DialogDescription>
      </DialogHeader>

      <div class="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          :disabled="busy"
          @click="emit('refresh')"
        >
          <RefreshCwIcon
            data-icon="inline-start"
            :class="{ 'animate-spin': loading }"
          />
          {{ t('settings.omniInfer.actions.refresh') }}
        </Button>
      </div>

      <FieldGroup
        v-if="backendOptions.length"
        class="max-h-[55vh] gap-0 overflow-y-auto rounded-lg border"
      >
        <Field
          v-for="backend in backendOptions"
          :key="backend"
          orientation="horizontal"
          class="items-center border-b px-4 py-4 last:border-b-0"
        >
          <FieldContent class="min-w-0 gap-1">
            <FieldLabel class="flex min-w-0 flex-wrap items-center gap-2">
              <code class="truncate text-sm font-semibold">{{ backend }}</code>
              <Badge
                v-if="isCurrent(backend)"
                variant="secondary"
              >
                <CheckIcon data-icon="inline-start" />
                {{ t('settings.omniInfer.backends.current') }}
              </Badge>
            </FieldLabel>
            <FieldDescription>{{ backendDescription(backend) }}</FieldDescription>
            <Progress
              v-if="installingBackend === backend"
              class="mt-2 max-w-64"
              :model-value="installProgress"
            />
          </FieldContent>

          <Button
            v-if="!isCurrent(backend) && isInstalled(backend)"
            type="button"
            size="sm"
            variant="outline"
            :disabled="busy || !serverOnline"
            @click="emit('select', backend)"
          >
            <Loader2Icon
              v-if="selectingBackend === backend"
              data-icon="inline-start"
              class="animate-spin"
            />
            {{ t('settings.omniInfer.actions.use') }}
          </Button>

          <Button
            v-else-if="!isCurrent(backend)"
            type="button"
            size="sm"
            :disabled="busy"
            @click="emit('install', backend)"
          >
            <Loader2Icon
              v-if="installingBackend === backend"
              data-icon="inline-start"
              class="animate-spin"
            />
            <DownloadIcon
              v-else
              data-icon="inline-start"
            />
            {{
              installingBackend === backend
                ? t('settings.omniInfer.actions.installing', { progress: installProgress })
                : t('settings.omniInfer.actions.download')
            }}
          </Button>
        </Field>
      </FieldGroup>

      <Field
        v-else
        class="rounded-lg border px-4 py-6"
      >
        <FieldContent>
          <FieldLabel>{{ t('settings.omniInfer.backends.emptyTitle') }}</FieldLabel>
          <FieldDescription>
            {{ t('settings.omniInfer.backends.emptyDescription') }}
          </FieldDescription>
        </FieldContent>
      </Field>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          @click="open = false"
        >
          {{ t('settings.omniInfer.actions.close') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

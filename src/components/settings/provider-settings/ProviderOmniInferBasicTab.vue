<script setup lang="ts">
import type { OmniInferProcessState } from '@shared/types/omniinfer'
import { CloudIcon, FolderOpenIcon } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted } from 'vue'
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
import type { ProviderDraft } from './types'

const props = defineProps<{
  draft: ProviderDraft
}>()

const store = useOmniInferStore()
const { snapshot, loadingStatus } = storeToRefs(store)
const toast = useToast()

const stateLabel: Record<OmniInferProcessState, string> = {
  not_bundled: '未内置',
  stopped: '已停止',
  starting: '启动中',
  running: '运行中',
  unhealthy: '不健康',
  crashed: '已崩溃',
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

const effectiveStateLabel = computed(() =>
  isExternallyManaged.value ? '外部运行中' : stateLabel[snapshot.value.process.state]
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
    toast.error(errorToText(error, '选择 OmniInfer 安装目录失败。'))
  }
}

async function handleStart(): Promise<void> {
  try {
    await store.start()
  } catch (error) {
    toast.error(errorToText(error, '启动 OmniInfer 失败。'))
  }
}

async function handleStop(): Promise<void> {
  try {
    await store.stop()
  } catch (error) {
    toast.error(errorToText(error, '停止 OmniInfer 失败。'))
  }
}

async function handlePickGguf(): Promise<void> {
  try {
    const path = await store.pickLocalGguf()
    if (path) {
      toast.success('已选择本地模型，可在“模型配置”中启用。')
    }
  } catch (error) {
    toast.error(errorToText(error, '选择文件失败。'))
  }
}

async function handleToggleThinking(value: boolean): Promise<void> {
  try {
    await store.setThinking(value)
  } catch (error) {
    toast.error(errorToText(error, '切换 think 模式失败。'))
  }
}

function handleOpenLogs(): void {
  void store.openLogsLocation()
}

onMounted(async () => {
  if (!isAvailable.value) return
  store.subscribe()
  await store.refreshStatus()
})

onBeforeUnmount(() => {
  store.unsubscribe()
})
</script>

<template>
  <FieldGroup>
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Field>
        <FieldLabel for="provider-name">名称</FieldLabel>
        <Input
          id="provider-name"
          v-model="draft.name"
        />
      </Field>

      <Field>
        <FieldLabel for="provider-id">Provider ID</FieldLabel>
        <Input
          id="provider-id"
          v-model="draft.id"
          :disabled="true"
        />
      </Field>
    </div>

    <Field>
      <FieldLabel for="provider-base-url">Base URL</FieldLabel>
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
      <FieldLabel for="omniinfer-install-dir">OmniInfer 安装目录</FieldLabel>
      <InputGroup>
        <InputGroupAddon>
          <FolderOpenIcon />
        </InputGroupAddon>
        <InputGroupInput
          id="omniinfer-install-dir"
          v-model="draft.omniInferInstallDir"
          placeholder="例：D:\omniinfer\OmniInfer"
        />
        <Button
          size="sm"
          variant="ghost"
          @click="handlePickInstallDir"
        >
          选择目录
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
        aria-label="启用 Provider"
      />
      <FieldContent>
        <FieldLabel for="provider-enabled">启用 Provider</FieldLabel>
        <FieldDescription>禁用后该 Provider 下模型不会出现在可选列表中。</FieldDescription>
      </FieldContent>
    </Field>

    <Separator />

    <FieldSet>
      <FieldLegend>网关状态</FieldLegend>
      <FieldDescription>OmniInfer 本地推理网关的运行状态与控制。</FieldDescription>

      <div class="flex flex-col gap-3 rounded-lg border bg-card p-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex flex-wrap items-center gap-3">
            <Badge :class="effectiveStateClass">
              {{ effectiveStateLabel }}
            </Badge>
            <span class="text-sm text-muted-foreground">
              {{ snapshot.server.baseUrl }}
              <template v-if="snapshot.server.online">· 网关在线</template>
              <template v-else>· 网关离线</template>
            </span>
          </div>
          <div class="flex flex-wrap gap-2">
            <Button
              v-if="canStart && snapshot.process.state !== 'not_bundled'"
              size="sm"
              :disabled="loadingStatus"
              @click="handleStart"
            >
              启动服务
            </Button>
            <Button
              v-if="canStop"
              size="sm"
              variant="outline"
              :disabled="loadingStatus"
              @click="handleStop"
            >
              停止服务
            </Button>
            <Button
              size="sm"
              variant="outline"
              :disabled="showNotBundledHint"
              @click="handlePickGguf"
            >
              选择本地 .gguf
            </Button>
            <Button
              size="sm"
              variant="ghost"
              @click="handleOpenLogs"
            >
              查看日志
            </Button>
          </div>
        </div>

        <div
          v-if="loadedModelDetails"
          class="grid grid-cols-1 gap-2 text-sm md:grid-cols-2"
        >
          <div class="min-w-0">
            <span class="text-muted-foreground">当前模型：</span>
            <span class="break-all font-mono">{{ loadedModelDetails.path }}</span>
          </div>
          <div>
            <span class="text-muted-foreground">Backend：</span>
            {{ loadedModelDetails.backend ?? '—' }}
          </div>
          <div>
            <span class="text-muted-foreground">上下文长度：</span>
            {{ loadedModelDetails.ctxSize ?? '—' }}
          </div>
          <div>
            <span class="text-muted-foreground">就绪：</span>
            {{ loadedModelDetails.ready ? '是' : '否' }}
          </div>
        </div>
      </div>
    </FieldSet>

    <Field
      orientation="horizontal"
      class="items-center rounded-lg border px-3 py-2"
    >
      <Switch
        id="omniinfer-thinking"
        :model-value="snapshot.thinking"
        aria-label="Think 模式"
        @update:model-value="handleToggleThinking"
      />
      <FieldContent>
        <FieldLabel for="omniinfer-thinking">Think 模式</FieldLabel>
        <FieldDescription>
          开启后模型可以输出思考过程；部分小模型在关闭 think 时响应更稳定。
        </FieldDescription>
      </FieldContent>
    </Field>
  </FieldGroup>
</template>

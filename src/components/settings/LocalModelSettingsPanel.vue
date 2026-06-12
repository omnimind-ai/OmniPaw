<script setup lang="ts">
import type { OmniInferCatalogModel } from '@shared/types/omniinfer'
import { CheckCircle2Icon, CpuIcon, DownloadIcon, RefreshCwIcon } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useOmniInferStore } from '@/stores/omniinfer'
import { useProviderStore } from '@/stores/provider'
import { useToast } from '@/utils/toast'

const omniInferStore = useOmniInferStore()
const providerStore = useProviderStore()
const toast = useToast()
const { status, models, activeModelId, busy, loadingCatalog, activatingModelId } =
  storeToRefs(omniInferStore)

const progress = computed(() => status.value?.progress)
const statusLabel = computed(() => {
  if (!status.value) return '未连接'
  if (status.value.state === 'running') return '运行中'
  if (status.value.state === 'starting') return '启动中'
  if (status.value.state === 'error') return '异常'
  if (status.value.state === 'unavailable') return '不可用'
  return '未启动'
})
const recommendedModels = computed(() => models.value.slice(0, 4))

onMounted(async () => {
  omniInferStore.subscribe()
  await refreshPanel()
})

onBeforeUnmount(() => {
  omniInferStore.stopSubscription()
})

async function refreshPanel() {
  try {
    await omniInferStore.loadStatus()
    await omniInferStore.loadCatalog()
  } catch (error) {
    toast.error(error, { description: '本地模型列表加载失败' })
  }
}

async function installModel(model: OmniInferCatalogModel) {
  try {
    const result = await omniInferStore.downloadAndActivate({
      modelId: model.id,
      setDefault: true,
    })
    if (!result.ok) {
      toast.error(result.error?.message || '模型启用失败')
      return
    }
    await providerStore.loadProviders()
    toast.success('本地模型已启用。')
  } catch (error) {
    toast.error(error, { description: '模型下载或启用失败' })
  }
}

function modelSize(model: OmniInferCatalogModel): string {
  if (model.sizeGiB) return `${model.sizeGiB} GiB`
  if (!model.sizeBytes) return '未知大小'
  return `${Math.round((model.sizeBytes / 1024 ** 3) * 10) / 10} GiB`
}

function buttonLabel(model: OmniInferCatalogModel): string {
  if (activatingModelId.value === model.id) return progress.value?.label || '处理中'
  if (activeModelId.value === model.id) return '已启用'
  if (model.installed) return '启用'
  return '下载并启用'
}
</script>

<template>
  <section class="rounded-lg border bg-muted/10 p-4">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div class="flex min-w-0 items-start gap-3">
        <div class="flex size-9 shrink-0 items-center justify-center rounded-md border bg-background">
          <CpuIcon class="size-4" />
        </div>
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="text-sm font-semibold">本地模型</h3>
            <Badge variant="outline">{{ statusLabel }}</Badge>
            <Badge
              v-if="activeModelId"
              variant="secondary"
            >
              {{ activeModelId }}
            </Badge>
          </div>
          <p class="mt-1 text-xs text-muted-foreground">
            选择一个模型后会自动下载、启动 OmniInfer、加载模型并设为默认模型。
          </p>
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        :disabled="busy"
        @click="refreshPanel"
      >
        <RefreshCwIcon class="size-4" />
        刷新
      </Button>
    </div>

    <div
      v-if="progress && progress.phase !== 'idle'"
      class="mt-4 rounded-md border bg-background p-3"
    >
      <div class="flex items-center justify-between gap-3 text-xs">
        <span class="font-medium">{{ progress.label || '处理中' }}</span>
        <span
          v-if="progress.percent !== undefined"
          class="tabular-nums text-muted-foreground"
        >
          {{ progress.percent }}%
        </span>
      </div>
      <div class="mt-2 h-2 overflow-hidden rounded-full bg-muted">
        <div
          class="h-full rounded-full bg-primary transition-all"
          :style="{ width: `${progress.percent ?? 8}%` }"
        />
      </div>
      <p
        v-if="progress.error"
        class="mt-2 text-xs text-destructive"
      >
        {{ progress.error }}
      </p>
    </div>

    <div class="mt-4 grid gap-3 lg:grid-cols-2">
      <div
        v-for="model in recommendedModels"
        :key="model.id"
        class="flex min-w-0 flex-col gap-3 rounded-md border bg-background p-3"
      >
        <div class="flex min-w-0 items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="truncate text-sm font-medium">{{ model.name }}</div>
            <div class="mt-1 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
              <span>{{ modelSize(model) }}</span>
              <span v-if="model.quantization">{{ model.quantization }}</span>
              <span v-if="model.backend">{{ model.backend }}</span>
            </div>
          </div>
          <Badge
            v-if="model.installed"
            variant="secondary"
            class="shrink-0"
          >
            已下载
          </Badge>
        </div>

        <Button
          type="button"
          size="sm"
          class="w-full"
          :variant="activeModelId === model.id ? 'secondary' : 'default'"
          :disabled="busy || activeModelId === model.id"
          @click="installModel(model)"
        >
          <CheckCircle2Icon
            v-if="activeModelId === model.id"
            class="size-4"
          />
          <DownloadIcon
            v-else
            class="size-4"
          />
          {{ buttonLabel(model) }}
        </Button>
      </div>
    </div>

    <div
      v-if="!recommendedModels.length"
      class="mt-4 rounded-md border border-dashed p-4 text-sm text-muted-foreground"
    >
      {{ loadingCatalog ? '正在读取模型列表...' : '暂未获取到可用的 OmniInfer 模型。' }}
    </div>
  </section>
</template>

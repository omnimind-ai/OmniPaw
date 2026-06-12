<script setup lang="ts">
import type { InstalledModelRecord, OmniInferProcessState } from '@shared/types/omniinfer'
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useOmniInferStore } from '@/stores/omniinfer'
import { errorToText, useToast } from '@/utils/toast'

const store = useOmniInferStore()
const { snapshot, installedModels, modelsDir, loadingStatus } = storeToRefs(store)
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

const loadedPath = computed(() => snapshot.value.loadedModel?.path ?? '')
const loadedModelDetails = computed(() => snapshot.value.loadedModel)
const canStart = computed(
  () =>
    snapshot.value.process.state === 'stopped' ||
    snapshot.value.process.state === 'crashed' ||
    snapshot.value.process.state === 'unhealthy'
)
const canStop = computed(() => snapshot.value.process.state === 'running')
const isAvailable = computed(() => store.available)

function isLoaded(model: InstalledModelRecord): boolean {
  const target = loadedPath.value
  if (!target) return false
  return target.replace(/\\/g, '/').toLowerCase() === model.path.replace(/\\/g, '/').toLowerCase()
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

async function handleRescan(): Promise<void> {
  try {
    await store.rescanModels()
  } catch (error) {
    toast.error(errorToText(error, '扫描本地模型失败。'))
  }
}

async function handleLoadModel(model: InstalledModelRecord): Promise<void> {
  try {
    await store.selectInstalledModel(model.id)
  } catch (error) {
    toast.error(errorToText(error, '加载模型失败。'))
  }
}

async function handleUnload(): Promise<void> {
  try {
    await store.unloadModel()
  } catch (error) {
    toast.error(errorToText(error, '卸载模型失败。'))
  }
}

async function handlePickGguf(): Promise<void> {
  try {
    const path = await store.pickLocalGguf()
    if (path) {
      toast.success('已选择本地模型，可在列表中加载。')
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

function formatSize(bytes: number): string {
  if (!bytes) return '—'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

onMounted(async () => {
  if (!isAvailable.value) return
  store.subscribe()
  await store.refreshStatus()
  await store.rescanModels().catch(() => {})
})

onBeforeUnmount(() => {
  store.unsubscribe()
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <section class="rounded-lg border bg-card p-4">
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <Badge :class="stateClass[snapshot.process.state]">
            {{ stateLabel[snapshot.process.state] }}
          </Badge>
          <div class="text-sm text-muted-foreground">
            {{ snapshot.server.baseUrl }}
            <span v-if="snapshot.server.online">· 网关在线</span>
            <span v-else>· 网关离线</span>
          </div>
        </div>
        <div class="flex gap-2">
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
          <Button size="sm" variant="ghost" @click="handleOpenLogs">查看日志</Button>
        </div>
      </div>

      <div
        v-if="snapshot.process.state === 'not_bundled'"
        class="mt-3 rounded border border-dashed bg-muted/30 p-3 text-sm text-muted-foreground"
      >
        当前安装包未内置 OmniInfer。可将 OmniInfer 二进制放置到
        <code class="font-mono">resources/omniinfer/</code> 或设置环境变量
        <code class="font-mono">OMNICLAW_OMNIINFER_PATH</code> 指向可执行文件，重启应用后即可启用。
      </div>

      <div v-if="loadedModelDetails" class="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div>
          <span class="text-muted-foreground">当前模型：</span>
          <span class="font-mono break-all">{{ loadedModelDetails.path }}</span>
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
    </section>

    <section class="rounded-lg border bg-card p-4">
      <div class="flex items-center justify-between gap-3">
        <div>
          <h3 class="text-sm font-medium">已安装模型</h3>
          <p class="text-xs text-muted-foreground">
            目录：<code class="font-mono">{{ modelsDir || '—' }}</code>
          </p>
        </div>
        <div class="flex gap-2">
          <Button size="sm" variant="outline" @click="handleRescan">重新扫描</Button>
          <Button size="sm" variant="outline" @click="handlePickGguf">选择本地 .gguf</Button>
          <Button
            size="sm"
            variant="ghost"
            :disabled="!loadedModelDetails"
            @click="handleUnload"
          >
            卸载当前模型
          </Button>
        </div>
      </div>

      <div v-if="installedModels.length === 0" class="mt-3 text-sm text-muted-foreground">
        未发现本地 .gguf 模型。把模型放进上方目录，或点击"选择本地 .gguf"加载磁盘任意位置的文件。
      </div>

      <ul v-else class="mt-3 divide-y">
        <li
          v-for="model in installedModels"
          :key="model.id"
          class="flex items-center justify-between gap-3 py-2"
        >
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <span class="font-medium truncate">{{ model.displayName ?? model.name }}</span>
              <Badge v-if="isLoaded(model)" class="bg-emerald-200 text-emerald-900">已加载</Badge>
              <Badge v-if="model.missing" class="bg-zinc-300 text-zinc-700">文件缺失</Badge>
              <Badge v-if="model.manual" class="bg-blue-200 text-blue-900">手动添加</Badge>
            </div>
            <div class="mt-0.5 text-xs text-muted-foreground truncate">
              {{ model.path }} · {{ formatSize(model.sizeBytes) }}
            </div>
          </div>
          <div>
            <Button
              size="sm"
              :variant="isLoaded(model) ? 'ghost' : 'outline'"
              :disabled="store.isBusyFor(model.id) || isLoaded(model) || model.missing"
              @click="handleLoadModel(model)"
            >
              {{ store.isBusyFor(model.id) ? '加载中…' : isLoaded(model) ? '已加载' : '加载' }}
            </Button>
          </div>
        </li>
      </ul>
    </section>

    <section class="rounded-lg border bg-card p-4">
      <div class="flex items-center justify-between gap-3">
        <div>
          <h3 class="text-sm font-medium">Think 模式</h3>
          <p class="text-xs text-muted-foreground">
            开启后模型可以输出思考过程；部分小模型在关闭 think 时响应更稳定。
          </p>
        </div>
        <Switch :model-value="snapshot.thinking" @update:model-value="handleToggleThinking" />
      </div>
    </section>
  </div>
</template>

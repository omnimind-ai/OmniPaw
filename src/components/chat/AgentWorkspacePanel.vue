<script setup lang="ts">
import {
  ChevronDownIcon,
  DownloadIcon,
  FileTextIcon,
  FolderOpenIcon,
  RefreshCwIcon,
  Trash2Icon,
} from '@lucide/vue'
import type { AgentWorkspaceFileEntry, AgentWorkspaceStatus } from '@shared/types/local-agent'
import { computed, type HTMLAttributes, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { appBridge } from '@/bridge/app'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { errorToText, useToast } from '@/utils/toast'

const route = useRoute()
const toast = useToast()
const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
const open = ref(false)
const loading = ref(false)
const error = ref('')
const status = ref<AgentWorkspaceStatus | null>(null)
const files = ref<AgentWorkspaceFileEntry[]>([])
const pendingPath = ref('')

const sessionId = computed(() => {
  const param = route.params.conversationId
  return Array.isArray(param) ? param[0] || '' : param || ''
})
const available = computed(() => Boolean(appBridge.workspace && sessionId.value))
const visibleFiles = computed(() =>
  files.value
    .filter((file) => file.kind === 'file')
    .sort((first, second) => second.updatedAt - first.updatedAt)
)
const shouldShow = computed(
  () => available.value && Boolean(error.value || visibleFiles.value.length || open.value)
)

onMounted(() => {
  if (available.value) void refresh()
})

watch(sessionId, () => {
  status.value = null
  files.value = []
  error.value = ''
  if (available.value && open.value) void refresh()
})

watch(open, (value) => {
  if (value && available.value && !status.value) void refresh()
})

async function refresh() {
  if (!appBridge.workspace || !sessionId.value) return
  loading.value = true
  error.value = ''
  try {
    const [nextStatus, listing] = await Promise.all([
      appBridge.workspace.status({ sessionId: sessionId.value }),
      appBridge.workspace.listFiles({
        sessionId: sessionId.value,
        recursive: true,
        maxEntries: 100,
      }),
    ])
    status.value = nextStatus
    files.value = listing.entries
  } catch (err) {
    error.value = errorToText(err, 'Workspace 文件加载失败。')
  } finally {
    loading.value = false
  }
}

async function exportFile(path: string) {
  if (!appBridge.workspace || !sessionId.value) return
  pendingPath.value = path
  try {
    const response = await appBridge.workspace.exportFile({ sessionId: sessionId.value, path })
    if (!response.canceled) toast.success('文件已导出。')
  } catch (err) {
    toast.error(errorToText(err, '文件导出失败。'))
  } finally {
    pendingPath.value = ''
  }
}

async function deleteFile(path: string) {
  if (!appBridge.workspace || !sessionId.value) return
  pendingPath.value = path
  try {
    await appBridge.workspace.deleteFile({ sessionId: sessionId.value, path })
    files.value = files.value.filter((file) => file.path !== path)
    toast.success('Workspace 文件已删除。')
  } catch (err) {
    toast.error(errorToText(err, '文件删除失败。'))
  } finally {
    pendingPath.value = ''
  }
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}
</script>

<template>
  <Collapsible
    v-if="shouldShow"
    v-model:open="open"
    :class="cn('overflow-hidden rounded-xl border bg-background/95 shadow-sm backdrop-blur', props.class)"
  >
    <div class="flex items-center justify-between gap-3 px-3 py-2">
      <div class="flex min-w-0 items-center gap-2">
        <div class="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <FolderOpenIcon aria-hidden="true" />
        </div>
        <div class="min-w-0">
          <p class="truncate text-sm font-medium">Workspace</p>
          <p class="truncate text-xs text-muted-foreground">
            {{ status ? `${visibleFiles.length} 个文件 · ${formatBytes(status.sizeBytes)}` : '生成文件' }}
          </p>
        </div>
      </div>

      <div class="flex shrink-0 items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          :disabled="loading"
          aria-label="刷新 workspace 文件"
          @click="refresh"
        >
          <RefreshCwIcon
            data-icon="inline-start"
            :class="cn(loading && 'animate-spin')"
          />
        </Button>
        <CollapsibleTrigger as-child>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            :aria-label="open ? '收起 workspace 文件' : '展开 workspace 文件'"
          >
            <ChevronDownIcon
              data-icon="inline-start"
              :class="cn('transition-transform', open && 'rotate-180')"
            />
          </Button>
        </CollapsibleTrigger>
      </div>
    </div>

    <CollapsibleContent>
      <div
        v-if="error"
        class="border-t px-3 py-3 text-sm text-destructive"
      >
        {{ error }}
      </div>

      <div
        v-else-if="loading"
        class="flex flex-col gap-2 border-t px-3 py-3"
      >
        <Skeleton class="h-10 w-full" />
        <Skeleton class="h-10 w-full" />
      </div>

      <div
        v-else-if="!visibleFiles.length"
        class="border-t px-3 py-4 text-sm text-muted-foreground"
      >
        当前会话还没有生成的 workspace 文件。
      </div>

      <ul
        v-else
        class="flex max-h-64 flex-col overflow-auto border-t"
      >
        <li
          v-for="file in visibleFiles"
          :key="file.path"
          class="flex items-center justify-between gap-3 border-b px-3 py-2 last:border-b-0"
        >
          <div class="flex min-w-0 items-center gap-2">
            <FileTextIcon class="shrink-0 text-muted-foreground" />
            <div class="min-w-0">
              <p class="truncate text-sm font-medium">{{ file.path }}</p>
              <p class="text-xs text-muted-foreground">{{ formatBytes(file.sizeBytes) }}</p>
            </div>
          </div>
          <div class="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              :disabled="Boolean(pendingPath)"
              aria-label="导出 workspace 文件"
              @click="exportFile(file.path)"
            >
              <DownloadIcon data-icon="inline-start" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              :disabled="Boolean(pendingPath)"
              aria-label="删除 workspace 文件"
              @click="deleteFile(file.path)"
            >
              <Trash2Icon data-icon="inline-start" />
            </Button>
          </div>
        </li>
      </ul>
    </CollapsibleContent>
  </Collapsible>
</template>

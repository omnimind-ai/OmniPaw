<script setup lang="ts">
import {
  ChevronDownIcon,
  DownloadIcon,
  EyeIcon,
  FolderOpenIcon,
  PencilIcon,
  PlusIcon,
} from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { appBridge } from '@/bridge/app'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { WorkspaceFileChange } from '@/utils/chat-file-changes'
import { errorToText, useToast } from '@/utils/toast'
import MarkdownMessagePart from './MarkdownMessagePart.vue'

const VISIBLE_LIMIT = 6

const props = defineProps<{
  sessionId: string
  changes: WorkspaceFileChange[]
}>()

const toast = useToast()
const { t } = useI18n()
const expanded = ref(false)
const pendingPath = ref('')
const previewOpen = ref(false)
const previewLoading = ref(false)
const previewError = ref('')
const previewPath = ref('')
const previewBinary = ref(false)
const previewTruncated = ref(false)
const previewContent = ref('')

const visibleChanges = computed(() =>
  expanded.value ? props.changes : props.changes.slice(0, VISIBLE_LIMIT)
)
const hiddenCount = computed(() => Math.max(0, props.changes.length - VISIBLE_LIMIT))
const workspaceAvailable = computed(() => Boolean(appBridge.workspace && props.sessionId))

function actionIcon(action: WorkspaceFileChange['action']) {
  return action === 'write' ? PlusIcon : PencilIcon
}

function fileName(path: string) {
  const cleaned = path.replace(/\\+/g, '/')
  const slash = cleaned.lastIndexOf('/')
  return slash >= 0 ? cleaned.slice(slash + 1) : cleaned
}

function fileDir(path: string) {
  const cleaned = path.replace(/\\+/g, '/')
  const slash = cleaned.lastIndexOf('/')
  return slash >= 0 ? cleaned.slice(0, slash) : ''
}

async function reveal(change: WorkspaceFileChange) {
  if (!appBridge.workspace || !workspaceAvailable.value) return
  pendingPath.value = change.path
  try {
    await appBridge.workspace.revealFile({ sessionId: props.sessionId, path: change.path })
  } catch (err) {
    toast.error(errorToText(err, t('chat.fileChanges.errors.revealFailed')))
  } finally {
    pendingPath.value = ''
  }
}

async function exportTo(change: WorkspaceFileChange) {
  if (!appBridge.workspace || !workspaceAvailable.value) return
  pendingPath.value = change.path
  try {
    const response = await appBridge.workspace.exportFile({
      sessionId: props.sessionId,
      path: change.path,
    })
    if (!response.canceled) toast.success(t('chat.fileChanges.toasts.exported'))
  } catch (err) {
    toast.error(errorToText(err, t('chat.fileChanges.errors.exportFailed')))
  } finally {
    pendingPath.value = ''
  }
}

async function preview(change: WorkspaceFileChange) {
  if (!appBridge.workspace || !workspaceAvailable.value) return
  previewOpen.value = true
  previewLoading.value = true
  previewError.value = ''
  previewPath.value = change.path
  previewContent.value = ''
  previewBinary.value = false
  previewTruncated.value = false
  try {
    const response = await appBridge.workspace.readFile({
      sessionId: props.sessionId,
      path: change.path,
    })
    previewBinary.value = response.binary
    previewTruncated.value = response.truncated
    previewContent.value = response.content
  } catch (err) {
    previewError.value = errorToText(err, t('chat.fileChanges.errors.previewFailed'))
  } finally {
    previewLoading.value = false
  }
}

const previewIsMarkdown = computed(() => /\.(md|markdown|mdx)$/i.test(previewPath.value))
</script>

<template>
  <div
    v-if="changes.length"
    class="flex flex-col gap-1.5 rounded-lg border bg-background/60 p-2 text-xs"
  >
    <div class="flex items-center gap-2 px-1 py-0.5 text-muted-foreground">
      <span class="font-medium text-foreground">
        {{ t('chat.fileChanges.title', { count: changes.length }) }}
      </span>
    </div>

    <ul class="flex flex-col gap-1">
      <li
        v-for="change in visibleChanges"
        :key="change.path"
        class="flex items-center gap-2 rounded-md border bg-background/80 px-2 py-1.5"
      >
        <div class="flex size-4 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <component
            :is="actionIcon(change.action)"
            aria-hidden="true"
          />
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="truncate text-sm font-medium text-foreground">
              {{ fileName(change.path) }}
            </span>
          </div>
          <p
            v-if="fileDir(change.path)"
            class="truncate text-[0.7rem] text-muted-foreground"
            :title="change.path"
          >
            {{ fileDir(change.path) }}/
          </p>
        </div>

        <div class="flex shrink-0 items-center">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            :disabled="!workspaceAvailable || pendingPath === change.path"
            :aria-label="t('chat.fileChanges.actions.reveal')"
            :title="t('chat.fileChanges.actions.reveal')"
            @click="reveal(change)"
          >
            <FolderOpenIcon data-icon="inline-start" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            :disabled="!workspaceAvailable || pendingPath === change.path"
            :aria-label="t('chat.fileChanges.actions.export')"
            :title="t('chat.fileChanges.actions.export')"
            @click="exportTo(change)"
          >
            <DownloadIcon data-icon="inline-start" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            :disabled="!workspaceAvailable || pendingPath === change.path"
            :aria-label="t('chat.fileChanges.actions.preview')"
            :title="t('chat.fileChanges.actions.preview')"
            @click="preview(change)"
          >
            <EyeIcon data-icon="inline-start" />
          </Button>
        </div>
      </li>
    </ul>

    <Button
      v-if="hiddenCount > 0"
      type="button"
      variant="ghost"
      size="xs"
      class="self-start text-muted-foreground"
      @click="expanded = !expanded"
    >
      <ChevronDownIcon
        data-icon="inline-start"
        :class="cn('transition-transform', expanded && 'rotate-180')"
      />
      {{
        expanded
          ? t('chat.fileChanges.actions.collapse')
          : t('chat.fileChanges.actions.expandRemaining', { count: hiddenCount })
      }}
    </Button>

    <Sheet v-model:open="previewOpen">
      <SheetContent
        side="right"
        class="flex w-full flex-col gap-0 p-0 sm:max-w-xl"
      >
        <SheetHeader class="border-b">
          <SheetTitle class="truncate pr-8">
            {{ previewPath || t('chat.fileChanges.preview.title') }}
          </SheetTitle>
          <SheetDescription>
            <span class="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="outline">{{ t('chat.fileChanges.preview.badge') }}</Badge>
              <span
                v-if="previewTruncated"
                class="text-muted-foreground"
              >{{ t('chat.fileChanges.preview.truncated') }}</span>
              <span
                v-if="previewBinary"
                class="text-muted-foreground"
              >{{ t('chat.fileChanges.preview.binaryMeta') }}</span>
            </span>
          </SheetDescription>
        </SheetHeader>

        <div class="min-h-0 flex-1 overflow-auto p-4">
          <div
            v-if="previewLoading"
            class="flex flex-col gap-2"
          >
            <Skeleton class="h-4 w-2/3" />
            <Skeleton class="h-4 w-full" />
            <Skeleton class="h-4 w-4/5" />
          </div>
          <p
            v-else-if="previewError"
            class="text-sm text-destructive"
          >
            {{ previewError }}
          </p>
          <p
            v-else-if="previewBinary"
            class="text-sm text-muted-foreground"
          >
            {{ t('chat.fileChanges.preview.binaryHint') }}
          </p>
          <MarkdownMessagePart
            v-else-if="previewIsMarkdown"
            :content="previewContent"
            compact
          />
          <pre
            v-else
            class="whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs leading-5 text-muted-foreground"
          >{{ previewContent || '(文件为空)' }}</pre>
        </div>
      </SheetContent>
    </Sheet>
  </div>
</template>

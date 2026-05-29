<script setup lang="ts">
import {
  CheckIcon,
  CopyIcon,
  Edit3Icon,
  GitBranchIcon,
  RefreshCwIcon,
  TextQuoteIcon,
} from 'lucide-vue-next'
import { computed } from 'vue'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const props = withDefaults(
  defineProps<{
    time?: string
    streaming?: boolean
    aborted?: boolean
    errored?: boolean
    checkpointId?: string | null
    user?: boolean
    copied?: boolean
    disableRegenerate?: boolean
  }>(),
  {
    time: '',
    streaming: false,
    aborted: false,
    errored: false,
    checkpointId: null,
    user: false,
    copied: false,
    disableRegenerate: false,
  }
)

const emit = defineEmits<{
  copy: []
  quote: []
  edit: []
  continueMessage: []
  regenerate: []
}>()

const toolbarClasses = computed(() =>
  cn(
    'flex min-h-7 w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground',
    props.user && 'px-1'
  )
)

const hoverRevealClasses =
  'opacity-100 md:opacity-0 md:transition-opacity md:group-hover/message:opacity-100 md:group-focus-within/message:opacity-100'
</script>

<template>
  <div :class="toolbarClasses">
    <div class="flex min-w-0 flex-wrap items-center gap-2">
      <span
        v-if="time"
        :class="cn('shrink-0', hoverRevealClasses)"
      >
        {{ time }}
      </span>
      <Badge
        v-if="streaming"
        :class="hoverRevealClasses"
        variant="outline"
      >
        生成中
      </Badge>
      <Badge
        v-else-if="aborted"
        :class="hoverRevealClasses"
        variant="secondary"
      >
        已停止
      </Badge>
      <Badge
        v-else-if="errored"
        :class="hoverRevealClasses"
        variant="destructive"
      >
        错误
      </Badge>
      <Badge
        v-if="checkpointId"
        :class="hoverRevealClasses"
        variant="outline"
      >
        <GitBranchIcon data-icon="inline-start" />
        checkpoint
      </Badge>
    </div>

    <div :class="cn('flex flex-wrap items-center justify-end gap-1', hoverRevealClasses)">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="复制消息"
        @click="emit('copy')"
      >
        <CheckIcon
          v-if="copied"
          data-icon="inline-start"
        />
        <CopyIcon
          v-else
          data-icon="inline-start"
        />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="引用消息"
        @click="emit('quote')"
      >
        <TextQuoteIcon data-icon="inline-start" />
      </Button>
      <Button
        v-if="user"
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="编辑消息"
        @click="emit('edit')"
      >
        <Edit3Icon data-icon="inline-start" />
      </Button>
      <Button
        v-if="user"
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="继续生成"
        @click="emit('continueMessage')"
      >
        <RefreshCwIcon data-icon="inline-start" />
      </Button>
      <Button
        v-if="!user && !disableRegenerate"
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="重新生成"
        @click="emit('regenerate')"
      >
        <RefreshCwIcon data-icon="inline-start" />
      </Button>
    </div>
  </div>
</template>

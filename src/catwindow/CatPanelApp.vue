<script setup lang="ts">
import type { CatPanelPlacement, CatTaskState } from '@shared/types/cat'
import {
  CheckCircle2Icon,
  Clock3Icon,
  LoaderCircleIcon,
  PauseCircleIcon,
  XIcon,
} from 'lucide-vue-next'
import type { Component } from 'vue'
import { computed, onBeforeUnmount, ref } from 'vue'
import { appBridge } from '@/bridge/app'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

type PanelSide = NonNullable<CatPanelPlacement['side']>

interface QuickAction {
  state: CatTaskState
  label: string
  hint: string
  icon: Component
}

const side = ref<PanelSide>('right')
const pendingState = ref<CatTaskState | null>(null)
const hiding = ref(false)

const sideLabels: Record<PanelSide, string> = {
  left: '左侧',
  right: '右侧',
}

const quickActions: QuickAction[] = [
  {
    state: 'idle',
    label: '待命',
    hint: 'idle',
    icon: PauseCircleIcon,
  },
  {
    state: 'preparing',
    label: '准备',
    hint: 'preparing',
    icon: Clock3Icon,
  },
  {
    state: 'running',
    label: '执行中',
    hint: 'running',
    icon: LoaderCircleIcon,
  },
  {
    state: 'completed',
    label: '完成',
    hint: 'completed',
    icon: CheckCircle2Icon,
  },
]

const sideLabel = computed(() => sideLabels[side.value])

const pointerClass = computed(() =>
  side.value === 'right'
    ? 'left-3.5 -translate-y-1/2 rotate-45 border-r-0 border-t-0'
    : 'right-3.5 -translate-y-1/2 rotate-[225deg] border-r-0 border-t-0'
)

function applyPlacement(placement: CatPanelPlacement) {
  side.value = placement.side === 'left' ? 'left' : 'right'
}

async function setCatState(state: CatTaskState) {
  pendingState.value = state

  try {
    await appBridge.cat.setState(state)
  } finally {
    if (pendingState.value === state) {
      pendingState.value = null
    }
  }
}

async function hideCat() {
  hiding.value = true

  try {
    await appBridge.cat.hide()
  } finally {
    hiding.value = false
  }
}

const unsubscribePlacement = appBridge.catPanel.onPlacement(applyPlacement)

onBeforeUnmount(() => {
  unsubscribePlacement()
})
</script>

<template>
  <main
    class="relative size-full p-5 text-foreground select-none"
    :data-side="side"
    aria-label="小猫快捷面板"
  >
    <div
      :class="
        cn(
          'absolute top-1/2 z-10 size-3.5 border border-border bg-card shadow-sm',
          pointerClass,
        )
      "
      aria-hidden="true"
    />

    <Card
      size="sm"
      class="h-full w-full gap-2 rounded-lg border-border/80 bg-card/95 shadow-xl backdrop-blur"
    >
      <CardHeader class="gap-1 px-3 pt-2.5">
        <div class="flex items-center justify-between gap-2">
          <Badge
            variant="secondary"
            class="min-w-0 uppercase"
          >
            Cat Panel
          </Badge>
          <Badge
            variant="outline"
            class="shrink-0"
          >
            {{ sideLabel }}
          </Badge>
        </div>
        <CardTitle class="text-base font-semibold">快捷控制</CardTitle>
        <CardDescription class="text-xs">小猫状态与窗口控制</CardDescription>
      </CardHeader>

      <CardContent class="flex min-h-0 flex-1 flex-col gap-2 px-3">
        <div
          class="grid min-w-0 grid-cols-2 gap-2"
          aria-label="快捷动作"
        >
          <Button
            v-for="action in quickActions"
            :key="action.state"
            type="button"
            variant="outline"
            :disabled="pendingState !== null || hiding"
            class="h-10 w-full min-w-0 flex-col items-start justify-center gap-0.5 overflow-hidden px-2.5 text-left"
            @click="setCatState(action.state)"
          >
            <span class="flex w-full items-center gap-1.5 truncate">
              <component
                :is="action.icon"
                data-icon="inline-start"
                :class="cn(action.state === 'running' && pendingState === action.state && 'animate-spin')"
              />
              <span class="truncate">{{ action.label }}</span>
            </span>
            <span class="text-muted-foreground text-[10px] leading-none">{{ action.hint }}</span>
          </Button>
        </div>

        <Separator />

        <dl class="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
          <dt class="text-muted-foreground font-medium">展开方向</dt>
          <dt class="text-muted-foreground font-medium">布局模式</dt>
          <dd class="font-semibold">{{ sideLabel }}</dd>
          <dd class="font-semibold">独立窗口</dd>
        </dl>
      </CardContent>

      <CardFooter class="bg-muted/40 p-2.5">
        <Button
          type="button"
          variant="secondary"
          class="h-8 w-full"
          :disabled="hiding || pendingState !== null"
          @click="hideCat"
        >
          <XIcon data-icon="inline-start" />
          收起
        </Button>
      </CardFooter>
    </Card>
  </main>
</template>

<style scoped>
:global(html),
:global(body),
:global(#app) {
  width: 100%;
  height: 100%;
  margin: 0;
  overflow: hidden;
  background: transparent;
  user-select: none;
}

:global(body) {
  min-width: 0;
  min-height: 0;
}
</style>

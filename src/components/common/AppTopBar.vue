<script setup lang="ts">
import { CopyIcon, MinusIcon, SquareIcon, XIcon } from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import brandLogoUrl from '@/asserts/brand-logo.png'
import { appBridge, type BridgeDesktopWindowState, type BridgeUnsubscribe } from '@/bridge/app'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type WindowAction = 'close' | 'minimize' | 'toggleMaximize'

interface MacControl {
  action: WindowAction
  label: string
  circleClass: string
  icon: typeof XIcon
}

const windowState = ref<BridgeDesktopWindowState>({
  platform: 'win32',
  isMaximized: false,
})
let unsubscribeWindowState: BridgeUnsubscribe | undefined

const isMac = computed(() => windowState.value.platform === 'darwin')
const maximizeLabel = computed(() => (windowState.value.isMaximized ? '还原' : '最大化'))
const maximizeIcon = computed(() => (windowState.value.isMaximized ? CopyIcon : SquareIcon))
const macControls = computed<MacControl[]>(() => [
  {
    action: 'close',
    label: '关闭',
    circleClass: 'bg-[#ff5f57]',
    icon: XIcon,
  },
  {
    action: 'minimize',
    label: '最小化',
    circleClass: 'bg-[#ffbd2e]',
    icon: MinusIcon,
  },
  {
    action: 'toggleMaximize',
    label: maximizeLabel.value,
    circleClass: 'bg-[#28c840]',
    icon: maximizeIcon.value,
  },
])

onMounted(() => {
  void refreshWindowState()
  unsubscribeWindowState = appBridge.window.onStateChanged((state) => {
    windowState.value = state
  })
})

onBeforeUnmount(() => {
  unsubscribeWindowState?.()
})

async function refreshWindowState(): Promise<void> {
  windowState.value = await appBridge.window.getState()
}

async function runWindowAction(action: WindowAction): Promise<void> {
  if (action === 'close') {
    await appBridge.window.close()
    return
  }

  const nextState =
    action === 'minimize'
      ? await appBridge.window.minimize()
      : await appBridge.window.toggleMaximize()
  windowState.value = nextState
}

function handleWindowAction(action: WindowAction): void {
  void runWindowAction(action).catch(() => {})
}
</script>

<template>
  <header
    class="relative z-[60] flex h-(--app-topbar-height) shrink-0 items-center overflow-hidden border-b border-border bg-background text-foreground"
    style="-webkit-app-region: drag"
  >
    <div
      v-if="isMac"
      class="relative z-10 flex h-full w-24 items-center gap-1 px-2.5"
      style="-webkit-app-region: no-drag"
    >
      <button
        v-for="control in macControls"
        :key="control.action"
        type="button"
        :aria-label="control.label"
        class="group flex size-[18px] items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
        @click="handleWindowAction(control.action)"
      >
        <span
          :class="
            cn('flex size-2.5 items-center justify-center rounded-full', control.circleClass)
          "
        >
          <component
            :is="control.icon"
            class="size-1.5 opacity-0 transition-opacity group-hover:opacity-80"
          />
        </span>
      </button>
    </div>

    <div
      v-else
      class="relative z-10 h-full w-28"
    />

    <div class="pointer-events-none absolute inset-0 flex items-center justify-center px-28">
      <img
        :src="brandLogoUrl"
        alt="OpenOmniClaw"
        class="h-4 w-auto max-w-[min(42vw,8rem)] object-contain"
        draggable="false"
      />
    </div>

    <div
      v-if="!isMac"
      class="relative z-10 ml-auto flex h-full"
      style="-webkit-app-region: no-drag"
    >
      <Button
        type="button"
        variant="ghost"
        class="h-full w-9 rounded-none text-muted-foreground hover:bg-muted hover:text-foreground"
        :aria-label="'最小化'"
        @click="handleWindowAction('minimize')"
      >
        <MinusIcon data-icon />
      </Button>

      <Button
        type="button"
        variant="ghost"
        class="h-full w-9 rounded-none text-muted-foreground hover:bg-muted hover:text-foreground"
        :aria-label="maximizeLabel"
        @click="handleWindowAction('toggleMaximize')"
      >
        <component
          :is="maximizeIcon"
          data-icon
        />
      </Button>

      <Button
        type="button"
        variant="ghost"
        class="h-full w-10 rounded-none text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
        :aria-label="'关闭'"
        @click="handleWindowAction('close')"
      >
        <XIcon data-icon />
      </Button>
    </div>

    <div
      v-else
      class="relative z-10 ml-auto h-full w-28"
    />
  </header>
</template>

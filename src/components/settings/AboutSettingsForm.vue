<script setup lang="ts">
import { DownloadIcon, FolderOpenIcon, GithubIcon, RotateCwIcon } from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import aboutIconUrl from '@/asserts/about_icon.png'
import { appBridge } from '@/bridge/app'
import { Button } from '@/components/ui/button'
import { errorToText, useToast } from '@/utils/toast'

const GITHUB_URL = 'https://github.com/omnimind-ai/OpenOmniClaw-electron'

const toast = useToast()
const appInfo = ref({
  name: 'OpenOmniClaw',
  version: 'dev',
  platform: '',
})
const checkingUpdates = ref(false)
const exportingLog = ref(false)
const openingSettingsDirectory = ref(false)
let updateTimer: ReturnType<typeof window.setTimeout> | undefined

const versionLabel = computed(() => `Version ${appInfo.value.version || 'dev'}`)

onMounted(() => {
  void loadAppInfo()
})

onBeforeUnmount(() => {
  if (updateTimer) {
    window.clearTimeout(updateTimer)
  }
})

async function loadAppInfo() {
  try {
    appInfo.value = await appBridge.app.getInfo()
  } catch (error) {
    toast.error(errorToText(error, '应用信息加载失败。'))
  }
}

async function checkForUpdates() {
  checkingUpdates.value = true
  updateTimer = window.setTimeout(() => {
    checkingUpdates.value = false
    updateTimer = undefined
    toast.info('检查更新能力待接入。')
  }, 500)
}

async function exportLog() {
  exportingLog.value = true
  try {
    const response = await appBridge.logging.export?.()
    if (!response || response.reason === 'unavailable') {
      toast.warning('当前运行环境没有可导出的日志文件。')
      return
    }
    if (response.canceled) {
      return
    }
    if (response.exported) {
      toast.success('日志已导出。')
      return
    }
    toast.warning('日志未导出。')
  } catch (error) {
    toast.error(errorToText(error, '日志导出失败。'))
  } finally {
    exportingLog.value = false
  }
}

async function openSettingsDirectory() {
  openingSettingsDirectory.value = true
  try {
    const response = await appBridge.app.openSettingsDirectory()
    if (!response.opened) {
      toast.warning('当前运行环境没有可打开的设置目录。')
      return
    }
    toast.success('已打开设置目录。')
  } catch (error) {
    toast.error(errorToText(error, '设置目录打开失败。'))
  } finally {
    openingSettingsDirectory.value = false
  }
}

function openGithub() {
  window.open(GITHUB_URL, '_blank', 'noopener,noreferrer')
}
</script>

<template>
  <div class="flex min-h-[calc(100vh-9rem)] w-full items-center justify-center px-4 py-10">
    <div class="flex w-full max-w-sm flex-col items-center text-center">
      <img
        :src="aboutIconUrl"
        alt=""
        class="size-28 object-contain drop-shadow-sm"
        draggable="false"
      />

      <div class="mt-5 flex flex-col items-center gap-2">
        <h1 class="text-4xl font-semibold tracking-normal text-foreground">
          OmniClaw
        </h1>
        <p class="text-sm font-medium text-muted-foreground">
          {{ versionLabel }}
        </p>
      </div>

      <div class="mt-8 flex w-full flex-col gap-3">
        <Button
          class="h-11 w-full"
          :disabled="checkingUpdates"
          @click="checkForUpdates"
        >
          <RotateCwIcon data-icon="inline-start" />
          {{ checkingUpdates ? '检查中' : '检查更新' }}
        </Button>

        <Button
          variant="outline"
          class="h-11 w-full"
          :disabled="exportingLog"
          @click="exportLog"
        >
          <DownloadIcon data-icon="inline-start" />
          {{ exportingLog ? '导出中' : '导出日志' }}
        </Button>

        <Button
          variant="outline"
          class="h-11 w-full"
          :disabled="openingSettingsDirectory"
          @click="openSettingsDirectory"
        >
          <FolderOpenIcon data-icon="inline-start" />
          {{ openingSettingsDirectory ? '打开中' : '查看设置目录' }}
        </Button>

        <Button
          variant="outline"
          class="h-11 w-full"
          @click="openGithub"
        >
          <GithubIcon data-icon="inline-start" />
          打开 GitHub
        </Button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { DownloadIcon, FolderOpenIcon, GithubIcon, RotateCwIcon } from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import aboutIconUrl from '@/asserts/about_icon.png'
import { appBridge } from '@/bridge/app'
import { Button } from '@/components/ui/button'
import { errorToText, useToast } from '@/utils/toast'

const GITHUB_URL = 'https://github.com/omnimind-ai/OpenOmniClaw-electron'

const toast = useToast()
const { t } = useI18n()
const appInfo = ref({
  name: 'OpenOmniClaw',
  version: '0.1.1',
  buildTime: '',
  commit: '',
  isPackaged: false,
  omniInferPackaged: false,
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
    toast.error(errorToText(error, t('settings.about.errors.loadInfoFailed')))
  }
}

async function checkForUpdates() {
  checkingUpdates.value = true
  updateTimer = window.setTimeout(() => {
    checkingUpdates.value = false
    updateTimer = undefined
    toast.info(t('settings.about.messages.checkUpdatesComingSoon'))
  }, 500)
}

async function exportLog() {
  exportingLog.value = true
  try {
    const response = await appBridge.logging.export?.()
    if (!response || response.reason === 'unavailable') {
      toast.warning(t('settings.about.messages.noLogsAvailable'))
      return
    }
    if (response.canceled) {
      return
    }
    if (response.exported) {
      toast.success(t('settings.about.messages.logExportedSuccess'))
      return
    }
    toast.warning(t('settings.about.messages.logNotExported'))
  } catch (error) {
    toast.error(errorToText(error, t('settings.about.errors.exportLogFailed')))
  } finally {
    exportingLog.value = false
  }
}

async function openSettingsDirectory() {
  openingSettingsDirectory.value = true
  try {
    const response = await appBridge.app.openSettingsDirectory()
    if (!response.opened) {
      toast.warning(t('settings.about.messages.noSettingsDirAvailable'))
      return
    }
    toast.success(t('settings.about.messages.settingsDirOpenedSuccess'))
  } catch (error) {
    toast.error(errorToText(error, t('settings.about.errors.openSettingsDirFailed')))
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
          {{ checkingUpdates ? $t('settings.about.buttons.checkingUpdates') : $t('settings.about.buttons.checkForUpdates') }}
        </Button>

        <Button
          variant="outline"
          class="h-11 w-full"
          :disabled="exportingLog"
          @click="exportLog"
        >
          <DownloadIcon data-icon="inline-start" />
          {{ exportingLog ? $t('settings.about.buttons.exportingLog') : $t('settings.about.buttons.exportLog') }}
        </Button>

        <Button
          variant="outline"
          class="h-11 w-full"
          :disabled="openingSettingsDirectory"
          @click="openSettingsDirectory"
        >
          <FolderOpenIcon data-icon="inline-start" />
          {{ openingSettingsDirectory ? $t('settings.about.buttons.opening') : $t('settings.about.buttons.viewSettingsDir') }}
        </Button>

        <Button
          variant="outline"
          class="h-11 w-full"
          @click="openGithub"
        >
          <GithubIcon data-icon="inline-start" />
          {{ $t('settings.about.buttons.openGithub') }}
        </Button>
      </div>
    </div>
  </div>
</template>

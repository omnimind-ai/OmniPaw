<script setup lang="ts">
import { CodeIcon, DownloadIcon, FolderOpenIcon, RotateCwIcon } from '@lucide/vue'
import type { UpdateCheckResult } from '@shared/types/update'
import { computed, onMounted, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import aboutIconUrl from '@/asserts/about_icon.png'
import { appBridge } from '@/bridge/app'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { errorToText, useToast } from '@/utils/toast'

const GITHUB_URL = 'https://github.com/Saramanda9988/OpenOmniClaw-electron'
const GITHUB_RELEASES_URL = `${GITHUB_URL}/releases/latest`

const toast = useToast()
const { t } = useI18n()
const appInfo = ref({
  name: 'OmniPaw',
  version: '0.1.1',
  buildTime: '',
  commit: '',
  isPackaged: false,
  omniInferPackaged: false,
  platform: '',
})
const checkingUpdates = ref(false)
const updateDialogOpen = ref(false)
const updateInfo = shallowRef<UpdateCheckResult>()
const exportingLog = ref(false)
const openingSettingsDirectory = ref(false)

const versionLabel = computed(() => `Version ${appInfo.value.version || 'dev'}`)
const updateDownloadUrl = computed(() => {
  const candidate = updateInfo.value?.downloads.github
  if (!candidate) {
    return GITHUB_RELEASES_URL
  }

  try {
    const url = new URL(candidate)
    const expected = new URL(GITHUB_URL)
    if (
      url.protocol === 'https:' &&
      url.hostname === expected.hostname &&
      url.pathname.startsWith(`${expected.pathname}/releases`)
    ) {
      return url.toString()
    }
  } catch {
    // Fall back to the known releases page.
  }

  return GITHUB_RELEASES_URL
})

onMounted(() => {
  void loadAppInfo()
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
  try {
    const result = await appBridge.app.checkForUpdates()
    updateInfo.value = result
    if (result.hasUpdate) {
      updateDialogOpen.value = true
      return
    }
    toast.success(t('settings.about.messages.upToDate', { version: result.currentVersion }))
  } catch (error) {
    toast.error(errorToText(error, t('settings.about.errors.checkUpdatesFailed')))
  } finally {
    checkingUpdates.value = false
  }
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

function openReleases() {
  window.open(updateDownloadUrl.value, '_blank', 'noopener,noreferrer')
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
          OmniPaw
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
          <CodeIcon data-icon="inline-start" />
          {{ $t('settings.about.buttons.openGithub') }}
        </Button>
      </div>
    </div>

    <Dialog v-model:open="updateDialogOpen">
      <DialogContent
        v-if="updateInfo"
        class="sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle>{{ t('settings.about.updateDialog.title') }}</DialogTitle>
          <DialogDescription>
            {{
              t('settings.about.updateDialog.description', {
                version: updateInfo.version,
              })
            }}
          </DialogDescription>
        </DialogHeader>

        <div class="space-y-4">
          <dl class="grid grid-cols-[1fr_auto] gap-x-6 gap-y-2 rounded-lg border p-4 text-sm">
            <dt class="text-muted-foreground">
              {{ t('settings.about.updateDialog.currentVersion') }}
            </dt>
            <dd class="font-mono">
              v{{ updateInfo.currentVersion }}
            </dd>
            <dt class="text-muted-foreground">
              {{ t('settings.about.updateDialog.latestVersion') }}
            </dt>
            <dd class="font-mono font-medium text-primary">
              v{{ updateInfo.version }}
            </dd>
            <template v-if="updateInfo.releaseDate">
              <dt class="text-muted-foreground">
                {{ t('settings.about.updateDialog.releaseDate') }}
              </dt>
              <dd>
                <time :datetime="updateInfo.releaseDate">{{ updateInfo.releaseDate }}</time>
              </dd>
            </template>
          </dl>

          <section>
            <h3 class="mb-2 text-sm font-medium">
              {{ t('settings.about.updateDialog.changelog') }}
            </h3>
            <div
              v-if="updateInfo.changelog.length"
              class="max-h-56 space-y-1 overflow-y-auto rounded-lg bg-muted/50 p-4 text-sm"
            >
              <p
                v-for="(line, index) in updateInfo.changelog"
                :key="`${index}-${line}`"
                class="whitespace-pre-wrap"
              >
                {{ line }}
              </p>
            </div>
            <p
              v-else
              class="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground"
            >
              {{ t('settings.about.updateDialog.noChangelog') }}
            </p>
          </section>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            @click="updateDialogOpen = false"
          >
            {{ t('settings.about.buttons.close') }}
          </Button>
          <Button @click="openReleases">
            <DownloadIcon data-icon="inline-start" />
            {{ t('settings.about.buttons.openReleases') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

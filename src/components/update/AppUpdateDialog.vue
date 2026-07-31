<script setup lang="ts">
import { DownloadIcon } from '@lucide/vue'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAppUpdateStore } from '@/stores/update'

const GITHUB_URL = 'https://github.com/Saramanda9988/OpenOmniClaw-electron'
const GITHUB_RELEASES_URL = `${GITHUB_URL}/releases/latest`

const { t } = useI18n()
const updateStore = useAppUpdateStore()
const { dialogOpen, updateInfo } = storeToRefs(updateStore)

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

function openReleases() {
  window.open(updateDownloadUrl.value, '_blank', 'noopener,noreferrer')
}
</script>

<template>
  <Dialog v-model:open="dialogOpen">
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
          @click="dialogOpen = false"
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
</template>

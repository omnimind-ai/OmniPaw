<script setup lang="ts">
import { DownloadIcon, XIcon } from '@lucide/vue'
import type {
  OmniInferCatalogDownloadFile,
  OmniInferCatalogModel,
  OmniInferCatalogQuantization,
  OmniInferModelDownloadTask,
} from '@shared/types/omniinfer'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import ProviderModelCapabilityBadges from './ProviderModelCapabilityBadges.vue'

const props = defineProps<{
  model: OmniInferCatalogModel
  tasks: OmniInferModelDownloadTask[]
}>()

const emit = defineEmits<{
  action: [quantization: OmniInferCatalogQuantization]
}>()

const { locale, t } = useI18n()

const metadata = computed(() => {
  const items: Array<{ key: string; label: string }> = [
    {
      key: 'source',
      label:
        props.model.source === 'omnicore'
          ? t('settings.provider.models.download.sources.omniCore')
          : t('settings.provider.models.download.sources.huggingFace'),
    },
  ]
  if (props.model.contextLength) {
    items.push({
      key: 'context',
      label: t('settings.provider.models.download.contextLength', {
        count: new Intl.NumberFormat(locale.value).format(props.model.contextLength),
      }),
    })
  }
  if (props.model.downloads) {
    items.push({
      key: 'downloads',
      label: t('settings.provider.models.download.downloadCount', {
        count: formatCount(props.model.downloads),
      }),
    })
  }
  if (props.model.likes) {
    items.push({
      key: 'likes',
      label: t('settings.provider.models.download.likeCount', {
        count: formatCount(props.model.likes),
      }),
    })
  }
  if (props.model.lastModified) {
    items.push({
      key: 'updated',
      label: t('settings.provider.models.download.lastModified', {
        date: formatDate(props.model.lastModified),
      }),
    })
  }
  return items
})

function taskFor(
  quantization: OmniInferCatalogQuantization
): OmniInferModelDownloadTask | undefined {
  const modelId = `${props.model.id}-${quantization.id}`
  return props.tasks.find((task) => task.modelId === modelId)
}

function taskIsActive(task: OmniInferModelDownloadTask | undefined): boolean {
  return task?.status === 'queued' || task?.status === 'downloading'
}

function quantizationFiles(
  quantization: OmniInferCatalogQuantization
): OmniInferCatalogDownloadFile[] {
  return quantization.files?.length
    ? quantization.files
    : [
        {
          download: quantization.download,
          sizeGiB: quantization.sizeGiB,
          filename: quantization.filename,
        },
      ]
}

function supportsVision(): boolean {
  return (
    Boolean(props.model.vision) ||
    props.model.tags.some((tag) => ['vision', '视觉模型'].includes(tag.toLowerCase()))
  )
}

function supportsThinking(): boolean {
  return props.model.tags.some((tag) =>
    ['thinking', 'reasoning', '深度思考'].includes(tag.toLowerCase())
  )
}

function formatSize(sizeGiB?: number): string {
  return sizeGiB && sizeGiB > 0
    ? t('settings.provider.models.download.sizeGiB', { size: sizeGiB.toFixed(2) })
    : t('settings.provider.models.download.sizeUnknown')
}

function formatCount(value: number): string {
  return new Intl.NumberFormat(locale.value, { notation: 'compact' }).format(value)
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(locale.value, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function formatSpeed(value?: number): string {
  return value ? `${formatBytes(value)}/s` : ''
}

function formatBytes(value: number): string {
  if (value >= 1024 * 1024 * 1024) return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`
  return `${(value / 1024).toFixed(1)} KB`
}

function actionLabel(task: OmniInferModelDownloadTask | undefined): string {
  if (taskIsActive(task)) return t('settings.provider.models.download.cancel')
  if (task?.status === 'failed' || task?.status === 'canceled') {
    return t('settings.provider.models.download.retry')
  }
  if (task?.status === 'completed') return t('settings.provider.models.download.downloaded')
  return t('settings.provider.models.download.download')
}
</script>

<template>
  <div class="flex flex-col gap-5 px-5 py-5">
    <section class="flex flex-col gap-3">
      <div class="flex min-w-0 items-start justify-between gap-3">
        <div class="min-w-0">
          <h2 class="break-words text-lg font-semibold">{{ model.name }}</h2>
          <p class="break-words text-sm text-muted-foreground">
            {{ model.repoId || model.provider }}
          </p>
        </div>
        <ProviderModelCapabilityBadges
          :supports-reasoning="supportsThinking()"
          :supports-vision="supportsVision()"
        />
      </div>
      <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span
          v-for="item in metadata"
          :key="item.key"
        >
          {{ item.label }}
        </span>
      </div>
      <div
        v-if="model.vision"
        class="flex flex-col gap-1 rounded-md border bg-muted/30 p-3 text-sm"
      >
        <p class="font-medium">
          {{ t('settings.provider.models.download.visionCompanion') }}
        </p>
        <p class="break-all text-xs text-muted-foreground">
          {{ model.vision.filename || 'mmproj.gguf' }} ·
          {{ formatSize(model.vision.sizeGiB) }}
        </p>
      </div>
    </section>

    <Separator />

    <div class="flex items-center justify-between gap-3">
      <div>
        <h3 class="text-sm font-semibold">
          {{ t('settings.provider.models.download.variantsTitle') }}
        </h3>
        <p class="text-xs text-muted-foreground">
          {{
            t('settings.provider.models.download.variantsDescription', {
              count: model.quantizations.length,
            })
          }}
        </p>
      </div>
    </div>

    <Card
      v-for="quantization in model.quantizations"
      :key="quantization.id"
      class="gap-4"
    >
      <CardHeader class="gap-2">
        <div class="flex min-w-0 items-start justify-between gap-3">
          <div class="min-w-0">
            <CardTitle class="text-sm">{{ quantization.label }}</CardTitle>
            <CardDescription class="break-all">
              {{
                quantization.filename ||
                quantizationFiles(quantization)[0]?.filename ||
                model.name
              }}
            </CardDescription>
          </div>
          <span
            v-if="quantization.suitable === true"
            class="shrink-0 text-xs text-muted-foreground"
          >
            {{ t('settings.provider.models.download.recommended') }}
          </span>
          <span
            v-else-if="quantization.suitable === false"
            class="shrink-0 text-xs text-muted-foreground"
          >
            {{ t('settings.provider.models.download.notRecommended') }}
          </span>
        </div>
      </CardHeader>

      <CardContent class="flex flex-col gap-3">
        <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>{{ formatSize(quantization.sizeGiB) }}</span>
          <span v-if="quantization.backend">{{ quantization.backend }}</span>
          <span v-if="quantization.requiredMemoryGiB">
            {{
              t('settings.provider.models.download.requiredMemory', {
                size: quantization.requiredMemoryGiB.toFixed(1),
              })
            }}
          </span>
          <span v-if="quantizationFiles(quantization).length > 1">
            {{
              t('settings.provider.models.download.fileCount', {
                count: quantizationFiles(quantization).length,
              })
            }}
          </span>
        </div>

        <div
          v-if="quantizationFiles(quantization).length > 1"
          class="flex flex-col gap-2 rounded-md border bg-muted/30 p-3"
        >
          <div
            v-for="file in quantizationFiles(quantization)"
            :key="file.download"
            class="flex items-start justify-between gap-3 text-xs"
          >
            <span class="min-w-0 break-all text-muted-foreground">
              {{ file.filename || t('settings.provider.models.download.unnamedFile') }}
            </span>
            <span class="shrink-0">{{ formatSize(file.sizeGiB) }}</span>
          </div>
        </div>

        <div
          v-if="taskFor(quantization)"
          class="flex flex-col gap-2"
        >
          <div class="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>
              {{
                t(
                  `settings.provider.models.download.status.${taskFor(quantization)?.status}`
                )
              }}
            </span>
            <span>
              {{ Math.round(taskFor(quantization)?.progress ?? 0) }}%
              <template v-if="formatSpeed(taskFor(quantization)?.speedBytesPerSecond)">
                · {{ formatSpeed(taskFor(quantization)?.speedBytesPerSecond) }}
              </template>
            </span>
          </div>
          <Progress :model-value="taskFor(quantization)?.progress ?? 0" />
          <p
            v-if="taskFor(quantization)?.errorMessage"
            class="text-xs text-destructive"
          >
            {{ taskFor(quantization)?.errorMessage }}
          </p>
        </div>
      </CardContent>

      <CardFooter class="justify-end">
        <Button
          type="button"
          :variant="taskIsActive(taskFor(quantization)) ? 'outline' : 'default'"
          :disabled="taskFor(quantization)?.status === 'completed'"
          @click="emit('action', quantization)"
        >
          <DownloadIcon
            v-if="!taskIsActive(taskFor(quantization))"
            data-icon="inline-start"
          />
          <XIcon
            v-else
            data-icon="inline-start"
          />
          {{ actionLabel(taskFor(quantization)) }}
        </Button>
      </CardFooter>
    </Card>
  </div>
</template>

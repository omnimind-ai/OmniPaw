<script setup lang="ts">
import type {
  CatAppearanceAssetKey,
  CatAppearancePackSummary,
  CatAppearanceResolvedPack,
} from '@shared/types/cat-appearance'
import { ImageIcon } from 'lucide-vue-next'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import doTaskImage from '@/asserts/cat/anim_cat_doing_task.webp'
import draggedImage from '@/asserts/cat/anim_cat_dragging.webp'
import endTaskImage from '@/asserts/cat/anim_cat_end_doing.webp'
import finishImage from '@/asserts/cat/anim_cat_finish.webp'
import firstShowImage from '@/asserts/cat/anim_cat_show.webp'
import startTaskImage from '@/asserts/cat/anim_cat_start_doing.webp'
import doTaskFallbackImage from '@/asserts/cat/ic_cat_doing_task.png'
import firstShowFallbackImage from '@/asserts/cat/ic_cat_first_show.png'
import idleImage from '@/asserts/cat/ic_cat_normal.png'
import draggedFallbackImage from '@/asserts/cat/ic_cat_normal_dragging.png'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

const defaultAssetUrls: Partial<Record<CatAppearanceAssetKey, string>> = {
  show: firstShowImage,
  showFallback: firstShowFallbackImage,
  idle: idleImage,
  drag: draggedImage,
  dragFallback: draggedFallbackImage,
  startDoing: startTaskImage,
  doing: doTaskImage,
  doingFallback: doTaskFallbackImage,
  endDoing: endTaskImage,
  finish: finishImage,
}

const assetKeys: CatAppearanceAssetKey[] = [
  'idle',
  'show',
  'showFallback',
  'dragTransition',
  'drag',
  'dragFallback',
  'startDoing',
  'doing',
  'doingFallback',
  'endDoing',
  'finish',
]

const props = defineProps<{
  pack?: CatAppearancePackSummary
  detail?: CatAppearanceResolvedPack
  loading?: boolean
  error?: string
}>()

const { t } = useI18n()

const assetItems = computed(() =>
  assetKeys.map((key) => {
    const customSrc = props.detail?.assets[key]
    const src =
      customSrc ?? (props.detail?.source === 'builtin' ? defaultAssetUrls[key] : undefined)
    return {
      key,
      src,
      configured: Boolean(src),
      label: t(`settings.catAppearance.detail.assetActions.${key}`),
    }
  })
)
</script>

<template>
  <div class="flex flex-col gap-4 rounded-md border bg-card p-4 sm:p-5">
    <div class="flex min-w-0 flex-col gap-1">
      <h2 class="text-base font-medium">
        {{ t('settings.catAppearance.detail.title') }}
      </h2>
      <p class="text-sm text-muted-foreground">
        {{ pack?.description || t('settings.catAppearance.detail.description') }}
      </p>
    </div>

    <div
      v-if="loading"
      class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3"
    >
      <Skeleton
        v-for="index in 6"
        :key="index"
        class="h-40 w-full"
      />
    </div>

    <div
      v-else-if="error"
      class="rounded-md border px-4 py-6 text-sm text-muted-foreground"
    >
      {{ error }}
    </div>

    <div
      v-else
      class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3"
    >
      <div
        v-for="item in assetItems"
        :key="item.key"
        class="flex min-w-0 flex-col gap-3 rounded-md border bg-background/50 p-3"
      >
        <div class="flex min-w-0 items-center justify-between gap-2">
          <h3 class="truncate text-sm font-medium">
            {{ item.label }}
          </h3>
          <Badge
            v-if="!item.configured"
            variant="outline"
          >
            {{ t('settings.catAppearance.detail.notConfigured') }}
          </Badge>
        </div>

        <div class="flex aspect-[4/3] min-h-0 items-center justify-center rounded-md bg-muted/50 p-3">
          <img
            v-if="item.src"
            :src="item.src"
            :alt="t('settings.catAppearance.detail.assetAlt', { name: pack?.name || '', action: item.label })"
            class="max-h-full max-w-full object-contain"
            draggable="false"
          >
          <div
            v-else
            class="flex flex-col items-center gap-2 text-sm text-muted-foreground"
          >
            <ImageIcon class="size-8 opacity-50" />
            <span>{{ t('settings.catAppearance.detail.noPreview') }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

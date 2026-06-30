<script setup lang="ts">
import type { CatPetAction } from '@shared/types/cat-pet'
import { HandIcon, Loader2Icon, RefreshCwIcon, SparklesIcon } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useCatPetStore } from '@/stores/cat-pet'
import { errorToText, useToast } from '@/utils/toast'

defineProps<{
  sideLabel: string
}>()

const { t } = useI18n()
const toast = useToast()
const store = useCatPetStore()
const {
  affection,
  affectionMax,
  mood,
  todayUsage,
  limits,
  recent,
  progressPercent,
  remainingPat,
  remainingTease,
  canPat,
  canTease,
  loading,
  performing,
} = storeToRefs(store)

onMounted(async () => {
  try {
    await store.load()
  } catch (err) {
    toast.error(errorToText(err, t('catPet.errors.loadFailed')))
  }
})

onBeforeUnmount(() => {
  store.dispose()
})

const moodLabel = computed(() => t(`catPet.mood.${mood.value}`))
const recentLabel = computed(() => {
  const value = recent.value
  if (!value) return t('catPet.empty')
  return t(
    `catPet.feedback.${value.action}${value.outcome === 'positive' ? 'Positive' : 'Negative'}`
  )
})

const recentDeltaClass = computed(() =>
  recent.value?.outcome === 'positive'
    ? 'text-emerald-600 dark:text-emerald-400'
    : recent.value?.outcome === 'negative'
      ? 'text-rose-600 dark:text-rose-400'
      : 'text-muted-foreground'
)

const recentDeltaText = computed(() => {
  const value = recent.value
  if (!value) return ''
  return value.delta > 0 ? `+${value.delta}` : `${value.delta}`
})

const moodBadgeVariant = computed<'default' | 'secondary' | 'outline'>(() => {
  switch (mood.value) {
    case 'attached':
    case 'happy':
      return 'default'
    case 'sad':
      return 'outline'
    default:
      return 'secondary'
  }
})

const patTip = computed(() =>
  canPat.value ? t('catPet.action.patHint') : t('catPet.action.patLimitTip')
)
const teaseTip = computed(() =>
  canTease.value ? t('catPet.action.teaseHint') : t('catPet.action.teaseLimitTip')
)

async function handleAction(action: CatPetAction): Promise<void> {
  if (performing.value) return
  if (action === 'pat' && !canPat.value) return
  if (action === 'tease' && !canTease.value) return

  try {
    const response = await store.perform(action)
    if (!response.ok) {
      toast.warning(
        action === 'pat' ? t('catPet.action.patLimitTip') : t('catPet.action.teaseLimitTip')
      )
    }
  } catch (err) {
    toast.error(errorToText(err, t('catPet.errors.actionFailed')))
  }
}

async function handleRefresh(): Promise<void> {
  try {
    await store.load(true)
  } catch (err) {
    toast.error(errorToText(err, t('catPet.errors.loadFailed')))
  }
}

function dotClass(filled: boolean): string {
  return filled
    ? 'inline-block size-2 rounded-full bg-foreground/80'
    : 'inline-block size-2 rounded-full border border-muted-foreground/40 bg-transparent'
}
</script>

<template>
  <section
    class="cat-panel-status flex h-full min-h-0 w-full flex-col overflow-hidden rounded-lg border border-border/80 bg-background/95 text-foreground shadow-xl backdrop-blur"
    :aria-label="t('catPet.surfaceLabel')"
  >
    <header class="flex shrink-0 items-center gap-2 border-b border-border/70 px-3 py-2">
      <div class="min-w-0 flex-1">
        <div class="flex min-w-0 items-center gap-2">
          <p class="truncate text-sm font-semibold">{{ t('catPet.title') }}</p>
          <Badge
            :variant="moodBadgeVariant"
            class="shrink-0"
          >
            {{ moodLabel }}
          </Badge>
        </div>
        <p class="truncate text-xs text-muted-foreground">{{ t('catPet.subtitle') }}</p>
      </div>

      <Badge
        variant="outline"
        class="hidden shrink-0 sm:inline-flex"
      >
        {{ sideLabel }}
      </Badge>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        class="size-8 shrink-0"
        :disabled="loading"
        :aria-label="t('catPet.refresh')"
        @click="handleRefresh"
      >
        <Loader2Icon
          v-if="loading"
          class="animate-spin"
        />
        <RefreshCwIcon v-else />
      </Button>
    </header>

    <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
      <div class="space-y-2">
        <div class="flex items-baseline justify-between gap-2">
          <span class="text-xs font-medium text-muted-foreground">{{ t('catPet.affection') }}</span>
          <span class="text-sm tabular-nums">
            <span class="font-semibold">{{ affection }}</span>
            <span class="text-muted-foreground"> / {{ affectionMax }}</span>
          </span>
        </div>
        <div
          class="relative h-2 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          :aria-valuenow="affection"
          :aria-valuemin="0"
          :aria-valuemax="affectionMax"
        >
          <div
            class="h-full rounded-full bg-foreground/70 transition-[width] duration-300 ease-out"
            :style="{ width: `${progressPercent}%` }"
          />
        </div>
      </div>

      <div class="space-y-3 rounded-lg border border-border/70 bg-muted/30 px-3 py-3">
        <p class="text-xs font-medium text-muted-foreground">{{ t('catPet.todayInteractions') }}</p>
        <div class="grid grid-cols-2 gap-3 text-sm">
          <div class="flex flex-col gap-1">
            <span class="text-xs text-muted-foreground">{{ t('catPet.action.pat') }}</span>
            <div class="flex items-center gap-1.5">
              <span class="font-medium tabular-nums">
                {{ todayUsage.pat }} / {{ limits.pat }}
              </span>
              <span class="flex gap-1 pl-1">
                <span
                  v-for="i in limits.pat"
                  :key="`pat-${i}`"
                  :class="dotClass(i <= todayUsage.pat)"
                  aria-hidden="true"
                />
              </span>
            </div>
          </div>
          <div class="flex flex-col gap-1">
            <span class="text-xs text-muted-foreground">{{ t('catPet.action.tease') }}</span>
            <div class="flex items-center gap-1.5">
              <span class="font-medium tabular-nums">
                {{ todayUsage.tease }} / {{ limits.tease }}
              </span>
              <span class="flex gap-1 pl-1">
                <span
                  v-for="i in limits.tease"
                  :key="`tease-${i}`"
                  :class="dotClass(i <= todayUsage.tease)"
                  aria-hidden="true"
                />
              </span>
            </div>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          class="h-12 flex-col gap-0.5"
          :disabled="!canPat || performing"
          :title="patTip"
          @click="handleAction('pat')"
        >
          <span class="flex items-center gap-1.5 text-sm font-medium">
            <HandIcon class="size-4" />
            {{ t('catPet.action.pat') }}
          </span>
          <span class="text-xs text-muted-foreground">
            {{ t('catPet.action.remaining', { count: remainingPat }) }}
          </span>
        </Button>
        <Button
          type="button"
          variant="outline"
          class="h-12 flex-col gap-0.5"
          :disabled="!canTease || performing"
          :title="teaseTip"
          @click="handleAction('tease')"
        >
          <span class="flex items-center gap-1.5 text-sm font-medium">
            <SparklesIcon class="size-4" />
            {{ t('catPet.action.tease') }}
          </span>
          <span class="text-xs text-muted-foreground">
            {{ t('catPet.action.remaining', { count: remainingTease }) }}
          </span>
        </Button>
      </div>

      <div class="space-y-1 rounded-lg border border-border/70 bg-muted/20 px-3 py-3">
        <p class="text-xs font-medium text-muted-foreground">{{ t('catPet.recent') }}</p>
        <div class="flex items-start justify-between gap-2">
          <p class="text-sm leading-relaxed">{{ recentLabel }}</p>
          <span
            v-if="recent"
            :class="['shrink-0 text-sm font-semibold tabular-nums', recentDeltaClass]"
          >
            {{ recentDeltaText }}
          </span>
        </div>
      </div>
    </div>
  </section>
</template>

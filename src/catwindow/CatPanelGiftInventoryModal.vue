<script setup lang="ts">
import type { CatPetGiftDefinition } from '@shared/types/cat-pet'
import { GiftIcon, LockIcon, XIcon } from 'lucide-vue-next'
import {
  DialogClose as RekaDialogClose,
  DialogContent as RekaDialogContent,
  DialogOverlay as RekaDialogOverlay,
  DialogPortal as RekaDialogPortal,
} from 'reka-ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { catPetGiftImageSrc } from '@/utils/cat-pet-gift-images'

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  gift?: CatPetGiftDefinition
}>()

const { t } = useI18n()
const panelDialogInsetStyle =
  'top: var(--image-viewer-inset-top, var(--app-window-content-top)); right: var(--image-viewer-inset-right, 0); bottom: var(--image-viewer-inset-bottom, 0); left: var(--image-viewer-inset-left, 0); border-radius: var(--image-viewer-radius, 0);'

const isUnlocked = computed(() => Boolean(props.gift?.unlocked))
const imageSrc = computed(() => catPetGiftImageSrc(props.gift?.image, props.gift?.id))
const titleText = computed(() =>
  isUnlocked.value && props.gift ? props.gift.name : t('catPet.inventory.lockedTitle')
)
const descriptionText = computed(() =>
  isUnlocked.value
    ? t('catPet.inventory.unlockedDialogDescription')
    : t('catPet.inventory.lockedDialogDescription')
)
const imageAlt = computed(() =>
  isUnlocked.value && props.gift
    ? t('catPet.inventory.imageAlt', { name: props.gift.name })
    : t('catPet.inventory.lockedImageAlt')
)
const previewClass = computed(() =>
  cn(
    'relative mx-auto grid size-20 place-items-center overflow-hidden rounded-full border border-border/70 bg-muted/30',
    !isUnlocked.value && 'bg-muted/20'
  )
)
const previewImageClass = computed(() =>
  cn('size-full object-cover', !isUnlocked.value && 'blur-sm opacity-45 saturate-0')
)
const previewFallbackClass = computed(() =>
  cn('grid size-full place-items-center text-muted-foreground', !isUnlocked.value && 'opacity-45')
)

function close(): void {
  open.value = false
}
</script>

<template>
  <Dialog v-model:open="open">
    <RekaDialogPortal>
      <RekaDialogOverlay
        class="fixed isolate z-50 bg-black/10 duration-100 data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0 supports-backdrop-filter:backdrop-blur-md"
        :style="panelDialogInsetStyle"
      />
      <RekaDialogContent
        class="fixed z-50 flex min-h-0 items-center justify-center p-4 outline-none duration-100 data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0"
        :style="panelDialogInsetStyle"
        @click.self="close"
      >
        <section class="relative flex max-h-full w-full max-w-sm flex-col overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-xl ring-1 ring-foreground/10">
          <div class="flex shrink-0 flex-col gap-2 p-4 pr-12">
            <DialogHeader>
              <DialogTitle class="flex items-center gap-2">
                <GiftIcon
                  v-if="isUnlocked"
                  aria-hidden="true"
                />
                <LockIcon
                  v-else
                  aria-hidden="true"
                />
                {{ titleText }}
              </DialogTitle>
              <DialogDescription>
                {{ descriptionText }}
              </DialogDescription>
            </DialogHeader>
          </div>

          <RekaDialogClose as-child>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              class="absolute right-3 top-3"
              :aria-label="t('catPet.inventory.close')"
            >
              <XIcon />
              <span class="sr-only">{{ t('catPet.inventory.close') }}</span>
            </Button>
          </RekaDialogClose>

          <div
            v-if="gift"
            class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4"
          >
            <div :class="previewClass">
              <img
                v-if="imageSrc"
                :src="imageSrc"
                :alt="imageAlt"
                :class="previewImageClass"
                draggable="false"
              >
              <span
                v-else
                :class="previewFallbackClass"
              >
                <GiftIcon
                  class="size-7"
                  aria-hidden="true"
                />
              </span>

              <span
                v-if="!isUnlocked"
                class="absolute inset-0 grid place-items-center bg-background/15"
                aria-hidden="true"
              >
                <LockIcon class="size-6 text-foreground/75 drop-shadow-sm" />
              </span>
            </div>

            <div
              v-if="isUnlocked"
              class="flex flex-col gap-2 rounded-lg border border-border/70 bg-muted/20 px-3 py-3"
            >
              <p class="text-base font-semibold leading-snug">
                {{ gift.name }}
              </p>
              <p class="text-sm leading-relaxed text-muted-foreground">
                {{ gift.description || t('catPet.inventory.noDescription') }}
              </p>
            </div>

            <div
              v-else
              class="flex flex-col gap-2 rounded-lg border border-border/70 bg-muted/20 px-3 py-3"
            >
              <Badge variant="outline">
                {{ t('catPet.inventory.locked') }}
              </Badge>
              <p class="text-sm font-medium leading-relaxed">
                {{ t('catPet.inventory.unlockCondition', { count: gift.unlockAffection }) }}
              </p>
            </div>
          </div>

          <div class="flex shrink-0 justify-end border-t border-border bg-muted/40 p-3">
            <Button
              type="button"
              variant="outline"
              class="w-full"
              @click="close"
            >
              {{ t('catPet.inventory.close') }}
            </Button>
          </div>
        </section>
      </RekaDialogContent>
    </RekaDialogPortal>
  </Dialog>
</template>

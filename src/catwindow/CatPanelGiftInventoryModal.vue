<script setup lang="ts">
import type { CatPetGiftDefinition } from '@shared/types/cat-pet'
import { GiftIcon, LockIcon } from 'lucide-vue-next'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  gift?: CatPetGiftDefinition
}>()

const { t } = useI18n()

const isUnlocked = computed(() => Boolean(props.gift?.unlocked))
const imageSrc = computed(() => props.gift?.image?.dataUrl?.trim() ?? '')
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
    'relative mx-auto grid size-28 place-items-center overflow-hidden rounded-full border border-border/70 bg-muted/30',
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
    <DialogContent class="sm:max-w-sm">
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

      <div
        v-if="gift"
        class="flex flex-col gap-4"
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
              class="size-9"
              aria-hidden="true"
            />
          </span>

          <span
            v-if="!isUnlocked"
            class="absolute inset-0 grid place-items-center bg-background/15"
            aria-hidden="true"
          >
            <LockIcon class="size-8 text-foreground/75 drop-shadow-sm" />
          </span>
        </div>

        <div
          v-if="isUnlocked"
          class="flex flex-col gap-2 rounded-lg border border-border/70 bg-muted/20 px-3 py-3"
        >
          <Badge variant="secondary">
            {{ t('catPet.inventory.unlocked') }}
          </Badge>
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

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          @click="close"
        >
          {{ t('catPet.inventory.close') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

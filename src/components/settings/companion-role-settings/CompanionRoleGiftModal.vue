<script setup lang="ts">
import type { CatPetGiftConfig, CatPetGiftImage } from '@shared/types/cat-pet'
import { CAT_PET_AFFECTION_MAX, CAT_PET_GIFT_IMAGE_MAX_BYTES } from '@shared/types/cat-pet'
import { GiftIcon, ImagePlusIcon, XIcon } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
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
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { errorToText, useToast } from '@/utils/toast'

const props = defineProps<{
  gift?: CatPetGiftConfig
}>()

const open = defineModel<boolean>('open', { required: true })

const emit = defineEmits<{
  submit: [gift: CatPetGiftConfig]
}>()

const { t } = useI18n()
const toast = useToast()

const enabled = ref(true)
const name = ref('')
const affectionText = ref('100')
const description = ref('')
const image = ref<CatPetGiftImage | undefined>()
const storyText = ref('')

const editing = computed(() => Boolean(props.gift))
const canSubmit = computed(() => Boolean(props.gift?.id && name.value.trim()))

watch(
  [open, () => props.gift],
  ([isOpen]) => {
    if (isOpen) {
      loadDraft(props.gift)
      return
    }
    resetDraft()
  },
  { immediate: true }
)

function loadDraft(gift: CatPetGiftConfig | undefined): void {
  enabled.value = gift?.enabled !== false
  name.value = gift?.name ?? ''
  affectionText.value = String(gift?.unlockAffection ?? 100)
  description.value = gift?.description ?? ''
  image.value = gift?.image ? { ...gift.image } : undefined
  storyText.value = gift?.storyLines.join('\n') ?? ''
}

function resetDraft(): void {
  enabled.value = true
  name.value = ''
  affectionText.value = '100'
  description.value = ''
  image.value = undefined
  storyText.value = ''
}

function submit(): void {
  if (!props.gift?.id) return
  const trimmedName = name.value.trim()
  if (!trimmedName) return

  const trimmedDescription = description.value.trim()
  const storyLines = splitMultiline(storyText.value)
  emit('submit', {
    id: props.gift.id,
    enabled: enabled.value,
    unlockAffection: normalizeIntegerInput(
      affectionText.value,
      props.gift.unlockAffection,
      0,
      CAT_PET_AFFECTION_MAX
    ),
    name: trimmedName,
    ...(trimmedDescription ? { description: trimmedDescription } : {}),
    ...(image.value ? { image: { ...image.value } } : {}),
    storyLines: storyLines.length
      ? storyLines
      : [t('settings.catAppearance.role.gifts.defaultStoryLine', { name: trimmedName })],
  })
}

async function updateImage(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement | null
  const file = input?.files?.[0]
  if (!file) return
  if (!file.type.startsWith('image/')) {
    toast.error(t('settings.catAppearance.role.gifts.errors.imageType'))
    if (input) input.value = ''
    return
  }
  if (file.size > CAT_PET_GIFT_IMAGE_MAX_BYTES) {
    toast.error(
      t('settings.catAppearance.role.gifts.errors.imageSize', {
        size: Math.round(CAT_PET_GIFT_IMAGE_MAX_BYTES / 1024 / 1024),
      })
    )
    if (input) input.value = ''
    return
  }
  try {
    const dataUrl = await readFileAsDataUrl(file)
    image.value = {
      dataUrl,
      mimeType: file.type,
      fileName: file.name,
    }
  } catch (error) {
    toast.error(errorToText(error, t('settings.catAppearance.role.gifts.errors.imageRead')))
  } finally {
    if (input) input.value = ''
  }
}

function clearImage(): void {
  image.value = undefined
}

function splitMultiline(value: string): string[] {
  return value
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function normalizeIntegerInput(value: string, fallback: number, min: number, max: number): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.max(min, Math.min(Math.round(numeric), max))
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image file.'))
    reader.readAsDataURL(file)
  })
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>
          {{
            editing
              ? t('settings.catAppearance.role.gifts.dialog.editTitle')
              : t('settings.catAppearance.role.gifts.dialog.createTitle')
          }}
        </DialogTitle>
        <DialogDescription>
          {{ t('settings.catAppearance.role.gifts.dialog.description') }}
        </DialogDescription>
      </DialogHeader>

      <FieldGroup>
        <Field orientation="horizontal">
          <Switch
            id="settings-companion-role-gift-dialog-enabled"
            v-model="enabled"
          />
          <FieldLabel for="settings-companion-role-gift-dialog-enabled">
            {{ t('settings.catAppearance.role.gifts.fields.enabled') }}
          </FieldLabel>
        </Field>

        <div class="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_9rem]">
          <Field>
            <FieldLabel for="settings-companion-role-gift-dialog-name">
              {{ t('settings.catAppearance.role.gifts.fields.name') }}
            </FieldLabel>
            <Input
              id="settings-companion-role-gift-dialog-name"
              v-model="name"
              maxlength="40"
              :placeholder="t('settings.catAppearance.role.gifts.newGiftName')"
            />
          </Field>

          <Field>
            <FieldLabel for="settings-companion-role-gift-dialog-affection">
              {{ t('settings.catAppearance.role.gifts.fields.affection') }}
            </FieldLabel>
            <Input
              id="settings-companion-role-gift-dialog-affection"
              v-model="affectionText"
              type="number"
              min="0"
              :max="CAT_PET_AFFECTION_MAX"
            />
          </Field>
        </div>

        <Field>
          <FieldLabel for="settings-companion-role-gift-dialog-description">
            {{ t('settings.catAppearance.role.gifts.fields.description') }}
          </FieldLabel>
          <Input
            id="settings-companion-role-gift-dialog-description"
            v-model="description"
            maxlength="160"
            :placeholder="t('settings.catAppearance.role.gifts.descriptionPlaceholder')"
          />
        </Field>

        <Field>
          <FieldLabel for="settings-companion-role-gift-dialog-image">
            {{ t('settings.catAppearance.role.gifts.fields.image') }}
          </FieldLabel>
          <div class="flex min-w-0 items-center gap-3 rounded-md border bg-background/60 p-3">
            <div class="grid size-16 shrink-0 place-items-center overflow-hidden rounded-md border bg-muted">
              <img
                v-if="image?.dataUrl"
                :src="image.dataUrl"
                :alt="t('settings.catAppearance.role.gifts.imageAlt', { name: name || t('settings.catAppearance.role.gifts.newGiftName') })"
                class="size-full object-cover"
              />
              <GiftIcon
                v-else
                class="size-7 text-muted-foreground"
                aria-hidden="true"
              />
            </div>

            <div class="flex min-w-0 flex-1 flex-col gap-2">
              <Input
                id="settings-companion-role-gift-dialog-image"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                @change="updateImage"
              />
              <div class="flex flex-wrap items-center gap-2">
                <FieldDescription>
                  {{ t('settings.catAppearance.role.gifts.imageHint') }}
                </FieldDescription>
                <Button
                  v-if="image?.dataUrl"
                  type="button"
                  variant="outline"
                  size="sm"
                  @click="clearImage"
                >
                  <XIcon data-icon="inline-start" />
                  {{ t('settings.catAppearance.role.gifts.clearImage') }}
                </Button>
              </div>
            </div>
          </div>
        </Field>

        <Field>
          <FieldLabel for="settings-companion-role-gift-dialog-story">
            {{ t('settings.catAppearance.role.gifts.fields.story') }}
          </FieldLabel>
          <Textarea
            id="settings-companion-role-gift-dialog-story"
            v-model="storyText"
            class="min-h-32"
            :placeholder="t('settings.catAppearance.role.gifts.storyPlaceholder')"
          />
          <FieldDescription>
            {{ t('settings.catAppearance.role.gifts.storyHint') }}
          </FieldDescription>
        </Field>
      </FieldGroup>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          @click="open = false"
        >
          {{ t('settings.catAppearance.role.gifts.dialog.cancel') }}
        </Button>
        <Button
          type="button"
          :disabled="!canSubmit"
          @click="submit"
        >
          <ImagePlusIcon data-icon="inline-start" />
          {{ t('settings.catAppearance.role.gifts.dialog.save') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

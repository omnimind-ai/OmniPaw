<script setup lang="ts">
import { ImageUpIcon } from '@lucide/vue'
import {
  COMPANION_ROLE_AVATAR_ACCEPT,
  COMPANION_ROLE_AVATAR_MAX_BYTES,
  type CompanionRoleAvatar,
  normalizeCompanionRoleAvatarMimeType,
} from '@shared/types/companion-role'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingEntry from '@/components/settings/common/SettingEntry.vue'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { errorToText, useToast } from '@/utils/toast'

const props = defineProps<{
  roleName: string
  avatarFallbackSrc: string
}>()

const avatar = defineModel<CompanionRoleAvatar | undefined>()

const { t } = useI18n()
const toast = useToast()
const avatarInput = ref<HTMLInputElement | null>(null)
const avatarMaxSizeMb = Math.round((COMPANION_ROLE_AVATAR_MAX_BYTES / 1024 / 1024) * 10) / 10

const usesCustomAvatar = computed(
  () => avatar.value?.source === 'custom' && Boolean(avatar.value.dataUrl)
)
const avatarSrc = computed(() =>
  usesCustomAvatar.value
    ? (avatar.value?.dataUrl ?? props.avatarFallbackSrc)
    : props.avatarFallbackSrc
)
const avatarFallback = computed(
  () => props.roleName.trim().slice(0, 1) || t('settings.catAppearance.role.unnamed').slice(0, 1)
)

function chooseAvatar(): void {
  avatarInput.value?.click()
}

async function updateAvatar(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement | null
  const file = input?.files?.[0]
  if (!file) return

  const mimeType = normalizeCompanionRoleAvatarMimeType(file.type, file.name)
  if (!mimeType) {
    toast.error(t('settings.catAppearance.role.fields.avatar.errors.imageType'))
    input.value = ''
    return
  }
  if (file.size > COMPANION_ROLE_AVATAR_MAX_BYTES) {
    toast.error(
      t('settings.catAppearance.role.fields.avatar.errors.imageSize', {
        size: avatarMaxSizeMb,
      })
    )
    input.value = ''
    return
  }

  try {
    avatar.value = {
      source: 'custom',
      dataUrl: withImageMimeType(await readFileAsDataUrl(file), mimeType),
      mimeType,
      fileName: file.name,
    }
  } catch (error) {
    toast.error(errorToText(error, t('settings.catAppearance.role.fields.avatar.errors.imageRead')))
  } finally {
    input.value = ''
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read role avatar.'))
    reader.readAsDataURL(file)
  })
}

function withImageMimeType(dataUrl: string, mimeType: string): string {
  const commaIndex = dataUrl.indexOf(',')
  return commaIndex < 0 ? dataUrl : `data:${mimeType};base64,${dataUrl.slice(commaIndex + 1)}`
}
</script>

<template>
  <SettingEntry
    control-id="settings-companion-role-avatar"
    :title="t('settings.catAppearance.role.fields.avatar.title')"
    :description="t('settings.catAppearance.role.fields.avatar.description')"
  >
    <input
      id="settings-companion-role-avatar"
      ref="avatarInput"
      class="sr-only"
      type="file"
      :accept="COMPANION_ROLE_AVATAR_ACCEPT"
      @change="updateAvatar"
    >
    <button
      type="button"
      class="group relative size-20 shrink-0 cursor-pointer rounded-full focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      :aria-label="t('settings.catAppearance.role.fields.avatar.upload')"
      :title="t('settings.catAppearance.role.fields.avatar.upload')"
      @click="chooseAvatar"
    >
      <Avatar
        class="size-full border bg-muted/40 shadow-sm transition-transform duration-200 group-hover:scale-[1.02]"
      >
        <AvatarImage
          :src="avatarSrc"
          :alt="t('settings.catAppearance.role.fields.avatar.alt', { name: roleName })"
          :class="cn(usesCustomAvatar ? 'object-cover' : 'object-contain p-1')"
        />
        <AvatarFallback>{{ avatarFallback }}</AvatarFallback>
      </Avatar>
      <span
        aria-hidden="true"
        class="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-background/45 opacity-0 backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        <ImageUpIcon class="size-5 text-foreground drop-shadow-sm" />
      </span>
    </button>
  </SettingEntry>
</template>

<script setup lang="ts">
import { RotateCcwIcon } from '@lucide/vue'
import {
  COMPANION_ROLE_AVATAR_ACCEPT,
  COMPANION_ROLE_AVATAR_MAX_BYTES,
  type CompanionRoleAvatar,
  normalizeCompanionRoleAvatarMimeType,
} from '@shared/types/companion-role'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingEntry from '@/components/settings/common/SettingEntry.vue'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { FieldDescription } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { errorToText, useToast } from '@/utils/toast'

const props = defineProps<{
  roleName: string
  avatarFallbackSrc: string
}>()

const introduction = defineModel<string>('introduction', { required: true })
const avatar = defineModel<CompanionRoleAvatar | undefined>('avatar')

const { t } = useI18n()
const toast = useToast()
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

function resetAvatar(): void {
  avatar.value = { source: 'appearance-idle' }
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
    control-class="@md/field-group:w-full @md/field-group:max-w-md"
  >
    <div class="flex w-full min-w-0 items-center gap-3">
      <Avatar class="size-16 shrink-0">
        <AvatarImage
          :src="avatarSrc"
          :alt="t('settings.catAppearance.role.fields.avatar.alt', { name: roleName })"
          :class="cn(usesCustomAvatar ? 'object-cover' : 'object-contain p-1')"
        />
        <AvatarFallback>{{ avatarFallback }}</AvatarFallback>
      </Avatar>

      <div class="flex min-w-0 flex-1 flex-col gap-2">
        <Input
          id="settings-companion-role-avatar"
          type="file"
          :accept="COMPANION_ROLE_AVATAR_ACCEPT"
          @change="updateAvatar"
        />
        <div class="flex flex-wrap items-center gap-2">
          <FieldDescription>
            {{
              t('settings.catAppearance.role.fields.avatar.hint', {
                size: avatarMaxSizeMb,
              })
            }}
          </FieldDescription>
          <Button
            v-if="usesCustomAvatar"
            type="button"
            variant="outline"
            size="sm"
            @click="resetAvatar"
          >
            <RotateCcwIcon data-icon="inline-start" />
            {{ t('settings.catAppearance.role.fields.avatar.reset') }}
          </Button>
        </div>
      </div>
    </div>
  </SettingEntry>

  <SettingEntry
    control-id="settings-companion-role-introduction"
    :title="t('settings.catAppearance.role.fields.introduction.title')"
    :description="t('settings.catAppearance.role.fields.introduction.description')"
  >
    <Textarea
      id="settings-companion-role-introduction"
      v-model="introduction"
      class="min-h-20 w-full md:w-96"
      maxlength="240"
      :placeholder="t('settings.catAppearance.role.fields.introduction.placeholder')"
    />
  </SettingEntry>
</template>

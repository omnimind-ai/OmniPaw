<script setup lang="ts">
import {
  BookOpenIcon,
  CheckIcon,
  HeartHandshakeIcon,
  MessageCircleIcon,
  PencilIcon,
  SparklesIcon,
  WandSparklesIcon,
  XIcon,
} from '@lucide/vue'
import type { Component } from 'vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { CompanionRole } from '@/components/settings/companion-role-settings/types'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

interface RoleDetailItem {
  id: string
  icon: Component
  title: string
  value: string
}

const props = defineProps<{
  open: boolean
  role?: CompanionRole
  activeRoleId: string
  idleImageByPackId: Record<string, string>
}>()

const emit = defineEmits<{
  'update:open': [open: boolean]
  editRole: [role: CompanionRole]
  selectRole: [role: CompanionRole]
}>()

const { t } = useI18n()

const roleName = computed(() => props.role?.name.trim() || t('settings.catAppearance.role.unnamed'))
const roleInitial = computed(() => roleName.value.slice(0, 1))
const customAvatar = computed(
  () => props.role?.avatar?.source === 'custom' && Boolean(props.role.avatar.dataUrl)
)
const avatarSrc = computed(() => {
  if (!props.role) return props.idleImageByPackId.builtin
  const idleImage =
    props.idleImageByPackId[props.role.appearancePackId || 'builtin'] ||
    props.idleImageByPackId.builtin
  return customAvatar.value ? (props.role.avatar?.dataUrl ?? idleImage) : idleImage
})
const isActive = computed(() => props.role?.id === props.activeRoleId)
const introduction = computed(
  () => props.role?.introduction.trim() || t('settings.catAppearance.role.overview.introFallback')
)
const relationship = computed(
  () => props.role?.relationship.trim() || t('settings.catAppearance.role.noRelationship')
)
const detailItems = computed<RoleDetailItem[]>(() => {
  const notSet = t('settings.catAppearance.role.details.notSet')
  return [
    {
      id: 'personality',
      icon: SparklesIcon,
      title: t('settings.catAppearance.role.fields.personality.title'),
      value: props.role?.personality.trim() || notSet,
    },
    {
      id: 'speech-style',
      icon: MessageCircleIcon,
      title: t('settings.catAppearance.role.fields.speechStyle.title'),
      value: props.role?.speechStyle.trim() || notSet,
    },
    {
      id: 'relationship',
      icon: HeartHandshakeIcon,
      title: t('settings.catAppearance.role.fields.relationship.title'),
      value: props.role?.relationship.trim() || notSet,
    },
    {
      id: 'background',
      icon: BookOpenIcon,
      title: t('settings.catAppearance.role.fields.background.title'),
      value: props.role?.background.trim() || notSet,
    },
    {
      id: 'proactive-style',
      icon: WandSparklesIcon,
      title: t('settings.catAppearance.role.fields.proactiveStyle.title'),
      value: props.role?.proactiveStyle.trim() || notSet,
    },
  ]
})

function editRole(): void {
  if (!props.role) return
  emit('update:open', false)
  emit('editRole', props.role)
}

function selectRole(): void {
  if (!props.role || isActive.value) return
  emit('selectRole', props.role)
}
</script>

<template>
  <Sheet
    :open="open"
    @update:open="emit('update:open', $event)"
  >
    <SheetContent
      side="right"
      class="w-full gap-0 p-0 sm:max-w-lg"
      :show-close-button="false"
    >
      <SheetHeader class="flex-row items-start gap-3 px-5 py-4 text-left">
        <div class="flex min-w-0 flex-1 flex-col gap-0.5">
          <SheetTitle>{{ t('settings.catAppearance.role.details.title') }}</SheetTitle>
          <SheetDescription class="truncate">
            {{ t('settings.catAppearance.role.details.description', { name: roleName }) }}
          </SheetDescription>
        </div>
        <SheetClose as-child>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            :aria-label="t('settings.catAppearance.role.details.close')"
          >
            <XIcon />
          </Button>
        </SheetClose>
      </SheetHeader>

      <Separator />

      <div
        v-if="role"
        class="min-h-0 flex-1 overflow-y-auto"
      >
        <section class="flex flex-col items-center gap-4 px-6 py-7 text-center">
          <div class="relative flex size-32 items-center justify-center rounded-full bg-muted/40">
            <span
              class="absolute inset-2 rounded-full border border-border/70"
              aria-hidden="true"
            />
            <Avatar class="size-28 border bg-background shadow-sm">
              <AvatarImage
                :src="avatarSrc"
                :alt="t('settings.catAppearance.role.overview.avatarAlt', { name: roleName })"
                :class="cn(customAvatar ? 'object-cover' : 'object-contain p-3')"
              />
              <AvatarFallback class="text-2xl">{{ roleInitial }}</AvatarFallback>
            </Avatar>
          </div>

          <div class="flex max-w-md flex-col items-center gap-2">
            <div class="flex flex-wrap items-center justify-center gap-2">
              <Badge :variant="isActive ? 'secondary' : 'outline'">
                <CheckIcon v-if="isActive" />
                {{
                  isActive
                    ? t('settings.catAppearance.role.details.active')
                    : t('settings.catAppearance.role.details.available')
                }}
              </Badge>
              <Badge variant="outline">{{ relationship }}</Badge>
            </div>
            <h2 class="text-xl font-semibold tracking-tight">{{ roleName }}</h2>
            <p class="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
              {{ introduction }}
            </p>
          </div>
        </section>

        <Separator />

        <section class="flex flex-col gap-3 px-5 py-5">
          <div class="flex flex-col gap-0.5">
            <h3 class="text-sm font-semibold">
              {{ t('settings.catAppearance.role.details.profileTitle') }}
            </h3>
            <p class="text-xs text-muted-foreground">
              {{ t('settings.catAppearance.role.details.profileDescription') }}
            </p>
          </div>

          <article
            v-for="item in detailItems"
            :key="item.id"
            class="flex flex-col gap-2 rounded-lg border bg-muted/20 p-4"
          >
            <div class="flex items-center gap-2 text-muted-foreground">
              <component
                :is="item.icon"
                class="size-4"
                aria-hidden="true"
              />
              <h4 class="text-xs font-medium">{{ item.title }}</h4>
            </div>
            <p class="whitespace-pre-wrap break-words text-sm leading-relaxed">
              {{ item.value }}
            </p>
          </article>
        </section>
      </div>

      <template v-if="role">
        <Separator />
        <SheetFooter class="grid grid-cols-2 p-4">
          <Button
            type="button"
            :variant="isActive ? 'secondary' : 'outline'"
            :disabled="isActive"
            @click="selectRole"
          >
            <CheckIcon data-icon="inline-start" />
            {{
              isActive
                ? t('settings.catAppearance.role.overview.selected')
                : t('settings.catAppearance.role.overview.select')
            }}
          </Button>
          <Button
            type="button"
            @click="editRole"
          >
            <PencilIcon data-icon="inline-start" />
            {{ t('settings.catAppearance.role.overview.edit') }}
          </Button>
        </SheetFooter>
      </template>
    </SheetContent>
  </Sheet>
</template>

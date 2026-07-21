<script setup lang="ts">
import {
  CheckIcon,
  FileJsonIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  SparklesIcon,
  XIcon,
} from '@lucide/vue'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsPanelHeader from '@/components/settings/common/SettingsPanelHeader.vue'
import SettingsPanelItem from '@/components/settings/common/SettingsPanelItem.vue'
import SettingsSearchBar from '@/components/settings/common/SettingsSearchBar.vue'
import type { CompanionRole } from '@/components/settings/companion-role-settings/types'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

const props = defineProps<{
  roles: CompanionRole[]
  activeRoleId: string
  importRoleDisabled: boolean
  importRoleCardDisabled: boolean
  idleImageByPackId: Record<string, string>
}>()

const emit = defineEmits<{
  createRole: []
  editRole: [role: CompanionRole]
  importRole: []
  importRoleCard: []
  selectRole: [role: CompanionRole]
  viewRole: [role: CompanionRole]
}>()

interface RoleListItem {
  active: boolean
  avatarSrc: string
  customAvatar: boolean
  intro: string
  initial: string
  name: string
  role: CompanionRole
}

const { t } = useI18n()
const searchQuery = ref('')

const roleItems = computed<RoleListItem[]>(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase()
  return props.roles
    .filter((role) => {
      if (!query) return true
      return [role.name, role.introduction, role.userNickname, role.personality, role.background]
        .filter(Boolean)
        .some((value) => value.toLocaleLowerCase().includes(query))
    })
    .map((role) => {
      const name = role.name.trim() || t('settings.catAppearance.role.unnamed')
      const customAvatar = role.avatar?.source === 'custom' && Boolean(role.avatar.dataUrl)
      const idleImage =
        props.idleImageByPackId[role.appearancePackId || 'builtin'] ||
        props.idleImageByPackId.builtin
      return {
        active: role.id === props.activeRoleId,
        avatarSrc: customAvatar ? (role.avatar?.dataUrl ?? idleImage) : idleImage,
        customAvatar,
        intro: role.introduction.trim() || t('settings.catAppearance.role.overview.introFallback'),
        initial: name.slice(0, 1),
        name,
        role,
      }
    })
})

function clearSearch(): void {
  searchQuery.value = ''
}
</script>

<template>
  <Card class="grid h-full min-h-0 flex-1 grid-rows-[auto_auto_minmax(0,1fr)] gap-0 rounded-md border border-border py-0 ring-0">
    <SettingsPanelHeader
      :title="t('settings.catAppearance.role.overview.title')"
      :icon="SparklesIcon"
    />

    <SettingsSearchBar
      v-model="searchQuery"
      class="border-b-0"
      :label="t('settings.catAppearance.role.searchLabel')"
      :placeholder="t('settings.catAppearance.role.searchPlaceholder')"
      :clear-label="t('settings.catAppearance.role.overview.clearSearch')"
      @clear="clearSearch"
    >
      <template #summary>
        <Badge variant="secondary">
          {{ t('settings.catAppearance.role.overview.count', { count: roles.length }) }}
        </Badge>
      </template>

      <template #actions>
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button
              type="button"
              variant="outline"
            >
              <FileJsonIcon data-icon="inline-start" />
              {{ t('settings.catAppearance.role.overview.import') }}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuItem
                :disabled="importRoleDisabled"
                @select="emit('importRole')"
              >
                <FileJsonIcon data-icon="inline-start" />
                {{ t('settings.catAppearance.role.actions.importRole') }}
              </DropdownMenuItem>
              <DropdownMenuItem
                :disabled="importRoleCardDisabled"
                @select="emit('importRoleCard')"
              >
                <FileJsonIcon data-icon="inline-start" />
                {{ t('settings.catAppearance.role.actions.importCard') }}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          type="button"
          @click="emit('createRole')"
        >
          <PlusIcon data-icon="inline-start" />
          {{ t('settings.catAppearance.role.actions.add') }}
        </Button>
      </template>
    </SettingsSearchBar>

    <CardContent class="flex min-h-0 flex-1 flex-col overflow-y-auto p-0">
      <div class="flex min-h-full flex-1 flex-col">
        <div
          v-if="!roleItems.length && searchQuery.trim()"
          class="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-10 text-center text-sm text-muted-foreground sm:px-5"
        >
          <SearchIcon class="size-8 opacity-50" />
          <div class="flex flex-col gap-1">
            <p class="font-medium text-foreground">
              {{ t('settings.catAppearance.role.noSearchMatch') }}
            </p>
            <p>{{ t('settings.catAppearance.role.overview.searchHint') }}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            @click="clearSearch"
          >
            <XIcon data-icon="inline-start" />
            {{ t('settings.catAppearance.role.overview.clearSearch') }}
          </Button>
        </div>

        <div
          v-else-if="!roleItems.length"
          class="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-10 text-center text-sm text-muted-foreground sm:px-5"
        >
          <SparklesIcon class="size-8 opacity-50" />
          <div class="flex flex-col gap-1">
            <p class="font-medium text-foreground">
              {{ t('settings.catAppearance.role.overview.emptyTitle') }}
            </p>
            <p>{{ t('settings.catAppearance.role.overview.emptyHint') }}</p>
          </div>
          <Button
            type="button"
            @click="emit('createRole')"
          >
            <PlusIcon data-icon="inline-start" />
            {{ t('settings.catAppearance.role.actions.add') }}
          </Button>
        </div>

        <div
          v-else
          class="flex flex-1 flex-col gap-3 px-4 py-4 sm:px-5"
        >
          <SettingsPanelItem
            v-for="item in roleItems"
            :key="item.role.id"
            :title="item.name"
            :description="item.intro"
            interactive
            :activation-label="t('settings.catAppearance.role.details.view', { name: item.name })"
            class="cursor-pointer"
            @activate="emit('viewRole', item.role)"
          >
            <template #avatar>
              <Avatar class="size-12 shrink-0">
                <AvatarImage
                  :src="item.avatarSrc"
                  :alt="t('settings.catAppearance.role.overview.avatarAlt', { name: item.name })"
                  :class="cn(item.customAvatar ? 'object-cover' : 'object-contain p-1')"
                />
                <AvatarFallback>{{ item.initial }}</AvatarFallback>
              </Avatar>
            </template>

            <template #actions>
              <Button
                v-if="item.active"
                type="button"
                variant="secondary"
                size="sm"
                disabled
              >
                <CheckIcon data-icon="inline-start" />
                {{ t('settings.catAppearance.role.overview.selected') }}
              </Button>
              <Button
                v-if="!item.active"
                type="button"
                variant="outline"
                size="sm"
                @click.stop="emit('selectRole', item.role)"
              >
                {{ t('settings.catAppearance.role.overview.select') }}
              </Button>
              <Button
                type="button"
                size="sm"
                @click.stop="emit('editRole', item.role)"
              >
                <PencilIcon data-icon="inline-start" />
                {{ t('settings.catAppearance.role.overview.edit') }}
              </Button>
            </template>
          </SettingsPanelItem>
        </div>
      </div>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import type { TavernUserProfile } from '@shared/types/tavern'
import { IdCardIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import SettingsPanelItem from '@/components/settings/common/SettingsPanelItem.vue'
import SettingsSearchBar from '@/components/settings/common/SettingsSearchBar.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const props = defineProps<{
  userProfiles: TavernUserProfile[]
  createUserProfile: () => void
  editUserProfile: (profile: TavernUserProfile) => void
  deleteUserProfile: (profile: TavernUserProfile) => void
}>()

const searchQuery = ref('')
const filteredUserProfiles = computed(() => {
  const query = normalizeSearchText(searchQuery.value)
  if (!query) return props.userProfiles
  return props.userProfiles.filter((profile) => {
    const searchable = [profile.name, profile.description].join(' ')
    return normalizeSearchText(searchable).includes(query)
  })
})
const searchEmpty = computed(
  () => props.userProfiles.length > 0 && filteredUserProfiles.value.length === 0
)

function normalizeSearchText(value: string) {
  return value.trim().toLocaleLowerCase()
}

function clearSearch() {
  searchQuery.value = ''
}
</script>

<template>
  <div class="flex min-h-full flex-1 flex-col">
    <SettingsSearchBar
      v-model="searchQuery"
      class="-mx-4 -mt-4 border-b-0 sm:-mx-5"
      label="搜索用户"
      placeholder="搜索用户名称或描述"
      clear-label="清除用户搜索"
      @clear="clearSearch"
    >
      <template #summary>
        <Badge variant="secondary">{{ userProfiles.length }} 个用户</Badge>
      </template>
      <template #actions>
        <Button
          type="button"
          @click="createUserProfile"
        >
          <PlusIcon data-icon="inline-start" />
          新建用户
        </Button>
      </template>
    </SettingsSearchBar>

    <div class="flex min-h-0 flex-1 flex-col gap-3 py-4">
      <p
        v-if="!userProfiles.length"
        class="flex flex-1 items-center justify-center rounded-md border border-dashed px-3 py-10 text-center text-sm text-muted-foreground"
      >
        暂无酒馆用户 profile
      </p>

      <div
        v-else-if="searchEmpty"
        class="flex flex-1 flex-col items-center justify-center gap-3 rounded-md border border-dashed px-3 py-10 text-center text-sm text-muted-foreground"
      >
        <p>没有匹配的用户。</p>
        <Button
          type="button"
          variant="outline"
          @click="clearSearch"
        >
          清空搜索
        </Button>
      </div>

      <div
        v-else
        class="flex flex-col gap-3"
      >
        <SettingsPanelItem
          v-for="profile in filteredUserProfiles"
          :key="profile.id"
          :title="profile.name"
          :description="profile.description"
          :icon="IdCardIcon"
        >
          <template #badges>
            <Badge variant="outline">快照</Badge>
            <Badge
              v-if="!profile.enabled"
              variant="secondary"
            >
              禁用
            </Badge>
          </template>

          <template #actions>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              @click="editUserProfile(profile)"
            >
              <PencilIcon data-icon="inline-start" />
              编辑
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="删除酒馆用户 profile"
              @click="deleteUserProfile(profile)"
            >
              <Trash2Icon data-icon />
            </Button>
          </template>
        </SettingsPanelItem>
      </div>
    </div>
  </div>
</template>

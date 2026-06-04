<script setup lang="ts">
import type { TavernUserProfile } from '@shared/types/tavern'
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

defineProps<{
  userProfiles: TavernUserProfile[]
  selectedUserProfileId: string
  createUserProfile: () => void
  editUserProfile: (profile: TavernUserProfile) => void
  deleteUserProfile: (profile: TavernUserProfile) => void
}>()
</script>

<template>
  <div class="flex min-h-0 flex-col gap-3">
    <div class="flex items-center justify-between gap-3">
      <div class="min-w-0">
        <p class="text-sm font-medium">酒馆用户 profile</p>
        <p class="text-xs text-muted-foreground">每个 profile 都是普通 Persona 的独立快照，不会自动同步。</p>
      </div>
      <Button
        type="button"
        size="sm"
        @click="createUserProfile"
      >
        <PlusIcon data-icon="inline-start" />
        新建用户
      </Button>
    </div>

    <p
      v-if="!userProfiles.length"
      class="rounded-md border border-dashed px-3 py-8 text-center text-sm text-muted-foreground"
    >
      暂无酒馆用户 profile
    </p>

    <ul
      v-else
      class="flex flex-col gap-2"
    >
      <li
        v-for="profile in userProfiles"
        :key="profile.id"
        :class="
          cn(
            'flex flex-col gap-3 rounded-md border px-4 py-3 md:flex-row md:items-center md:justify-between',
            selectedUserProfileId === profile.id && 'border-primary bg-muted/60',
          )
        "
      >
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <span class="truncate text-sm font-medium">{{ profile.name }}</span>
            <Badge variant="outline">快照</Badge>
            <Badge
              v-if="!profile.enabled"
              variant="secondary"
            >
              禁用
            </Badge>
          </div>
          <p
            v-if="profile.description"
            class="mt-1 line-clamp-2 text-xs text-muted-foreground"
          >
            {{ profile.description }}
          </p>
        </div>

        <div class="flex shrink-0 items-center gap-1">
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
        </div>
      </li>
    </ul>
  </div>
</template>

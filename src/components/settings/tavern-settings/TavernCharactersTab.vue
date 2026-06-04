<script setup lang="ts">
import type { TavernCharacter } from '@shared/types/tavern'
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

defineProps<{
  characters: TavernCharacter[]
  selectedCharacterId: string
  createCharacter: () => void
  editCharacter: (character: TavernCharacter) => void
  deleteCharacter: (character: TavernCharacter) => void
}>()
</script>

<template>
  <div class="flex min-h-0 flex-col gap-3">
    <div class="flex items-center justify-between gap-3">
      <div class="min-w-0">
        <p class="text-sm font-medium">角色卡</p>
        <p class="text-xs text-muted-foreground">每个角色作为独立条目管理，编辑时在弹窗中打开。</p>
      </div>
      <Button
        type="button"
        size="sm"
        @click="createCharacter"
      >
        <PlusIcon data-icon="inline-start" />
        新建角色
      </Button>
    </div>

    <p
      v-if="!characters.length"
      class="rounded-md border border-dashed px-3 py-8 text-center text-sm text-muted-foreground"
    >
      暂无角色
    </p>

    <ul
      v-else
      class="flex flex-col gap-2"
    >
      <li
        v-for="character in characters"
        :key="character.id"
        :class="
          cn(
            'flex flex-col gap-3 rounded-md border px-4 py-3 md:flex-row md:items-center md:justify-between',
            selectedCharacterId === character.id && 'border-primary bg-muted/60',
          )
        "
      >
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <span class="truncate text-sm font-medium">{{ character.name }}</span>
            <Badge
              v-if="character.defaultLorebookIds.length"
              variant="outline"
            >
              世界书 {{ character.defaultLorebookIds.length }}
            </Badge>
          </div>
          <p
            v-if="character.description"
            class="mt-1 line-clamp-2 text-xs text-muted-foreground"
          >
            {{ character.description }}
          </p>
        </div>

        <div class="flex shrink-0 flex-wrap items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            @click="editCharacter(character)"
          >
            <PencilIcon data-icon="inline-start" />
            编辑
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="删除角色"
            @click="deleteCharacter(character)"
          >
            <Trash2Icon data-icon />
          </Button>
        </div>
      </li>
    </ul>
  </div>
</template>

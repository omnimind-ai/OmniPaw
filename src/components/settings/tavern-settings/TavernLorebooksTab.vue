<script setup lang="ts">
import type { TavernLorebook } from '@shared/types/tavern'
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

defineProps<{
  lorebooks: TavernLorebook[]
  selectedLorebookId: string
  createLorebook: () => void
  editLorebook: (lorebook: TavernLorebook) => void
  deleteLorebook: (lorebook: TavernLorebook) => void
}>()
</script>

<template>
  <div class="flex min-h-0 flex-col gap-3">
    <div class="flex items-center justify-between gap-3">
      <div class="min-w-0">
        <p class="text-sm font-medium">世界书</p>
        <p class="text-xs text-muted-foreground">条目内容在编辑弹窗内维护，列表展示名称、描述和条目数。</p>
      </div>
      <Button
        type="button"
        size="sm"
        @click="createLorebook"
      >
        <PlusIcon data-icon="inline-start" />
        新建世界书
      </Button>
    </div>

    <p
      v-if="!lorebooks.length"
      class="rounded-md border border-dashed px-3 py-8 text-center text-sm text-muted-foreground"
    >
      暂无世界书
    </p>

    <ul
      v-else
      class="flex flex-col gap-2"
    >
      <li
        v-for="lorebook in lorebooks"
        :key="lorebook.id"
        :class="
          cn(
            'flex flex-col gap-3 rounded-md border px-4 py-3 md:flex-row md:items-center md:justify-between',
            selectedLorebookId === lorebook.id && 'border-primary bg-muted/60',
          )
        "
      >
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <span class="truncate text-sm font-medium">{{ lorebook.name }}</span>
            <Badge variant="outline">{{ lorebook.entries.length }} 条</Badge>
          </div>
          <p
            v-if="lorebook.description"
            class="mt-1 line-clamp-2 text-xs text-muted-foreground"
          >
            {{ lorebook.description }}
          </p>
        </div>

        <div class="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            @click="editLorebook(lorebook)"
          >
            <PencilIcon data-icon="inline-start" />
            编辑
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="删除世界书"
            @click="deleteLorebook(lorebook)"
          >
            <Trash2Icon data-icon />
          </Button>
        </div>
      </li>
    </ul>
  </div>
</template>

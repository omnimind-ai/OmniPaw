<script setup lang="ts">
import type { TavernPromptPreset } from '@shared/types/tavern'
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

defineProps<{
  promptPresets: TavernPromptPreset[]
  selectedPromptPresetId: string
  createPromptPreset: () => void
  editPromptPreset: (preset: TavernPromptPreset) => void
  deletePromptPreset: (preset: TavernPromptPreset) => void
}>()
</script>

<template>
  <div class="flex min-h-0 flex-col gap-3">
    <div class="flex items-center justify-between gap-3">
      <div class="min-w-0">
        <p class="text-sm font-medium">Prompt preset</p>
        <p class="text-xs text-muted-foreground">维护 main prompt 和 final prompt 的独立组合。</p>
      </div>
      <Button
        type="button"
        size="sm"
        @click="createPromptPreset"
      >
        <PlusIcon data-icon="inline-start" />
        新建 preset
      </Button>
    </div>

    <p
      v-if="!promptPresets.length"
      class="rounded-md border border-dashed px-3 py-8 text-center text-sm text-muted-foreground"
    >
      暂无 prompt preset
    </p>

    <ul
      v-else
      class="flex flex-col gap-2"
    >
      <li
        v-for="preset in promptPresets"
        :key="preset.id"
        :class="
          cn(
            'flex flex-col gap-3 rounded-md border px-4 py-3 md:flex-row md:items-center md:justify-between',
            selectedPromptPresetId === preset.id && 'border-primary bg-muted/60',
          )
        "
      >
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <span class="truncate text-sm font-medium">{{ preset.name }}</span>
            <Badge variant="outline">{{ preset.slots.length }} 段</Badge>
            <Badge
              v-if="!preset.enabled"
              variant="secondary"
            >
              禁用
            </Badge>
          </div>
          <p
            v-if="preset.description"
            class="mt-1 line-clamp-2 text-xs text-muted-foreground"
          >
            {{ preset.description }}
          </p>
        </div>

        <div class="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            @click="editPromptPreset(preset)"
          >
            <PencilIcon data-icon="inline-start" />
            编辑
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="删除 prompt preset"
            @click="deletePromptPreset(preset)"
          >
            <Trash2Icon data-icon />
          </Button>
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import type { TavernLorebook, TavernLorebookEntryDraft } from '@shared/types/tavern'
import { PlusIcon, Trash2Icon } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { TavernLorebookDraftState } from './types'

defineProps<{
  lorebooks: TavernLorebook[]
  selectedLorebookId: string
  draft: TavernLorebookDraftState
  newLorebookDraft: () => void
  selectLorebook: (lorebookId: string) => void
  addLorebookEntry: () => void
  removeLorebookEntry: (index: number) => void
  setEntryKeys: (entry: TavernLorebookEntryDraft, value: string | number) => void
  setEntrySecondaryKeys: (entry: TavernLorebookEntryDraft, value: string | number) => void
}>()
</script>

<template>
  <div class="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
    <div class="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        @click="newLorebookDraft"
      >
        <PlusIcon data-icon="inline-start" />
        新建世界书
      </Button>
      <button
        v-for="lorebook in lorebooks"
        :key="lorebook.id"
        type="button"
        :class="cn(
          'flex min-h-10 items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm',
          selectedLorebookId === lorebook.id ? 'border-primary bg-muted' : 'border-border',
        )"
        @click="selectLorebook(lorebook.id)"
      >
        <span class="truncate">{{ lorebook.name }}</span>
        <Badge variant="outline">{{ lorebook.entries.length }}</Badge>
      </button>
    </div>

    <div class="flex min-w-0 flex-col gap-4">
      <FieldGroup>
        <Field orientation="horizontal">
          <Checkbox
            id="tavern-lorebook-enabled"
            v-model:checked="draft.enabled"
          />
          <FieldContent>
            <FieldLabel for="tavern-lorebook-enabled">启用世界书</FieldLabel>
            <FieldDescription>禁用后所有条目都不会被触发。</FieldDescription>
          </FieldContent>
        </Field>
        <Field>
          <FieldLabel for="tavern-lorebook-name">名称</FieldLabel>
          <Input
            id="tavern-lorebook-name"
            v-model="draft.name"
          />
        </Field>
        <Field>
          <FieldLabel for="tavern-lorebook-desc">描述</FieldLabel>
          <Textarea
            id="tavern-lorebook-desc"
            v-model="draft.description"
          />
        </Field>
      </FieldGroup>

      <div class="flex items-center justify-between gap-3">
        <p class="text-sm font-medium">条目</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          @click="addLorebookEntry"
        >
          <PlusIcon data-icon="inline-start" />
          添加条目
        </Button>
      </div>

      <div class="flex flex-col gap-3">
        <div
          v-for="(entry, index) in draft.entries"
          :key="entry.id || index"
          class="rounded-md border p-3"
        >
          <div class="flex flex-col gap-3">
            <div class="flex items-center justify-between gap-3">
              <label class="flex items-center gap-2 text-sm">
                <Checkbox v-model:checked="entry.enabled" />
                启用条目
              </label>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="删除世界书条目"
                @click="removeLorebookEntry(index)"
              >
                <Trash2Icon data-icon="inline-start" />
              </Button>
            </div>
            <div class="grid gap-3 md:grid-cols-2">
              <Field>
                <FieldLabel>关键词</FieldLabel>
                <Input
                  :model-value="entry.keys.join(', ')"
                  placeholder="keyword-a, keyword-b"
                  @update:model-value="setEntryKeys(entry, $event)"
                />
              </Field>
              <Field>
                <FieldLabel>Secondary keys</FieldLabel>
                <Input
                  :model-value="(entry.secondaryKeys ?? []).join(', ')"
                  @update:model-value="setEntrySecondaryKeys(entry, $event)"
                />
              </Field>
              <Field>
                <FieldLabel>Priority</FieldLabel>
                <Input
                  v-model="entry.priority"
                  type="number"
                />
              </Field>
              <Field>
                <FieldLabel>Order</FieldLabel>
                <Input
                  v-model="entry.order"
                  type="number"
                />
              </Field>
            </div>
            <div class="flex flex-wrap gap-4">
              <label class="flex items-center gap-2 text-sm">
                <Checkbox v-model:checked="entry.constant" />
                Constant
              </label>
              <label class="flex items-center gap-2 text-sm">
                <Checkbox v-model:checked="entry.selective" />
                Selective
              </label>
              <Select v-model="entry.position">
                <SelectTrigger class="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="after-character">After character</SelectItem>
                    <SelectItem value="before-history">Before history</SelectItem>
                    <SelectItem value="after-history">After history</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <Field>
              <FieldLabel>正文</FieldLabel>
              <Textarea
                v-model="entry.content"
                class="min-h-24"
              />
            </Field>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TavernLorebookEntryDraft } from '@shared/types/tavern'
import { PlusIcon, Trash2Icon } from 'lucide-vue-next'
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
import type { TavernLorebookDraftState } from './types'

defineProps<{
  draft: TavernLorebookDraftState
  disabled?: boolean
  addLorebookEntry: () => void
  removeLorebookEntry: (index: number) => void
  setEntryKeys: (entry: TavernLorebookEntryDraft, value: string | number) => void
  setEntrySecondaryKeys: (entry: TavernLorebookEntryDraft, value: string | number) => void
}>()
</script>

<template>
  <div class="flex min-w-0 flex-col gap-4">
    <FieldGroup>
      <Field orientation="horizontal">
        <Checkbox
          id="tavern-lorebook-enabled"
          v-model:checked="draft.enabled"
          :disabled="disabled"
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
          :disabled="disabled"
        />
      </Field>
      <Field>
        <FieldLabel for="tavern-lorebook-desc">描述</FieldLabel>
        <Textarea
          id="tavern-lorebook-desc"
          v-model="draft.description"
          :disabled="disabled"
        />
      </Field>
    </FieldGroup>

    <div class="flex items-center justify-between gap-3">
      <p class="text-sm font-medium">条目</p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        :disabled="disabled"
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
              <Checkbox
                v-model:checked="entry.enabled"
                :disabled="disabled"
              />
              启用条目
            </label>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              :disabled="disabled"
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
                :disabled="disabled"
                @update:model-value="setEntryKeys(entry, $event)"
              />
            </Field>
            <Field>
              <FieldLabel>Secondary keys</FieldLabel>
              <Input
                :model-value="(entry.secondaryKeys ?? []).join(', ')"
                :disabled="disabled"
                @update:model-value="setEntrySecondaryKeys(entry, $event)"
              />
            </Field>
            <Field>
              <FieldLabel>Priority</FieldLabel>
              <Input
                v-model="entry.priority"
                type="number"
                :disabled="disabled"
              />
            </Field>
            <Field>
              <FieldLabel>Order</FieldLabel>
              <Input
                v-model="entry.order"
                type="number"
                :disabled="disabled"
              />
            </Field>
          </div>
          <div class="flex flex-wrap gap-4">
            <label class="flex items-center gap-2 text-sm">
              <Checkbox
                v-model:checked="entry.constant"
                :disabled="disabled"
              />
              Constant
            </label>
            <label class="flex items-center gap-2 text-sm">
              <Checkbox
                v-model:checked="entry.selective"
                :disabled="disabled"
              />
              Selective
            </label>
            <Select
              v-model="entry.position"
              :disabled="disabled"
            >
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
              :disabled="disabled"
            />
          </Field>
        </div>
      </div>
    </div>
  </div>
</template>

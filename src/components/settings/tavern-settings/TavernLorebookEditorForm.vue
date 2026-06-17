<script setup lang="ts">
import type { TavernLorebookEntryDraft } from '@shared/types/tavern'
import { PlusIcon, Trash2Icon } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
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

const { t } = useI18n()

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
      <Field>
        <FieldLabel for="tavern-lorebook-name">{{ t('settings.tavern.lorebookEditor.nameLabel') }}</FieldLabel>
        <Input
          id="tavern-lorebook-name"
          v-model="draft.name"
          :disabled="disabled"
        />
      </Field>
      <Field>
        <FieldLabel for="tavern-lorebook-desc">{{ t('settings.tavern.lorebookEditor.descriptionLabel') }}</FieldLabel>
        <Textarea
          id="tavern-lorebook-desc"
          v-model="draft.description"
          :disabled="disabled"
        />
      </Field>
    </FieldGroup>

    <div class="flex items-center justify-between gap-3">
      <p class="text-sm font-medium">{{ t('settings.tavern.lorebookEditor.entriesLabel') }}</p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        :disabled="disabled"
        @click="addLorebookEntry"
      >
        <PlusIcon data-icon="inline-start" />
        {{ t('settings.tavern.lorebookEditor.addEntryButton') }}
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
              {{ t('settings.tavern.lorebookEditor.enableEntryLabel') }}
            </label>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              :disabled="disabled"
              :aria-label="t('settings.tavern.lorebookEditor.deleteEntryAriaLabel')"
              @click="removeLorebookEntry(index)"
            >
              <Trash2Icon data-icon="inline-start" />
            </Button>
          </div>
          <div class="grid gap-3 md:grid-cols-2">
            <Field>
              <FieldLabel>{{ t('settings.tavern.lorebookEditor.keysLabel') }}</FieldLabel>
              <Input
                :model-value="entry.keys.join(', ')"
                :placeholder="t('settings.tavern.lorebookEditor.keysPlaceholder')"
                :disabled="disabled"
                @update:model-value="setEntryKeys(entry, $event)"
              />
            </Field>
            <Field>
              <FieldLabel>{{ t('settings.tavern.lorebookEditor.secondaryKeysLabel') }}</FieldLabel>
              <Input
                :model-value="(entry.secondaryKeys ?? []).join(', ')"
                :placeholder="t('settings.tavern.lorebookEditor.secondaryKeysPlaceholder')"
                :disabled="disabled"
                @update:model-value="setEntrySecondaryKeys(entry, $event)"
              />
            </Field>
            <Field>
              <FieldLabel>{{ t('settings.tavern.lorebookEditor.priorityLabel') }}</FieldLabel>
              <Input
                v-model="entry.priority"
                type="number"
                :disabled="disabled"
              />
            </Field>
            <Field>
              <FieldLabel>{{ t('settings.tavern.lorebookEditor.orderLabel') }}</FieldLabel>
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
              {{ t('settings.tavern.lorebookEditor.constantLabel') }}
            </label>
            <label class="flex items-center gap-2 text-sm">
              <Checkbox
                v-model:checked="entry.selective"
                :disabled="disabled"
              />
              {{ t('settings.tavern.lorebookEditor.selectiveLabel') }}
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
                  <SelectItem value="after-character">{{ t('settings.tavern.lorebookEditor.positionAfterCharacter') }}</SelectItem>
                  <SelectItem value="before-history">{{ t('settings.tavern.lorebookEditor.positionBeforeHistory') }}</SelectItem>
                  <SelectItem value="after-history">{{ t('settings.tavern.lorebookEditor.positionAfterHistory') }}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <Field>
            <FieldLabel>{{ t('settings.tavern.lorebookEditor.contentLabel') }}</FieldLabel>
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

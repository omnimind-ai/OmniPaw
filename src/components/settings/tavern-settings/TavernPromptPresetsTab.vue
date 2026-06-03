<script setup lang="ts">
import type { TavernPromptPreset } from '@shared/types/tavern'
import { PlusIcon } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldContent, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { TavernPromptPresetDraftState } from './types'

defineProps<{
  promptPresets: TavernPromptPreset[]
  selectedPromptPresetId: string
  draft: TavernPromptPresetDraftState
  newPromptPresetDraft: () => void
  selectPromptPreset: (presetId: string) => void
}>()
</script>

<template>
  <div class="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
    <div class="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        @click="newPromptPresetDraft"
      >
        <PlusIcon data-icon="inline-start" />
        新建 preset
      </Button>
      <button
        v-for="preset in promptPresets"
        :key="preset.id"
        type="button"
        :class="cn(
          'flex min-h-10 items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm',
          selectedPromptPresetId === preset.id ? 'border-primary bg-muted' : 'border-border',
        )"
        @click="selectPromptPreset(preset.id)"
      >
        <span class="truncate">{{ preset.name }}</span>
        <Badge variant="outline">{{ preset.slots.length }}</Badge>
      </button>
    </div>

    <FieldGroup>
      <Field orientation="horizontal">
        <FieldContent>
          <FieldLabel for="tavern-preset-enabled">启用 preset</FieldLabel>
        </FieldContent>
        <Checkbox
          id="tavern-preset-enabled"
          v-model:checked="draft.enabled"
        />
      </Field>
      <Field>
        <FieldLabel for="tavern-preset-name">名称</FieldLabel>
        <Input
          id="tavern-preset-name"
          v-model="draft.name"
        />
      </Field>
      <Field>
        <FieldLabel for="tavern-preset-description">描述</FieldLabel>
        <Textarea
          id="tavern-preset-description"
          v-model="draft.description"
          class="min-h-16"
        />
      </Field>
      <Field orientation="horizontal">
        <FieldContent>
          <FieldLabel for="tavern-preset-main-enabled">启用 main prompt</FieldLabel>
        </FieldContent>
        <Checkbox
          id="tavern-preset-main-enabled"
          v-model:checked="draft.mainEnabled"
        />
      </Field>
      <Field>
        <FieldLabel for="tavern-preset-main">Main prompt</FieldLabel>
        <Textarea
          id="tavern-preset-main"
          v-model="draft.mainPrompt"
          class="min-h-40"
          placeholder="{{char}}、{{user}}、{{persona}}"
        />
      </Field>
      <Field orientation="horizontal">
        <FieldContent>
          <FieldLabel for="tavern-preset-final-enabled">启用 final prompt</FieldLabel>
        </FieldContent>
        <Checkbox
          id="tavern-preset-final-enabled"
          v-model:checked="draft.finalEnabled"
        />
      </Field>
      <Field>
        <FieldLabel for="tavern-preset-final">Final / post-history prompt</FieldLabel>
        <Textarea
          id="tavern-preset-final"
          v-model="draft.finalPrompt"
          class="min-h-32"
          placeholder="会放在普通历史之后，靠近当前用户回合"
        />
      </Field>
    </FieldGroup>
  </div>
</template>

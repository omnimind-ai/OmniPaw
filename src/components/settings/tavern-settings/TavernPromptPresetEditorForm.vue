<script setup lang="ts">
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldContent, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { TavernPromptPresetDraftState } from './types'

defineProps<{
  draft: TavernPromptPresetDraftState
  disabled?: boolean
}>()
</script>

<template>
  <FieldGroup>
    <Field orientation="horizontal">
      <FieldContent>
        <FieldLabel for="tavern-preset-enabled">启用 preset</FieldLabel>
      </FieldContent>
      <Checkbox
        id="tavern-preset-enabled"
        v-model:checked="draft.enabled"
        :disabled="disabled"
      />
    </Field>
    <Field>
      <FieldLabel for="tavern-preset-name">名称</FieldLabel>
      <Input
        id="tavern-preset-name"
        v-model="draft.name"
        :disabled="disabled"
      />
    </Field>
    <Field>
      <FieldLabel for="tavern-preset-description">描述</FieldLabel>
      <Textarea
        id="tavern-preset-description"
        v-model="draft.description"
        class="min-h-16"
        :disabled="disabled"
      />
    </Field>
    <Field orientation="horizontal">
      <FieldContent>
        <FieldLabel for="tavern-preset-main-enabled">启用 main prompt</FieldLabel>
      </FieldContent>
      <Checkbox
        id="tavern-preset-main-enabled"
        v-model:checked="draft.mainEnabled"
        :disabled="disabled"
      />
    </Field>
    <Field>
      <FieldLabel for="tavern-preset-main">Main prompt</FieldLabel>
      <Textarea
        id="tavern-preset-main"
        v-model="draft.mainPrompt"
        class="min-h-40"
        placeholder="{{char}}、{{user}}、{{persona}}"
        :disabled="disabled"
      />
    </Field>
    <Field orientation="horizontal">
      <FieldContent>
        <FieldLabel for="tavern-preset-final-enabled">启用 final prompt</FieldLabel>
      </FieldContent>
      <Checkbox
        id="tavern-preset-final-enabled"
        v-model:checked="draft.finalEnabled"
        :disabled="disabled"
      />
    </Field>
    <Field>
      <FieldLabel for="tavern-preset-final">Final / post-history prompt</FieldLabel>
      <Textarea
        id="tavern-preset-final"
        v-model="draft.finalPrompt"
        class="min-h-32"
        placeholder="会放在普通历史之后，靠近当前用户回合"
        :disabled="disabled"
      />
    </Field>
  </FieldGroup>
</template>

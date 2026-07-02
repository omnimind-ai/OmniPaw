<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldContent, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { TavernPromptPresetDraftState } from './types'

const { t } = useI18n()

defineProps<{
  draft: TavernPromptPresetDraftState
  disabled?: boolean
}>()
</script>

<template>
  <FieldGroup>
    <Field orientation="horizontal">
      <FieldContent>
        <FieldLabel for="tavern-preset-enabled">{{ t('settings.tavern.presetEditor.enableLabel') }}</FieldLabel>
      </FieldContent>
      <Checkbox
        id="tavern-preset-enabled"
        v-model:checked="draft.enabled"
        :disabled="disabled"
      />
    </Field>
    <Field>
      <FieldLabel for="tavern-preset-name">{{ t('settings.tavern.presetEditor.nameLabel') }}</FieldLabel>
      <Input
        id="tavern-preset-name"
        v-model="draft.name"
        :disabled="disabled"
      />
    </Field>
    <Field>
      <FieldLabel for="tavern-preset-description">{{ t('settings.tavern.presetEditor.descriptionLabel') }}</FieldLabel>
      <Textarea
        id="tavern-preset-description"
        v-model="draft.description"
        class="min-h-16"
        :disabled="disabled"
      />
    </Field>
    <Field orientation="horizontal">
      <FieldContent>
        <FieldLabel for="tavern-preset-main-enabled">{{ t('settings.tavern.presetEditor.mainPromptEnableLabel') }}</FieldLabel>
      </FieldContent>
      <Checkbox
        id="tavern-preset-main-enabled"
        v-model:checked="draft.mainEnabled"
        :disabled="disabled"
      />
    </Field>
    <Field>
      <FieldLabel for="tavern-preset-main">{{ t('settings.tavern.presetEditor.mainPromptLabel') }}</FieldLabel>
      <Textarea
        id="tavern-preset-main"
        v-model="draft.mainPrompt"
        class="min-h-40"
        placeholder="{{char}}、{{user}}、{{profile}}"
        :disabled="disabled"
      />
    </Field>
    <Field orientation="horizontal">
      <FieldContent>
        <FieldLabel for="tavern-preset-final-enabled">{{ t('settings.tavern.presetEditor.finalPromptEnableLabel') }}</FieldLabel>
      </FieldContent>
      <Checkbox
        id="tavern-preset-final-enabled"
        v-model:checked="draft.finalEnabled"
        :disabled="disabled"
      />
    </Field>
    <Field>
      <FieldLabel for="tavern-preset-final">{{ t('settings.tavern.presetEditor.finalPromptLabel') }}</FieldLabel>
      <Textarea
        id="tavern-preset-final"
        v-model="draft.finalPrompt"
        class="min-h-32"
        :placeholder="t('settings.tavern.presetEditor.finalPromptPlaceholder')"
        :disabled="disabled"
      />
    </Field>
  </FieldGroup>
</template>

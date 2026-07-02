<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { TavernUserProfileDraftState } from './types'

const { t } = useI18n()

defineProps<{
  draft: TavernUserProfileDraftState
  disabled?: boolean
}>()
</script>

<template>
  <FieldGroup>
    <FieldDescription>
      {{ t('settings.tavern.profileEditor.fieldDescription') }}
    </FieldDescription>
    <Field orientation="horizontal">
      <FieldContent>
        <FieldLabel for="tavern-profile-enabled">{{ t('settings.tavern.profileEditor.enableLabel') }}</FieldLabel>
      </FieldContent>
      <Checkbox
        id="tavern-profile-enabled"
        v-model:checked="draft.enabled"
        :disabled="disabled"
      />
    </Field>
    <Field>
      <FieldLabel for="tavern-profile-name">{{ t('settings.tavern.profileEditor.nameLabel') }}</FieldLabel>
      <Input
        id="tavern-profile-name"
        v-model="draft.name"
        :disabled="disabled"
      />
    </Field>
    <Field>
      <FieldLabel for="tavern-profile-description">{{ t('settings.tavern.profileEditor.descriptionLabel') }}</FieldLabel>
      <Textarea
        id="tavern-profile-description"
        v-model="draft.description"
        class="min-h-40"
        :placeholder="t('settings.tavern.profileEditor.descriptionPlaceholder')"
        :disabled="disabled"
      />
    </Field>
  </FieldGroup>
</template>

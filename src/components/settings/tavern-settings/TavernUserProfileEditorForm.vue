<script setup lang="ts">
import type { PersonaProfile } from '@shared/types/persona'
import { useI18n } from 'vue-i18n'
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
import type { TavernUserProfileDraftState } from './types'

const { t } = useI18n()

defineProps<{
  draft: TavernUserProfileDraftState
  personaProfiles: PersonaProfile[]
  savingUserProfile: boolean
  disabled?: boolean
  copyPersonaToUserProfile: () => void
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
    <Field>
      <FieldLabel for="tavern-profile-copy">{{ t('settings.tavern.profileEditor.copyLabel') }}</FieldLabel>
      <div class="flex gap-2">
        <Select
          v-model="draft.copyPersonaId"
          :disabled="disabled"
        >
          <SelectTrigger
            id="tavern-profile-copy"
            class="min-w-0 flex-1"
          >
            <SelectValue :placeholder="t('settings.tavern.profileEditor.selectPlaceholder')" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem
                v-for="profile in personaProfiles"
                :key="profile.id"
                :value="profile.id"
              >
                {{ profile.name }}
              </SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          :disabled="disabled || !draft.copyPersonaId || savingUserProfile"
          @click="copyPersonaToUserProfile"
        >
          {{ t('settings.tavern.profileEditor.copyButton') }}
        </Button>
      </div>
    </Field>
  </FieldGroup>
</template>

<script setup lang="ts">
import type { TavernLorebook } from '@shared/types/tavern'
import { useI18n } from 'vue-i18n'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { TavernCharacterDraftState } from './types'

const { t } = useI18n()

defineProps<{
  draft: TavernCharacterDraftState
  lorebooks: TavernLorebook[]
  selectedSessionLorebookSet: Set<string>
  disabled?: boolean
  toggleSessionLorebook: (lorebookId: string, checked: boolean | 'indeterminate') => void
}>()
</script>

<template>
  <div class="flex min-w-0 flex-col gap-4">
    <FieldGroup>
      <Field>
        <FieldLabel for="tavern-character-name">{{ t('settings.tavern.characterEditor.nameLabel') }}</FieldLabel>
        <Input
          id="tavern-character-name"
          v-model="draft.name"
          :placeholder="t('settings.tavern.characterEditor.namePlaceholder')"
          :disabled="disabled"
        />
      </Field>
      <Field>
        <FieldLabel for="tavern-character-desc">{{ t('settings.tavern.characterEditor.descriptionLabel') }}</FieldLabel>
        <Textarea
          id="tavern-character-desc"
          v-model="draft.description"
          class="min-h-20"
          :disabled="disabled"
        />
      </Field>
      <Field>
        <FieldLabel for="tavern-character-personality">{{ t('settings.tavern.characterEditor.personalityLabel') }}</FieldLabel>
        <Textarea
          id="tavern-character-personality"
          v-model="draft.personality"
          class="min-h-20"
          :disabled="disabled"
        />
      </Field>
      <Field>
        <FieldLabel for="tavern-character-scenario">{{ t('settings.tavern.characterEditor.scenarioLabel') }}</FieldLabel>
        <Textarea
          id="tavern-character-scenario"
          v-model="draft.scenario"
          class="min-h-20"
          :disabled="disabled"
        />
      </Field>
      <Field>
        <FieldLabel for="tavern-character-system">{{ t('settings.tavern.characterEditor.systemPromptLabel') }}</FieldLabel>
        <Textarea
          id="tavern-character-system"
          v-model="draft.systemPrompt"
          class="min-h-20"
          :disabled="disabled"
        />
      </Field>
      <Field>
        <FieldLabel for="tavern-character-post-history">{{ t('settings.tavern.characterEditor.postHistoryLabel') }}</FieldLabel>
        <Textarea
          id="tavern-character-post-history"
          v-model="draft.postHistoryInstructions"
          class="min-h-20"
          :disabled="disabled"
        />
      </Field>
      <Field>
        <FieldLabel for="tavern-character-first-message">{{ t('settings.tavern.characterEditor.firstMessageLabel') }}</FieldLabel>
        <Textarea
          id="tavern-character-first-message"
          v-model="draft.firstMessage"
          class="min-h-20"
          :disabled="disabled"
        />
      </Field>
      <Field>
        <FieldLabel for="tavern-character-alt">{{ t('settings.tavern.characterEditor.alternateGreetingsLabel') }}</FieldLabel>
        <Textarea
          id="tavern-character-alt"
          v-model="draft.alternateGreetingsText"
          class="min-h-24"
          :placeholder="t('settings.tavern.characterEditor.separatorPlaceholder')"
          :disabled="disabled"
        />
      </Field>
      <Field>
        <FieldLabel for="tavern-character-examples">{{ t('settings.tavern.characterEditor.messageExamplesLabel') }}</FieldLabel>
        <Textarea
          id="tavern-character-examples"
          v-model="draft.messageExamplesText"
          class="min-h-24"
          :placeholder="t('settings.tavern.characterEditor.separatorPlaceholder')"
          :disabled="disabled"
        />
      </Field>
      <Field>
        <FieldLabel for="tavern-character-tags">{{ t('settings.tavern.characterEditor.tagsLabel') }}</FieldLabel>
        <Input
          id="tavern-character-tags"
          v-model="draft.tagsText"
          :placeholder="t('settings.tavern.characterEditor.tagsPlaceholder')"
          :disabled="disabled"
        />
      </Field>
    </FieldGroup>

    <div class="flex flex-col gap-2 rounded-md border p-3">
      <p class="text-sm font-medium">{{ t('settings.tavern.characterEditor.lorebookSectionTitle') }}</p>
      <label
        v-for="lorebook in lorebooks"
        :key="lorebook.id"
        class="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
      >
        <Checkbox
          :checked="selectedSessionLorebookSet.has(lorebook.id)"
          :disabled="disabled"
          @update:checked="toggleSessionLorebook(lorebook.id, $event)"
        />
        <span class="truncate">{{ lorebook.name }}</span>
      </label>
      <p
        v-if="!lorebooks.length"
        class="text-sm text-muted-foreground"
      >
        {{ t('settings.tavern.characterEditor.noLorebooksMessage') }}
      </p>
    </div>
  </div>
</template>

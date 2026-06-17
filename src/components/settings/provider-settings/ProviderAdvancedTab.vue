<script setup lang="ts">
import { useI18n } from 'vue-i18n'
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
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import type { ProviderDraft } from './types'

const { t } = useI18n()

defineProps<{
  draft: ProviderDraft
}>()
</script>

<template>
  <FieldGroup>
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Field>
        <FieldLabel for="provider-auth-header">{{ t('settings.provider.advanced.authHeader') }}</FieldLabel>
        <Input
          id="provider-auth-header"
          v-model="draft.authHeader"
        />
      </Field>

      <Field>
        <FieldLabel for="provider-max-token-field">{{ t('settings.provider.advanced.maxTokensField') }}</FieldLabel>
        <Select v-model="draft.compat.maxTokensField">
          <SelectTrigger
            id="provider-max-token-field"
            class="w-full"
          >
            <SelectValue :placeholder="t('settings.provider.advanced.fieldPlaceholder')" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="max_tokens">{{ t('settings.provider.advanced.maxTokensValue') }}</SelectItem>
              <SelectItem value="max_completion_tokens">{{ t('settings.provider.advanced.maxCompletionTokensValue') }}</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
    </div>

    <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
      <Field
        orientation="horizontal"
        class="items-center rounded-lg border px-3 py-2"
      >
        <Switch
          id="provider-list-models"
          v-model="draft.capabilities.listModels"
          :aria-label="t('settings.provider.advanced.capabilities.listModels')"
        />
        <FieldLabel for="provider-list-models">{{ t('settings.provider.advanced.capabilities.listModels') }}</FieldLabel>
      </Field>
      <Field
        orientation="horizontal"
        class="items-center rounded-lg border px-3 py-2"
      >
        <Switch
          id="provider-tools"
          v-model="draft.capabilities.tools"
          :aria-label="t('settings.provider.advanced.capabilities.tools')"
        />
        <FieldLabel for="provider-tools">{{ t('settings.provider.advanced.capabilities.tools') }}</FieldLabel>
      </Field>
      <Field
        orientation="horizontal"
        class="items-center rounded-lg border px-3 py-2"
      >
        <Switch
          id="provider-system-role"
          v-model="draft.compat.supportsSystemRole"
          :aria-label="t('settings.provider.advanced.capabilities.systemRole')"
        />
        <FieldLabel for="provider-system-role">{{ t('settings.provider.advanced.capabilities.systemRole') }}</FieldLabel>
      </Field>
      <Field
        orientation="horizontal"
        class="items-center rounded-lg border px-3 py-2"
      >
        <Switch
          id="provider-json-mode"
          v-model="draft.compat.supportsJsonMode"
          :aria-label="t('settings.provider.advanced.capabilities.jsonMode')"
        />
        <FieldLabel for="provider-json-mode">{{ t('settings.provider.advanced.capabilities.jsonMode') }}</FieldLabel>
      </Field>
    </div>

    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Field>
        <FieldLabel for="provider-headers">{{ t('settings.provider.advanced.headers') }}</FieldLabel>
        <Textarea
          id="provider-headers"
          v-model="draft.headersText"
          class="min-h-40 font-mono text-xs"
        />
      </Field>

      <Field>
        <FieldLabel for="provider-extra-body">{{ t('settings.provider.advanced.extraBody') }}</FieldLabel>
        <Textarea
          id="provider-extra-body"
          v-model="draft.extraBodyText"
          class="min-h-40 font-mono text-xs"
        />
      </Field>
    </div>
  </FieldGroup>
</template>

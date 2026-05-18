<script setup lang="ts">
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

defineProps<{
  draft: ProviderDraft
}>()
</script>

<template>
  <FieldGroup>
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Field>
        <FieldLabel for="provider-auth-header">认证 Header</FieldLabel>
        <Input
          id="provider-auth-header"
          v-model="draft.authHeader"
        />
      </Field>

      <Field>
        <FieldLabel for="provider-max-token-field">Max Tokens 字段</FieldLabel>
        <Select v-model="draft.compat.maxTokensField">
          <SelectTrigger
            id="provider-max-token-field"
            class="w-full"
          >
            <SelectValue placeholder="选择字段" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="max_tokens">max_tokens</SelectItem>
              <SelectItem value="max_completion_tokens">max_completion_tokens</SelectItem>
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
          aria-label="支持列出模型"
        />
        <FieldLabel for="provider-list-models">支持列出模型</FieldLabel>
      </Field>
      <Field
        orientation="horizontal"
        class="items-center rounded-lg border px-3 py-2"
      >
        <Switch
          id="provider-tools"
          v-model="draft.capabilities.tools"
          aria-label="默认支持工具"
        />
        <FieldLabel for="provider-tools">默认支持工具</FieldLabel>
      </Field>
      <Field
        orientation="horizontal"
        class="items-center rounded-lg border px-3 py-2"
      >
        <Switch
          id="provider-system-role"
          v-model="draft.compat.supportsSystemRole"
          aria-label="支持 system role"
        />
        <FieldLabel for="provider-system-role">System role</FieldLabel>
      </Field>
      <Field
        orientation="horizontal"
        class="items-center rounded-lg border px-3 py-2"
      >
        <Switch
          id="provider-json-mode"
          v-model="draft.compat.supportsJsonMode"
          aria-label="支持 JSON mode"
        />
        <FieldLabel for="provider-json-mode">JSON mode</FieldLabel>
      </Field>
    </div>

    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Field>
        <FieldLabel for="provider-headers">Headers JSON</FieldLabel>
        <Textarea
          id="provider-headers"
          v-model="draft.headersText"
          class="min-h-40 font-mono text-xs"
        />
      </Field>

      <Field>
        <FieldLabel for="provider-extra-body">Extra Body JSON</FieldLabel>
        <Textarea
          id="provider-extra-body"
          v-model="draft.extraBodyText"
          class="min-h-40 font-mono text-xs"
        />
      </Field>
    </div>
  </FieldGroup>
</template>

<script setup lang="ts">
import { CloudIcon } from 'lucide-vue-next'
import { computed } from 'vue'

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import type { ProviderType } from '@shared/types/provider'
import type { CredentialMode, ProviderDraft } from './types'

const props = defineProps<{
  credentialMode: CredentialMode
  credentialValue: string
  draft: ProviderDraft
  isExistingProvider: boolean
}>()

const emit = defineEmits<{
  'update:credentialMode': [value: CredentialMode]
  'update:credentialValue': [value: string]
  'update-provider-type': [value: ProviderType]
}>()

const localCredentialMode = computed({
  get: () => props.credentialMode,
  set: (value: CredentialMode) => emit('update:credentialMode', value),
})

const localCredentialValue = computed({
  get: () => props.credentialValue,
  set: (value: string) => emit('update:credentialValue', value),
})
</script>

<template>
  <FieldGroup>
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Field>
        <FieldLabel for="provider-name">名称</FieldLabel>
        <Input
          id="provider-name"
          v-model="draft.name"
        />
      </Field>

      <Field>
        <FieldLabel for="provider-id">Provider ID</FieldLabel>
        <Input
          id="provider-id"
          v-model="draft.id"
          :disabled="isExistingProvider"
        />
      </Field>
    </div>

    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Field>
        <FieldLabel for="provider-type">类型</FieldLabel>
        <Select
          :model-value="draft.type"
          @update:model-value="emit('update-provider-type', $event as ProviderType)"
        >
          <SelectTrigger
            id="provider-type"
            class="w-full"
          >
            <SelectValue placeholder="选择类型" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="openai-compatible">OpenAI Compatible</SelectItem>
              <SelectItem value="ollama">Ollama</SelectItem>
              <SelectItem value="omniinfer">OmniInfer</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>

      <Field>
        <FieldLabel for="provider-api">API</FieldLabel>
        <Select v-model="draft.api">
          <SelectTrigger
            id="provider-api"
            class="w-full"
          >
            <SelectValue placeholder="选择 API" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="openai-chat-completions">OpenAI Chat Completions</SelectItem>
              <SelectItem value="openai-responses">OpenAI Responses</SelectItem>
              <SelectItem value="ollama">Ollama</SelectItem>
              <SelectItem value="omniinfer">OmniInfer</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
    </div>

    <Field>
      <FieldLabel for="provider-base-url">Base URL</FieldLabel>
      <InputGroup>
        <InputGroupAddon>
          <CloudIcon />
        </InputGroupAddon>
        <InputGroupInput
          id="provider-base-url"
          v-model="draft.baseUrl"
          placeholder="https://api.openai.com/v1"
        />
      </InputGroup>
    </Field>

    <Field
      orientation="horizontal"
      class="items-center rounded-lg border px-3 py-2"
    >
      <Switch
        id="provider-enabled"
        v-model="draft.enabled"
        aria-label="启用 Provider"
      />
      <FieldContent>
        <FieldLabel for="provider-enabled">启用 Provider</FieldLabel>
        <FieldDescription>禁用后该 Provider 下模型不会出现在可选列表中。</FieldDescription>
      </FieldContent>
    </Field>

    <Separator />

    <FieldSet>
      <FieldLegend>凭证</FieldLegend>
      <FieldDescription>留空会保留已有凭证。</FieldDescription>

      <div class="grid grid-cols-1 gap-4 lg:grid-cols-[12rem_minmax(0,1fr)]">
        <Field>
          <FieldLabel for="credential-mode">凭证类型</FieldLabel>
          <Select v-model="localCredentialMode">
            <SelectTrigger
              id="credential-mode"
              class="w-full"
            >
              <SelectValue placeholder="选择凭证类型" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="api-key">API Key</SelectItem>
                <SelectItem value="env">环境变量</SelectItem>
                <SelectItem value="none">不更新</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>

        <Field :data-disabled="localCredentialMode === 'none'">
          <FieldLabel for="credential-value">
            {{ localCredentialMode === 'env' ? '环境变量名' : 'API Key' }}
          </FieldLabel>
          <Input
            id="credential-value"
            v-model="localCredentialValue"
            :disabled="localCredentialMode === 'none'"
            :type="localCredentialMode === 'api-key' ? 'password' : 'text'"
            placeholder="留空保留已有值"
          />
        </Field>
      </div>
    </FieldSet>
  </FieldGroup>
</template>

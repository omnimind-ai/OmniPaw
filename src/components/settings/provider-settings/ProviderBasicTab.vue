<script setup lang="ts">
import { CloudIcon, LogInIcon, LogOutIcon, RefreshCwIcon } from 'lucide-vue-next'
import { computed } from 'vue'
import type { BridgeOpenAICodexOAuthStatus } from '@/bridge/app'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import type { CredentialMode, ProviderDraft } from './types'

const props = defineProps<{
  credentialMode: CredentialMode
  credentialValue: string
  draft: ProviderDraft
  isExistingProvider: boolean
  oauthBusy?: boolean
  oauthStatus?: BridgeOpenAICodexOAuthStatus | null
}>()

const emit = defineEmits<{
  'update:credentialMode': [value: CredentialMode]
  'update:credentialValue': [value: string]
  oauthLogin: []
  oauthLogout: []
  oauthRefresh: []
}>()

const localCredentialMode = computed({
  get: () => props.credentialMode,
  set: (value: CredentialMode) => emit('update:credentialMode', value),
})

const localCredentialValue = computed({
  get: () => props.credentialValue,
  set: (value: string) => emit('update:credentialValue', value),
})

const isOpenAICodexProvider = computed(
  () => props.draft.type === 'openai-codex' || props.draft.api === 'openai-codex-responses'
)
const oauthAuthenticated = computed(() => Boolean(props.oauthStatus?.authenticated))
const oauthAccountLabel = computed(() => {
  const status = props.oauthStatus
  if (status?.email) return status.email
  if (status?.accountId) return status.accountId
  return '未连接'
})
const oauthExpiresLabel = computed(() => {
  const expires = props.oauthStatus?.expires
  if (!expires) return ''
  return new Intl.DateTimeFormat(undefined, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(expires))
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

    <FieldSet v-if="isOpenAICodexProvider">
      <FieldLegend>OpenAI OAuth</FieldLegend>
      <FieldDescription>使用 OpenAI 账号登录后，访问令牌会加密保存在本机。</FieldDescription>

      <Field class="rounded-lg border px-3 py-3">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <FieldContent>
            <FieldLabel>登录状态</FieldLabel>
            <FieldDescription>
              {{ oauthAccountLabel }}
              <span v-if="oauthExpiresLabel"> · 到期 {{ oauthExpiresLabel }}</span>
            </FieldDescription>
          </FieldContent>
          <div class="flex flex-wrap items-center gap-2">
            <Badge :variant="oauthAuthenticated ? 'default' : 'secondary'">
              {{ oauthAuthenticated ? '已连接' : '未连接' }}
            </Badge>
            <Button
              type="button"
              variant="outline"
              size="sm"
              :disabled="oauthBusy"
              @click="emit('oauthRefresh')"
            >
              <RefreshCwIcon data-icon="inline-start" />
              刷新
            </Button>
            <Button
              type="button"
              size="sm"
              :disabled="oauthBusy"
              @click="emit('oauthLogin')"
            >
              <LogInIcon data-icon="inline-start" />
              {{ oauthAuthenticated ? '重新登录' : '使用 OpenAI 登录' }}
            </Button>
            <Button
              v-if="oauthAuthenticated"
              type="button"
              variant="outline"
              size="sm"
              :disabled="oauthBusy"
              @click="emit('oauthLogout')"
            >
              <LogOutIcon data-icon="inline-start" />
              断开
            </Button>
          </div>
        </div>
      </Field>
    </FieldSet>

    <FieldSet v-else>
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

<script setup lang="ts">
import { CloudIcon, LogInIcon, LogOutIcon, RefreshCwIcon } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
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

const { t } = useI18n()

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
  return t('settings.provider.basic.oauth.notConnected')
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
const hasSavedCredential = computed(() =>
  Boolean(props.isExistingProvider && props.draft.credentialRef)
)
</script>

<template>
  <FieldGroup>
    <Field>
      <FieldLabel for="provider-name">{{ t('settings.provider.basic.name') }}</FieldLabel>
      <Input
        id="provider-name"
        v-model="draft.name"
      />
    </Field>

    <Field>
      <FieldLabel for="provider-base-url">{{ t('settings.provider.basic.baseUrl') }}</FieldLabel>
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
        :aria-label="t('settings.provider.basic.enabled')"
      />
      <FieldContent>
        <FieldLabel for="provider-enabled">{{ t('settings.provider.basic.enabled') }}</FieldLabel>
        <FieldDescription>{{ t('settings.provider.basic.enabledDescription') }}</FieldDescription>
      </FieldContent>
    </Field>

    <Separator />

    <FieldSet v-if="isOpenAICodexProvider">
      <FieldLegend>{{ t('settings.provider.basic.oauth.title') }}</FieldLegend>
      <FieldDescription>{{ t('settings.provider.basic.oauth.description') }}</FieldDescription>

      <Field class="rounded-lg border px-3 py-3">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <FieldContent>
            <FieldLabel>{{ t('settings.provider.basic.oauth.status') }}</FieldLabel>
            <FieldDescription>
              {{ oauthAccountLabel }}
              <span v-if="oauthExpiresLabel"> · {{ t('settings.provider.basic.oauth.expires') }} {{ oauthExpiresLabel }}</span>
            </FieldDescription>
          </FieldContent>
          <div class="flex flex-wrap items-center gap-2">
            <Badge :variant="oauthAuthenticated ? 'default' : 'secondary'">
              {{ oauthAuthenticated ? t('settings.provider.basic.oauth.connected') : t('settings.provider.basic.oauth.notConnected') }}
            </Badge>
            <Button
              type="button"
              variant="outline"
              size="sm"
              :disabled="oauthBusy"
              @click="emit('oauthRefresh')"
            >
              <RefreshCwIcon data-icon="inline-start" />
              {{ t('settings.provider.basic.oauth.refresh') }}
            </Button>
            <Button
              type="button"
              size="sm"
              :disabled="oauthBusy"
              @click="emit('oauthLogin')"
            >
              <LogInIcon data-icon="inline-start" />
              {{ oauthAuthenticated ? t('settings.provider.basic.oauth.relogin') : t('settings.provider.basic.oauth.login') }}
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
              {{ t('settings.provider.basic.oauth.logout') }}
            </Button>
          </div>
        </div>
      </Field>
    </FieldSet>

    <FieldSet v-else>
      <FieldLegend>{{ t('settings.provider.basic.credential.title') }}</FieldLegend>
      <FieldDescription>
        {{
          hasSavedCredential
            ? t('settings.provider.basic.credential.savedDescription')
            : t('settings.provider.basic.credential.description')
        }}
      </FieldDescription>

      <div class="grid grid-cols-1 gap-4 lg:grid-cols-[12rem_minmax(0,1fr)]">
        <Field>
          <FieldLabel for="credential-mode">{{ t('settings.provider.basic.credential.type') }}</FieldLabel>
          <Select v-model="localCredentialMode">
            <SelectTrigger
              id="credential-mode"
              class="w-full"
            >
              <SelectValue :placeholder="t('settings.provider.basic.credential.placeholder')" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="api-key">{{ t('settings.provider.basic.credential.apiKey') }}</SelectItem>
                <SelectItem value="env">{{ t('settings.provider.basic.credential.env') }}</SelectItem>
                <SelectItem value="none">{{ t('settings.provider.basic.credential.noUpdate') }}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>

        <Field :data-disabled="localCredentialMode === 'none'">
          <FieldLabel for="credential-value">
            {{ localCredentialMode === 'env' ? t('settings.provider.basic.credential.envName') : t('settings.provider.basic.credential.value') }}
          </FieldLabel>
          <Input
            id="credential-value"
            v-model="localCredentialValue"
            :disabled="localCredentialMode === 'none'"
            :type="localCredentialMode === 'api-key' ? 'password' : 'text'"
            :placeholder="t('settings.provider.basic.credential.valuePlaceholder')"
          />
        </Field>
      </div>
    </FieldSet>
  </FieldGroup>
</template>

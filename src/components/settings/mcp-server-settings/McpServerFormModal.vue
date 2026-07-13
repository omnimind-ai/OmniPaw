<script setup lang="ts">
import { PlusIcon, RefreshCwIcon } from '@lucide/vue'
import { useI18n } from 'vue-i18n'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
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
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import type { McpSecretRowType, McpServerDraft } from './types'

const open = defineModel<boolean>('open', { required: true })
const draft = defineModel<McpServerDraft>('draft', { required: true })

defineProps<{
  editing: boolean
  existingSecretKeys: string[]
  formErrors: Record<string, string>
  saving: boolean
  disabled: boolean
}>()

const emit = defineEmits<{
  submit: []
  close: []
  addRow: [type: McpSecretRowType]
  removeRow: [type: McpSecretRowType, rowId: string]
}>()

const { t } = useI18n()
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{{ editing ? t('settings.mcpServer.form.editTitle') : t('settings.mcpServer.form.title') }}</DialogTitle>
        <DialogDescription>
          {{ t('settings.mcpServer.form.description') }}
        </DialogDescription>
      </DialogHeader>

      <form
        class="flex flex-col gap-4"
        @submit.prevent="emit('submit')"
      >
        <FieldGroup>
          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field :data-invalid="formErrors.name ? '' : undefined">
              <FieldLabel for="mcp-server-name">{{ t('settings.mcpServer.form.nameLabel') }}</FieldLabel>
              <Input
                id="mcp-server-name"
                v-model="draft.name"
                :aria-invalid="Boolean(formErrors.name)"
                :placeholder="t('settings.mcpServer.form.namePlaceholder')"
              />
              <FieldError :errors="[formErrors.name]" />
            </Field>

            <Field>
              <FieldLabel for="mcp-server-id">{{ t('settings.mcpServer.form.serverIdLabel') }}</FieldLabel>
              <Input
                id="mcp-server-id"
                :model-value="draft.id || t('settings.mcpServer.form.serverIdAutoGen')"
                disabled
              />
            </Field>
          </div>

          <Field
            orientation="horizontal"
            class="items-center rounded-md border px-3 py-2"
          >
            <Switch
              id="mcp-server-enabled"
              v-model="draft.enabled"
              :aria-label="t('settings.mcpServer.form.enableLabel')"
            />
            <FieldContent>
              <FieldLabel for="mcp-server-enabled">{{ t('settings.mcpServer.form.enableLabel') }}</FieldLabel>
              <FieldDescription>{{ t('settings.mcpServer.form.enableDesc') }}</FieldDescription>
            </FieldContent>
          </Field>

          <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field>
              <FieldLabel for="mcp-transport-type">{{ t('settings.mcpServer.form.transportTypeLabel') }}</FieldLabel>
              <Select v-model="draft.transportType">
                <SelectTrigger
                  id="mcp-transport-type"
                  class="w-full"
                >
                  <SelectValue :placeholder="t('settings.mcpServer.form.transportTypePlaceholder')" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="stdio">{{ t('settings.mcpServer.transportLabels.stdio') }}</SelectItem>
                    <SelectItem value="http">{{ t('settings.mcpServer.transportLabels.http') }}</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <Field :data-invalid="formErrors.timeoutMs ? '' : undefined">
              <FieldLabel for="mcp-timeout-ms">{{ t('settings.mcpServer.form.timeoutMsLabel') }}</FieldLabel>
              <Input
                id="mcp-timeout-ms"
                v-model="draft.timeoutMs"
                type="number"
                min="1"
                :aria-invalid="Boolean(formErrors.timeoutMs)"
              />
              <FieldError :errors="[formErrors.timeoutMs]" />
            </Field>

            <Field :data-invalid="formErrors.toolTimeoutMs ? '' : undefined">
              <FieldLabel for="mcp-tool-timeout-ms">{{ t('settings.mcpServer.form.toolTimeoutMsLabel') }}</FieldLabel>
              <Input
                id="mcp-tool-timeout-ms"
                v-model="draft.toolTimeoutMs"
                type="number"
                min="1"
                :aria-invalid="Boolean(formErrors.toolTimeoutMs)"
              />
              <FieldError :errors="[formErrors.toolTimeoutMs]" />
            </Field>
          </div>

          <template v-if="draft.transportType === 'stdio'">
            <Field :data-invalid="formErrors.command ? '' : undefined">
              <FieldLabel for="mcp-command">{{ t('settings.mcpServer.form.commandLabel') }}</FieldLabel>
              <Input
                id="mcp-command"
                v-model="draft.command"
                :aria-invalid="Boolean(formErrors.command)"
                :placeholder="t('settings.mcpServer.form.commandPlaceholder')"
              />
              <FieldError :errors="[formErrors.command]" />
            </Field>

            <Field>
              <FieldLabel for="mcp-args">{{ t('settings.mcpServer.form.argsLabel') }}</FieldLabel>
              <Textarea
                id="mcp-args"
                v-model="draft.argsText"
                :placeholder="t('settings.mcpServer.form.argPlaceholder')"
              />
              <FieldDescription>{{ t('settings.mcpServer.form.argsHelp') }}</FieldDescription>
            </Field>

            <Field>
              <FieldLabel for="mcp-cwd">{{ t('settings.mcpServer.form.cwdLabel') }}</FieldLabel>
              <Input
                id="mcp-cwd"
                v-model="draft.cwd"
                :placeholder="t('settings.mcpServer.form.cwdPlaceholder')"
              />
            </Field>

            <Field>
              <FieldLabel>{{ t('settings.mcpServer.form.envVarsLabel') }}</FieldLabel>
              <FieldDescription v-if="existingSecretKeys.length">
                {{ t('settings.mcpServer.form.envVarsSavedKeysPrefix') }}{{ existingSecretKeys.join(', ') }}{{ t('settings.mcpServer.form.envVarsSavedKeysSuffix') }}
              </FieldDescription>
              <div class="flex flex-col gap-2">
                <div
                  v-for="row in draft.envRows"
                  :key="row.id"
                  class="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
                >
                  <Input
                    v-model="row.key"
                    :placeholder="t('settings.mcpServer.form.keyPlaceholder')"
                  />
                  <Input
                    v-model="row.value"
                    type="password"
                    :placeholder="t('settings.mcpServer.form.valuePlaceholder')"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    @click="emit('removeRow', 'env', row.id)"
                  >
                    {{ t('settings.mcpServer.form.removeRowButton') }}
                  </Button>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  class="self-start"
                  @click="emit('addRow', 'env')"
                >
                  <PlusIcon data-icon="inline-start" />
                  {{ t('settings.mcpServer.form.addEnvVarButton') }}
                </Button>
              </div>
            </Field>
          </template>

          <template v-else>
            <Field :data-invalid="formErrors.url ? '' : undefined">
              <FieldLabel for="mcp-url">{{ t('settings.mcpServer.form.urlLabel') }}</FieldLabel>
              <Input
                id="mcp-url"
                v-model="draft.url"
                :aria-invalid="Boolean(formErrors.url)"
                :placeholder="t('settings.mcpServer.form.urlPlaceholder')"
              />
              <FieldError :errors="[formErrors.url]" />
            </Field>

            <Field>
              <FieldLabel>{{ t('settings.mcpServer.form.headersLabel') }}</FieldLabel>
              <FieldDescription v-if="existingSecretKeys.length">
                {{ t('settings.mcpServer.form.envVarsSavedKeysPrefix') }}{{ existingSecretKeys.join(', ') }}{{ t('settings.mcpServer.form.envVarsSavedKeysSuffix') }}
              </FieldDescription>
              <div class="flex flex-col gap-2">
                <div
                  v-for="row in draft.headerRows"
                  :key="row.id"
                  class="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
                >
                  <Input
                    v-model="row.key"
                    :placeholder="t('settings.mcpServer.form.headerKeyPlaceholder')"
                  />
                  <Input
                    v-model="row.value"
                    type="password"
                    :placeholder="t('settings.mcpServer.form.headerValuePlaceholder')"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    @click="emit('removeRow', 'header', row.id)"
                  >
                    {{ t('settings.mcpServer.form.removeRowButton') }}
                  </Button>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  class="self-start"
                  @click="emit('addRow', 'header')"
                >
                  <PlusIcon data-icon="inline-start" />
                  {{ t('settings.mcpServer.form.addHeaderButton') }}
                </Button>
              </div>
            </Field>
          </template>
        </FieldGroup>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            :disabled="saving"
            @click="emit('close')"
          >
            {{ t('settings.mcpServer.form.cancelButton') }}
          </Button>
          <Button
            type="submit"
            :disabled="saving || disabled"
          >
            <RefreshCwIcon
              v-if="saving"
              data-icon="inline-start"
              class="animate-spin"
            />
            {{ t('settings.mcpServer.form.submitButton') }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>

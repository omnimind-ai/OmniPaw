<script setup lang="ts">
import { PlusIcon, RefreshCwIcon } from 'lucide-vue-next'

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
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{{ editing ? '编辑 MCP 服务器' : '添加 MCP 服务器' }}</DialogTitle>
        <DialogDescription>
          保存请求只提交当前输入的环境变量或请求头值，已存在的秘密值不会在此处显示。
        </DialogDescription>
      </DialogHeader>

      <form
        class="flex flex-col gap-4"
        @submit.prevent="emit('submit')"
      >
        <FieldGroup>
          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field :data-invalid="formErrors.name ? '' : undefined">
              <FieldLabel for="mcp-server-name">名称</FieldLabel>
              <Input
                id="mcp-server-name"
                v-model="draft.name"
                :aria-invalid="Boolean(formErrors.name)"
                placeholder="Context7"
              />
              <FieldError :errors="[formErrors.name]" />
            </Field>

            <Field>
              <FieldLabel for="mcp-server-id">服务器 ID</FieldLabel>
              <Input
                id="mcp-server-id"
                :model-value="draft.id || '保存时自动生成'"
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
              aria-label="启用 MCP 服务器"
            />
            <FieldContent>
              <FieldLabel for="mcp-server-enabled">启用服务器</FieldLabel>
              <FieldDescription>启用后会参与发现，失败的服务器不会进入聊天工具列表。</FieldDescription>
            </FieldContent>
          </Field>

          <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field>
              <FieldLabel for="mcp-transport-type">连接类型</FieldLabel>
              <Select v-model="draft.transportType">
                <SelectTrigger
                  id="mcp-transport-type"
                  class="w-full"
                >
                  <SelectValue placeholder="选择连接类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="stdio">本地命令</SelectItem>
                    <SelectItem value="http">HTTP</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <Field :data-invalid="formErrors.timeoutMs ? '' : undefined">
              <FieldLabel for="mcp-timeout-ms">连接超时 ms</FieldLabel>
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
              <FieldLabel for="mcp-tool-timeout-ms">工具超时 ms</FieldLabel>
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
              <FieldLabel for="mcp-command">启动命令</FieldLabel>
              <Input
                id="mcp-command"
                v-model="draft.command"
                :aria-invalid="Boolean(formErrors.command)"
                placeholder="npx"
              />
              <FieldError :errors="[formErrors.command]" />
            </Field>

            <Field>
              <FieldLabel for="mcp-args">参数</FieldLabel>
              <Textarea
                id="mcp-args"
                v-model="draft.argsText"
                placeholder="-y&#10;@modelcontextprotocol/server-filesystem"
              />
              <FieldDescription>每行一个参数。</FieldDescription>
            </Field>

            <Field>
              <FieldLabel for="mcp-cwd">工作目录</FieldLabel>
              <Input
                id="mcp-cwd"
                v-model="draft.cwd"
                placeholder="留空使用默认工作目录"
              />
            </Field>

            <Field>
              <FieldLabel>环境变量</FieldLabel>
              <FieldDescription v-if="existingSecretKeys.length">
                已保存的键：{{ existingSecretKeys.join(', ') }}。值已隐藏，填写同名键可更新。
              </FieldDescription>
              <div class="flex flex-col gap-2">
                <div
                  v-for="row in draft.envRows"
                  :key="row.id"
                  class="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
                >
                  <Input
                    v-model="row.key"
                    placeholder="KEY"
                  />
                  <Input
                    v-model="row.value"
                    type="password"
                    placeholder="VALUE"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    @click="emit('removeRow', 'env', row.id)"
                  >
                    删除
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
                  添加环境变量
                </Button>
              </div>
            </Field>
          </template>

          <template v-else>
            <Field :data-invalid="formErrors.url ? '' : undefined">
              <FieldLabel for="mcp-url">服务器地址</FieldLabel>
              <Input
                id="mcp-url"
                v-model="draft.url"
                :aria-invalid="Boolean(formErrors.url)"
                placeholder="http://localhost:3000/mcp"
              />
              <FieldError :errors="[formErrors.url]" />
            </Field>

            <Field>
              <FieldLabel>请求头</FieldLabel>
              <FieldDescription v-if="existingSecretKeys.length">
                已保存的键：{{ existingSecretKeys.join(', ') }}。值已隐藏，填写同名键可更新。
              </FieldDescription>
              <div class="flex flex-col gap-2">
                <div
                  v-for="row in draft.headerRows"
                  :key="row.id"
                  class="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
                >
                  <Input
                    v-model="row.key"
                    placeholder="Authorization"
                  />
                  <Input
                    v-model="row.value"
                    type="password"
                    placeholder="Bearer ..."
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    @click="emit('removeRow', 'header', row.id)"
                  >
                    删除
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
                  添加请求头
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
            取消
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
            保存
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>

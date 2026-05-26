<script setup lang="ts">
import { CheckCircle2Icon, PlusIcon, StarIcon, Trash2Icon, UserIcon } from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'

import type { BridgePersonaProfile, BridgePersonaProfileDraft } from '@/bridge/app'
import SettingsSection from '@/components/settings/SettingsSection.vue'
import { Badge } from '@/components/ui/badge'
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
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useDelayedFlag } from '@/composables/useDelayedFlag'
import { cn } from '@/lib/utils'
import { usePersonaStore } from '@/stores/persona'
import { errorToText, useToast } from '@/utils/toast'

const personaStore = usePersonaStore()
const toast = useToast()

interface DraftState {
  id?: string
  name: string
  description: string
  prompt: string
}

const profiles = computed(() => personaStore.profiles)
const activePersonaId = computed(() => personaStore.activePersonaId)
const recoveryError = computed(() => personaStore.recoveryError)
const persistenceAvailable = computed(() => personaStore.persistenceAvailable)
const isEmpty = computed(() => personaStore.isEmpty)
const showLoadingSkeleton = useDelayedFlag(
  () => personaStore.loading && profiles.value.length === 0
)

const editingId = ref<string | undefined>()
const draftOpen = ref(false)
const draft = reactive<DraftState>(createEmptyDraft())
const validationError = ref('')
const pendingId = ref('')
const deleteTarget = ref<BridgePersonaProfile | null>(null)
const deleteOpen = ref(false)

const isEditing = computed(() => Boolean(editingId.value))
const isSaving = computed(() => personaStore.saving)

onMounted(async () => {
  try {
    await personaStore.load()
  } catch (error) {
    toast.error(errorToText(error, '人格加载失败。'))
  }
})

onBeforeUnmount(() => {
  personaStore.stopSubscription()
})

function createEmptyDraft(): DraftState {
  return {
    id: undefined,
    name: '',
    description: '',
    prompt: '',
  }
}

function resetDraft(): void {
  Object.assign(draft, createEmptyDraft())
  editingId.value = undefined
  validationError.value = ''
}

function openCreateDraft(): void {
  resetDraft()
  draftOpen.value = true
}

function openEditDraft(profile: BridgePersonaProfile): void {
  editingId.value = profile.id
  draft.id = profile.id
  draft.name = profile.name
  draft.description = profile.description ?? ''
  draft.prompt = profile.prompt
  validationError.value = ''
  draftOpen.value = true
}

function handleDraftOpenChange(value: boolean): void {
  if (isSaving.value && !value) return
  draftOpen.value = value
  if (!value) {
    resetDraft()
  }
}

function cancelDraft(): void {
  if (isSaving.value) return
  draftOpen.value = false
  resetDraft()
}

function validate(): string {
  if (!draft.name.trim()) return '请填写人格名称。'
  if (!draft.prompt.trim()) return '请填写人格提示词。'
  return ''
}

async function saveDraft(): Promise<void> {
  const validation = validate()
  if (validation) {
    validationError.value = validation
    return
  }
  validationError.value = ''

  const payload: BridgePersonaProfileDraft = {
    name: draft.name.trim(),
    description: draft.description.trim() || undefined,
    prompt: draft.prompt,
  }

  try {
    if (editingId.value) {
      pendingId.value = editingId.value
      await personaStore.updateProfile(editingId.value, payload)
      toast.success('人格已更新。')
    } else {
      await personaStore.createProfile(payload)
      toast.success('人格已创建。')
    }
    draftOpen.value = false
    resetDraft()
  } catch (error) {
    toast.error(errorToText(error, '人格保存失败。'))
  } finally {
    pendingId.value = ''
  }
}

async function activatePersona(profile: BridgePersonaProfile): Promise<void> {
  pendingId.value = profile.id
  try {
    await personaStore.setActivePersona(profile.id)
    toast.success(`已启用人格 "${profile.name}"。`)
  } catch (error) {
    toast.error(errorToText(error, '启用人格失败。'))
  } finally {
    pendingId.value = ''
  }
}

async function deactivatePersona(): Promise<void> {
  if (!activePersonaId.value) return
  pendingId.value = 'clear-default'
  try {
    await personaStore.setActivePersona(undefined)
    toast.success('已停用人格。')
  } catch (error) {
    toast.error(errorToText(error, '停用人格失败。'))
  } finally {
    pendingId.value = ''
  }
}

function openDeleteDialog(profile: BridgePersonaProfile): void {
  deleteTarget.value = profile
  deleteOpen.value = true
}

function handleDeleteOpenChange(value: boolean): void {
  if (pendingId.value && !value) return
  deleteOpen.value = value
  if (!value) {
    deleteTarget.value = null
  }
}

async function confirmDelete(): Promise<void> {
  const profile = deleteTarget.value
  if (!profile) return

  pendingId.value = profile.id
  try {
    await personaStore.deleteProfile(profile.id)
    toast.success('人格已删除。')
    if (editingId.value === profile.id) {
      draftOpen.value = false
      resetDraft()
    }
    deleteOpen.value = false
    deleteTarget.value = null
  } catch (error) {
    toast.error(errorToText(error, '人格删除失败。'))
  } finally {
    pendingId.value = ''
  }
}

function profileIsPending(profile: BridgePersonaProfile): boolean {
  return pendingId.value === profile.id
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <SettingsSection
      title="人格"
      description="管理对话使用的人格 profile。当前启用的人格会应用到新会话。"
    >
      <template #actions>
        <Button
          type="button"
          size="sm"
          :disabled="!persistenceAvailable || isSaving"
          @click="openCreateDraft"
        >
          <PlusIcon data-icon="inline-start" />
          新建人格
        </Button>
      </template>

      <div class="flex flex-col gap-3 p-4">
        <div
          v-if="!persistenceAvailable"
          class="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900"
        >
          当前未连接 Electron 主进程，人格无法保存。
        </div>

        <div
          v-if="recoveryError"
          class="rounded-md border border-destructive bg-destructive/5 px-3 py-2 text-xs text-destructive"
        >
          人格注册表加载错误：{{ recoveryError.message }}
        </div>

        <div
          v-if="showLoadingSkeleton"
          class="flex flex-col gap-2"
        >
          <Skeleton class="h-16 w-full" />
          <Skeleton class="h-16 w-full" />
        </div>

        <div
          v-else-if="isEmpty"
          class="flex flex-col items-center justify-center gap-2 py-8 text-sm text-muted-foreground"
        >
          <UserIcon class="size-8 opacity-50" />
          <p>尚未创建任何人格。</p>
          <Button
            v-if="persistenceAvailable"
            type="button"
            variant="outline"
            size="sm"
            @click="openCreateDraft"
          >
            <PlusIcon data-icon="inline-start" />
            创建第一个人格
          </Button>
        </div>

        <ul
          v-else
          class="flex flex-col divide-y rounded-md border"
        >
          <li
            v-for="profile in profiles"
            :key="profile.id"
            :class="cn('flex flex-col gap-2 px-4 py-3', profileIsPending(profile) && 'opacity-60')"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="flex flex-col gap-0.5">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="text-sm font-medium">{{ profile.name }}</span>
                  <Badge
                    v-if="activePersonaId === profile.id"
                    variant="default"
                  >
                    当前启用
                  </Badge>
                </div>
                <p
                  v-if="profile.description"
                  class="line-clamp-2 text-xs text-muted-foreground"
                >
                  {{ profile.description }}
                </p>
              </div>
              <div class="flex items-center gap-1">
                <Button
                  v-if="activePersonaId !== profile.id"
                  type="button"
                  variant="ghost"
                  size="sm"
                  :disabled="!persistenceAvailable || profileIsPending(profile)"
                  aria-label="启用人格"
                  @click="activatePersona(profile)"
                >
                  <StarIcon data-icon="inline-start" />
                  启用
                </Button>
                <Button
                  v-else
                  type="button"
                  variant="ghost"
                  size="sm"
                  :disabled="!persistenceAvailable || pendingId === 'clear-default'"
                  aria-label="停用人格"
                  @click="deactivatePersona"
                >
                  <CheckCircle2Icon data-icon="inline-start" />
                  停用
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  :disabled="!persistenceAvailable || profileIsPending(profile)"
                  @click="openEditDraft(profile)"
                >
                  编辑
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  :disabled="!persistenceAvailable || profileIsPending(profile)"
                  aria-label="删除"
                  @click="openDeleteDialog(profile)"
                >
                  <Trash2Icon data-icon />
                </Button>
              </div>
            </div>
          </li>
        </ul>
      </div>
    </SettingsSection>

    <Dialog
      :open="draftOpen"
      @update:open="handleDraftOpenChange"
    >
      <DialogContent class="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{{ isEditing ? '编辑人格' : '新建人格' }}</DialogTitle>
          <DialogDescription>
            当前启用的人格 prompt 仅作为对话头部上下文注入，不会写入聊天消息、日志或请求快照。
          </DialogDescription>
        </DialogHeader>

        <form
          class="flex flex-col gap-4"
          @submit.prevent="saveDraft"
        >
          <FieldGroup class="gap-4">
            <Field>
              <FieldLabel>名称</FieldLabel>
              <FieldContent>
                <Input
                  v-model="draft.name"
                  placeholder="如：温暖小助手"
                  :disabled="isSaving"
                />
              </FieldContent>
            </Field>

            <Field>
              <FieldLabel>描述（可选）</FieldLabel>
              <FieldContent>
                <Input
                  v-model="draft.description"
                  placeholder="对人格特征的简短说明"
                  :disabled="isSaving"
                />
              </FieldContent>
            </Field>

            <Field>
              <FieldLabel>人格 Prompt</FieldLabel>
              <FieldContent>
                <Textarea
                  v-model="draft.prompt"
                  rows="8"
                  placeholder="例如：你是一个温暖、耐心的助手……"
                  :disabled="isSaving"
                />
                <FieldDescription>
                  此 prompt 仅作为对话头部上下文，不会写入聊天消息或日志。
                </FieldDescription>
              </FieldContent>
            </Field>

            <p
              v-if="validationError"
              class="text-xs text-destructive"
            >
              {{ validationError }}
            </p>
          </FieldGroup>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              :disabled="isSaving"
              @click="cancelDraft"
            >
              取消
            </Button>
            <Button
              type="submit"
              :disabled="!persistenceAvailable || isSaving"
            >
              {{ isEditing ? '保存修改' : '创建人格' }}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog
      :open="deleteOpen"
      @update:open="handleDeleteOpenChange"
    >
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>删除人格</DialogTitle>
          <DialogDescription>
            确认要删除人格 “{{ deleteTarget?.name ?? '' }}” 吗？该操作不可撤销，已应用此人格的会话快照不会改变。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            :disabled="Boolean(pendingId)"
            @click="handleDeleteOpenChange(false)"
          >
            取消
          </Button>
          <Button
            type="button"
            variant="destructive"
            :disabled="Boolean(pendingId)"
            @click="confirmDelete"
          >
            删除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import {
  CheckCircle2Icon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  StarIcon,
  Trash2Icon,
  UserIcon,
  XIcon,
} from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'

import type { BridgePersonaProfile, BridgePersonaProfileDraft } from '@/bridge/app'
import SettingsPanelHeader from '@/components/settings/common/SettingsPanelHeader.vue'
import SettingsPanelItem from '@/components/settings/common/SettingsPanelItem.vue'
import SettingsSearchBar from '@/components/settings/common/SettingsSearchBar.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
const searchQuery = ref('')
const deleteTarget = ref<BridgePersonaProfile | null>(null)
const deleteOpen = ref(false)

const isEditing = computed(() => Boolean(editingId.value))
const isSaving = computed(() => personaStore.saving)
const profileSummary = computed(() => `${profiles.value.length} 个人格`)
const filteredProfiles = computed(() => {
  const query = normalizeSearchText(searchQuery.value)
  if (!query) return profiles.value
  return profiles.value.filter((profile) => {
    const searchable = `${profile.name} ${profile.description ?? ''}`
    return normalizeSearchText(searchable).includes(query)
  })
})
const searchEmpty = computed(() => !isEmpty.value && filteredProfiles.value.length === 0)

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

function normalizeSearchText(value: string): string {
  return value.trim().toLocaleLowerCase()
}

function clearSearch(): void {
  searchQuery.value = ''
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
  <div class="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
    <Card class="grid h-full min-h-0 flex-1 grid-rows-[auto_auto_minmax(0,1fr)] gap-0 rounded-md border border-border py-0 ring-0">
      <SettingsPanelHeader
        title="人格"
        :icon="UserIcon"
      >
        <template #description>
          管理对话使用的人格 profile。当前启用的人格会应用到新会话。
        </template>
      </SettingsPanelHeader>

      <SettingsSearchBar
        v-model="searchQuery"
        class="border-b-0"
        label="搜索人格"
        placeholder="搜索人格名称或描述"
        clear-label="清除人格搜索"
      >
        <template #summary>
          <Badge variant="secondary">
            {{ profileSummary }}
          </Badge>
        </template>

        <template #actions>
          <Button
            type="button"
            :disabled="!persistenceAvailable || isSaving"
            @click="openCreateDraft"
          >
            <PlusIcon data-icon="inline-start" />
            新建人格
          </Button>
        </template>
      </SettingsSearchBar>

      <CardContent class="flex min-h-0 flex-1 flex-col overflow-y-auto p-0">
        <div class="flex min-h-full flex-1 flex-col">
          <div
            v-if="!persistenceAvailable"
            class="shrink-0 border-b px-4 py-3 text-sm text-muted-foreground sm:px-5"
          >
            当前未连接 Electron 主进程，人格无法保存。
          </div>

          <div
            v-if="recoveryError"
            class="shrink-0 border-b px-4 py-3 sm:px-5"
          >
            <div class="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              人格注册表加载错误：{{ recoveryError.message }}
            </div>
          </div>

          <div
            v-if="showLoadingSkeleton"
            class="flex shrink-0 flex-col gap-3 px-4 py-4 sm:px-5"
          >
            <Skeleton class="h-24 w-full" />
            <Skeleton class="h-24 w-full" />
          </div>

          <div
            v-else-if="isEmpty"
            class="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-10 text-center text-sm text-muted-foreground sm:px-5"
          >
            <UserIcon class="size-8 opacity-50" />
            <div class="flex flex-col gap-1">
              <p class="font-medium text-foreground">尚未创建任何人格。</p>
              <p>创建后可在新会话中启用不同的系统上下文。</p>
            </div>
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

          <div
            v-else-if="searchEmpty"
            class="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-10 text-center text-sm text-muted-foreground sm:px-5"
          >
            <SearchIcon class="size-8 opacity-50" />
            <div class="flex flex-col gap-1">
              <p class="font-medium text-foreground">没有匹配的人格。</p>
              <p>换一个名称或描述关键词试试。</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              @click="clearSearch"
            >
              <XIcon data-icon="inline-start" />
              清除搜索
            </Button>
          </div>

          <div
            v-else
            class="flex flex-1 flex-col gap-3 px-4 py-4 sm:px-5"
          >
            <SettingsPanelItem
              v-for="profile in filteredProfiles"
              :key="profile.id"
              :title="profile.name"
              :description="profile.description || '未提供描述。'"
              :icon="UserIcon"
              :pending="profileIsPending(profile)"
            >
              <template #badges>
                <Badge
                  v-if="activePersonaId === profile.id"
                  variant="default"
                >
                  当前启用
                </Badge>
              </template>

              <template #actions>
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
                  <PencilIcon data-icon="inline-start" />
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
              </template>
            </SettingsPanelItem>
          </div>
        </div>
      </CardContent>
    </Card>

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

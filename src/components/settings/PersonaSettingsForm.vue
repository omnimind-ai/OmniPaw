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
import { useI18n } from 'vue-i18n'

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
const { t } = useI18n()

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
const profileSummary = computed(
  () => `${profiles.value.length} ${t('settings.persona.summaryCount')}`
)
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
    toast.error(errorToText(error, t('settings.persona.loadErrorToast')))
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
  if (!draft.name.trim()) return t('settings.persona.dialogCreate.validationNameRequired')
  if (!draft.prompt.trim()) return t('settings.persona.dialogCreate.validationPromptRequired')
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
      toast.success(t('settings.persona.dialogCreate.updateSuccessToast'))
    } else {
      await personaStore.createProfile(payload)
      toast.success(t('settings.persona.dialogCreate.createSuccessToast'))
    }
    draftOpen.value = false
    resetDraft()
  } catch (error) {
    toast.error(errorToText(error, t('settings.persona.dialogCreate.saveErrorToast')))
  } finally {
    pendingId.value = ''
  }
}

async function activatePersona(profile: BridgePersonaProfile): Promise<void> {
  pendingId.value = profile.id
  try {
    await personaStore.setActivePersona(profile.id)
    toast.success(t('settings.persona.activateSuccessToast', { name: profile.name }))
  } catch (error) {
    toast.error(errorToText(error, t('settings.persona.activateErrorToast')))
  } finally {
    pendingId.value = ''
  }
}

async function deactivatePersona(): Promise<void> {
  if (!activePersonaId.value) return
  pendingId.value = 'clear-default'
  try {
    await personaStore.setActivePersona(undefined)
    toast.success(t('settings.persona.deactivateSuccessToast'))
  } catch (error) {
    toast.error(errorToText(error, t('settings.persona.deactivateErrorToast')))
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
    toast.success(t('settings.persona.dialogDelete.deleteSuccessToast'))
    if (editingId.value === profile.id) {
      draftOpen.value = false
      resetDraft()
    }
    deleteOpen.value = false
    deleteTarget.value = null
  } catch (error) {
    toast.error(errorToText(error, t('settings.persona.dialogDelete.deleteErrorToast')))
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
        :title="t('settings.persona.title')"
        :icon="UserIcon"
      >
        <template #description>
          {{ t('settings.persona.description') }}
        </template>
      </SettingsPanelHeader>

      <SettingsSearchBar
        v-model="searchQuery"
        class="border-b-0"
        :label="t('settings.persona.searchLabel')"
        :placeholder="t('settings.persona.searchPlaceholder')"
        :clear-label="t('settings.persona.searchClearLabel')"
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
            {{ t('settings.persona.createButton') }}
          </Button>
        </template>
      </SettingsSearchBar>

      <CardContent class="flex min-h-0 flex-1 flex-col overflow-y-auto p-0">
        <div class="flex min-h-full flex-1 flex-col">
          <div
            v-if="!persistenceAvailable"
            class="shrink-0 border-b px-4 py-3 text-sm text-muted-foreground sm:px-5"
          >
            {{ t('settings.persona.persistenceUnavailable') }}
          </div>

          <div
            v-if="recoveryError"
            class="shrink-0 border-b px-4 py-3 sm:px-5"
          >
            <div class="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {{ t('settings.persona.recoveryError', { message: recoveryError.message }) }}
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
              <p class="font-medium text-foreground">{{ t('settings.persona.noPersonasTitle') }}</p>
              <p>{{ t('settings.persona.noPersonasDesc') }}</p>
            </div>
            <Button
              v-if="persistenceAvailable"
              type="button"
              variant="outline"
              size="sm"
              @click="openCreateDraft"
            >
              <PlusIcon data-icon="inline-start" />
              {{ t('settings.persona.firstCreateButton') }}
            </Button>
          </div>

          <div
            v-else-if="searchEmpty"
            class="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-10 text-center text-sm text-muted-foreground sm:px-5"
          >
            <SearchIcon class="size-8 opacity-50" />
            <div class="flex flex-col gap-1">
              <p class="font-medium text-foreground">{{ t('settings.persona.noMatchTitle') }}</p>
              <p>{{ t('settings.persona.noMatchDesc') }}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              @click="clearSearch"
            >
              <XIcon data-icon="inline-start" />
              {{ t('settings.persona.clearSearchButton') }}
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
              :description="profile.description || t('settings.persona.noDescriptionProvided')"
              :icon="UserIcon"
              :pending="profileIsPending(profile)"
            >
              <template #badges>
                <Badge
                  v-if="activePersonaId === profile.id"
                  variant="default"
                >
                  {{ t('settings.persona.currentlyEnabled') }}
                </Badge>
              </template>

              <template #actions>
                <Button
                  v-if="activePersonaId !== profile.id"
                  type="button"
                  variant="ghost"
                  size="sm"
                  :disabled="!persistenceAvailable || profileIsPending(profile)"
                  :aria-label="t('settings.persona.activateAriaLabel')"
                  @click="activatePersona(profile)"
                >
                  <StarIcon data-icon="inline-start" />
                  {{ t('settings.persona.activateButton') }}
                </Button>
                <Button
                  v-else
                  type="button"
                  variant="ghost"
                  size="sm"
                  :disabled="!persistenceAvailable || pendingId === 'clear-default'"
                  :aria-label="t('settings.persona.deactivateAriaLabel')"
                  @click="deactivatePersona"
                >
                  <CheckCircle2Icon data-icon="inline-start" />
                  {{ t('settings.persona.deactivateButton') }}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  :disabled="!persistenceAvailable || profileIsPending(profile)"
                  @click="openEditDraft(profile)"
                >
                  <PencilIcon data-icon="inline-start" />
                  {{ t('settings.persona.editButton') }}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  :disabled="!persistenceAvailable || profileIsPending(profile)"
                  :aria-label="t('settings.persona.deleteAriaLabel')"
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
          <DialogTitle>{{ isEditing ? t('settings.persona.dialogCreate.editTitle') : t('settings.persona.dialogCreate.title') }}</DialogTitle>
          <DialogDescription>
            {{ t('settings.persona.dialogCreate.description') }}
          </DialogDescription>
        </DialogHeader>

        <form
          class="flex flex-col gap-4"
          @submit.prevent="saveDraft"
        >
          <FieldGroup class="gap-4">
            <Field>
              <FieldLabel>{{ t('settings.persona.dialogCreate.nameLabel') }}</FieldLabel>
              <FieldContent>
                <Input
                  v-model="draft.name"
                  :placeholder="t('settings.persona.dialogCreate.namePlaceholder')"
                  :disabled="isSaving"
                />
              </FieldContent>
            </Field>

            <Field>
              <FieldLabel>{{ t('settings.persona.dialogCreate.descriptionLabel') }}</FieldLabel>
              <FieldContent>
                <Input
                  v-model="draft.description"
                  :placeholder="t('settings.persona.dialogCreate.descriptionPlaceholder')"
                  :disabled="isSaving"
                />
              </FieldContent>
            </Field>

            <Field>
              <FieldLabel>{{ t('settings.persona.dialogCreate.promptLabel') }}</FieldLabel>
              <FieldContent>
                <Textarea
                  v-model="draft.prompt"
                  rows="8"
                  :placeholder="t('settings.persona.dialogCreate.promptPlaceholder')"
                  :disabled="isSaving"
                />
                <FieldDescription>
                  {{ t('settings.persona.dialogCreate.promptHelp') }}
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
              {{ t('settings.persona.dialogCreate.cancelButton') }}
            </Button>
            <Button
              type="submit"
              :disabled="!persistenceAvailable || isSaving"
            >
              {{ isEditing ? t('settings.persona.dialogCreate.submitEditButton') : t('settings.persona.dialogCreate.submitButton') }}
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
          <DialogTitle>{{ t('settings.persona.dialogDelete.title') }}</DialogTitle>
          <DialogDescription>
            {{ t('settings.persona.dialogDelete.description', { name: deleteTarget?.name ?? '' }) }}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            :disabled="Boolean(pendingId)"
            @click="handleDeleteOpenChange(false)"
          >
            {{ t('settings.persona.dialogDelete.cancelButton') }}
          </Button>
          <Button
            type="button"
            variant="destructive"
            :disabled="Boolean(pendingId)"
            @click="confirmDelete"
          >
            {{ t('settings.persona.dialogDelete.deleteButton') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

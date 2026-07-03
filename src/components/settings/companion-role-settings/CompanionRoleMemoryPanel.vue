<script setup lang="ts">
import type {
  CompanionMemoryItem,
  CompanionMemoryScope,
  CompanionMemoryStatus,
  CreateCompanionMemoryRequest,
  UpdateCompanionMemoryRequest,
} from '@shared/types/memory'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import MemoryCreateModal from '@/components/settings/memory-settings/MemoryCreateModal.vue'
import MemoryDetailModal from '@/components/settings/memory-settings/MemoryDetailModal.vue'
import MemoryList from '@/components/settings/memory-settings/MemoryList.vue'
import { useDelayedFlag } from '@/composables/useDelayedFlag'
import { useMemoryStore } from '@/stores/memory'
import { errorToText, useToast } from '@/utils/toast'

const props = defineProps<{
  roleId: string
  roleName: string
}>()

const { t } = useI18n()
const toast = useToast()
const memoryStore = useMemoryStore()
const { items, selected, loading, saving, total } = storeToRefs(memoryStore)

const characterScopes: CompanionMemoryScope[] = ['character']
const searchQuery = ref('')
const includeInactive = ref(false)
const createModalOpen = ref(false)
const detailModalOpen = ref(false)
const detailLoading = ref(false)
const confirmDeleteMemoryId = ref<string | undefined>()

const selectedMemory = computed(() => selected.value?.memory)
const selectedSources = computed(() => selected.value?.sources ?? [])
const selectedLinks = computed(() => selected.value?.links ?? [])
const selectedProposals = computed(() => selected.value?.proposals ?? [])
const showMemoryListSkeleton = useDelayedFlag(() => loading.value)

watch(
  () => props.roleId,
  () => {
    selected.value = null
    detailModalOpen.value = false
    confirmDeleteMemoryId.value = undefined
    void reload()
  },
  { immediate: true }
)

watch(detailModalOpen, (isOpen) => {
  if (!isOpen) {
    selected.value = null
  }
})

async function reload(): Promise<void> {
  if (!props.roleId) return
  try {
    const filters = {
      query: searchQuery.value.trim() || undefined,
      includeInactive: includeInactive.value,
      scopes: characterScopes,
      characterId: props.roleId,
      limit: 100,
    }
    if (filters.query) {
      await memoryStore.search(filters)
    } else {
      await memoryStore.load(filters)
    }
  } catch (error) {
    toast.error(errorToText(error, t('settings.memory.toast.listLoadFailed')))
  }
}

function openCreateMemory(): void {
  confirmDeleteMemoryId.value = undefined
  createModalOpen.value = true
}

async function openMemoryDetail(memory: CompanionMemoryItem): Promise<void> {
  confirmDeleteMemoryId.value = undefined
  detailModalOpen.value = true
  await inspectMemory(memory.id)
}

async function submitCreateMemory(request: CreateCompanionMemoryRequest): Promise<void> {
  try {
    const memory = await memoryStore.create({
      ...request,
      scope: 'character',
      characterId: props.roleId,
    })
    createModalOpen.value = false
    await reload()
    detailModalOpen.value = true
    await inspectMemory(memory.id)
    toast.success(t('settings.memory.toast.created'))
  } catch (error) {
    toast.error(errorToText(error, t('settings.memory.toast.createFailed')))
  }
}

async function submitMemoryUpdate(request: UpdateCompanionMemoryRequest): Promise<void> {
  try {
    const updated = await memoryStore.update({
      ...request,
      scope: 'character',
      characterId: props.roleId,
    })
    if (updated) {
      await reload()
      await inspectMemory(updated.id)
      toast.success(t('settings.memory.toast.saved'))
    }
  } catch (error) {
    toast.error(errorToText(error, t('settings.memory.toast.saveFailed')))
  }
}

async function setMemoryEnabled(memory: CompanionMemoryItem, enabled: boolean): Promise<void> {
  await updateMemoryStatus(
    memory,
    enabled ? 'active' : 'disabled',
    t('settings.memory.toast.statusUpdateFailed')
  )
}

async function archiveMemory(memory: CompanionMemoryItem): Promise<void> {
  await updateMemoryStatus(
    memory,
    'archived',
    t('settings.memory.toast.archiveFailed'),
    t('settings.memory.toast.archived')
  )
}

async function updateMemoryStatus(
  memory: CompanionMemoryItem,
  status: CompanionMemoryStatus,
  fallbackError: string,
  successMessage?: string
): Promise<void> {
  confirmDeleteMemoryId.value = undefined
  try {
    const updated = await memoryStore.update({ memoryId: memory.id, status })
    await reload()
    if (updated && selectedMemory.value?.id === memory.id) {
      await inspectMemory(memory.id)
    }
    if (successMessage) {
      toast.success(successMessage)
    }
  } catch (error) {
    toast.error(errorToText(error, fallbackError))
  }
}

async function setImportance(memory: CompanionMemoryItem, delta: number): Promise<void> {
  confirmDeleteMemoryId.value = undefined
  const importance = clampInteger(memory.importance + delta, 1, 5)
  try {
    const updated = await memoryStore.setImportance(memory.id, importance)
    await reload()
    if (updated && selectedMemory.value?.id === memory.id) {
      await inspectMemory(memory.id)
    }
  } catch (error) {
    toast.error(errorToText(error, t('settings.memory.toast.importanceFailed')))
  }
}

async function deleteMemory(memory: CompanionMemoryItem): Promise<void> {
  if (confirmDeleteMemoryId.value !== memory.id) {
    confirmDeleteMemoryId.value = memory.id
    return
  }

  try {
    await memoryStore.deleteMemory(memory.id)
    confirmDeleteMemoryId.value = undefined
    if (selectedMemory.value?.id === memory.id) {
      detailModalOpen.value = false
      selected.value = null
    }
    await reload()
    toast.success(t('settings.memory.toast.deleted'))
  } catch (error) {
    toast.error(errorToText(error, t('settings.memory.toast.deleteFailed')))
  }
}

async function inspectMemory(memoryId: string): Promise<void> {
  detailLoading.value = true
  try {
    await memoryStore.inspect(memoryId)
  } catch (error) {
    toast.error(errorToText(error, t('settings.memory.toast.detailLoadFailed')))
  } finally {
    detailLoading.value = false
  }
}

function toggleIncludeInactive(): void {
  includeInactive.value = !includeInactive.value
  void reload()
}

function clampInteger(value: string | number, min: number, max: number): number {
  const next = Math.round(Number(value))
  if (!Number.isFinite(next)) return min
  return Math.min(max, Math.max(min, next))
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-1 flex-col overflow-hidden p-4 sm:p-5">
    <MemoryList
      v-model:search-query="searchQuery"
      class="min-h-0 flex-1"
      :items="items"
      :total="total"
      :loading="loading"
      :saving="saving"
      :show-skeleton="showMemoryListSkeleton"
      :include-inactive="includeInactive"
      :confirm-delete-memory-id="confirmDeleteMemoryId"
      :title="t('settings.memory.rolePanelTitle', { name: roleName })"
      :description="t('settings.memory.rolePanelDescription')"
      :empty-title="t('settings.memory.roleEmptyTitle')"
      :empty-hint="t('settings.memory.roleEmptyHint')"
      :show-policy="false"
      @create="openCreateMemory"
      @detail="openMemoryDetail"
      @refresh="reload"
      @clear-search="reload"
      @toggle-inactive="toggleIncludeInactive"
      @enable="setMemoryEnabled"
      @archive="archiveMemory"
      @importance="setImportance"
      @delete="deleteMemory"
    />

    <MemoryCreateModal
      v-model:open="createModalOpen"
      :saving="saving"
      scope="character"
      :character-id="roleId"
      :title="t('settings.memory.createModal.roleTitle')"
      :description="t('settings.memory.createModal.roleDescription')"
      :content-placeholder="t('settings.memory.createModal.roleContentPlaceholder')"
      @submit="submitCreateMemory"
    />

    <MemoryDetailModal
      v-model:open="detailModalOpen"
      :memory="selectedMemory"
      :sources="selectedSources"
      :links="selectedLinks"
      :proposals="selectedProposals"
      :loading="detailLoading"
      :saving="saving"
      @submit="submitMemoryUpdate"
    />
  </div>
</template>

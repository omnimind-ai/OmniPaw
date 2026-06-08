<script setup lang="ts">
import type {
  CompanionMemoryItem,
  CompanionMemoryStatus,
  CreateCompanionMemoryRequest,
  UpdateCompanionMemoryRequest,
} from '@shared/types/memory'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import type { BridgeDesktopSettingsConfig } from '@/bridge/app'
import MemoryCreateModal from '@/components/settings/memory-settings/MemoryCreateModal.vue'
import MemoryDetailModal from '@/components/settings/memory-settings/MemoryDetailModal.vue'
import MemoryList from '@/components/settings/memory-settings/MemoryList.vue'
import MemoryPolicyModal from '@/components/settings/memory-settings/MemoryPolicyModal.vue'
import { useDelayedFlag } from '@/composables/useDelayedFlag'
import { useMemoryStore } from '@/stores/memory'
import { errorToText, useToast } from '@/utils/toast'

defineProps<{
  draft: BridgeDesktopSettingsConfig
}>()

const toast = useToast()
const memoryStore = useMemoryStore()
const { items, selected, loading, saving, total } = storeToRefs(memoryStore)

const searchQuery = ref('')
const includeInactive = ref(false)
const policyModalOpen = ref(false)
const createModalOpen = ref(false)
const detailModalOpen = ref(false)
const detailLoading = ref(false)
const confirmDeleteMemoryId = ref<string | undefined>()

const selectedMemory = computed(() => selected.value?.memory)
const selectedSources = computed(() => selected.value?.sources ?? [])
const showMemoryListSkeleton = useDelayedFlag(() => loading.value)

watch(detailModalOpen, (isOpen) => {
  if (!isOpen) {
    selected.value = null
  }
})

onMounted(() => {
  void reload()
})

async function reload(): Promise<void> {
  try {
    const filters = {
      query: searchQuery.value.trim() || undefined,
      includeInactive: includeInactive.value,
      limit: 100,
    }
    if (filters.query) {
      await memoryStore.search(filters)
    } else {
      await memoryStore.load(filters)
    }
  } catch (error) {
    toast.error(errorToText(error, '记忆列表加载失败。'))
  }
}

function openPolicySettings(): void {
  confirmDeleteMemoryId.value = undefined
  policyModalOpen.value = true
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
    const memory = await memoryStore.create(request)
    createModalOpen.value = false
    await reload()
    detailModalOpen.value = true
    await inspectMemory(memory.id)
    toast.success('记忆已创建。')
  } catch (error) {
    toast.error(errorToText(error, '记忆创建失败。'))
  }
}

async function submitMemoryUpdate(request: UpdateCompanionMemoryRequest): Promise<void> {
  try {
    const updated = await memoryStore.update(request)
    if (updated) {
      await reload()
      await inspectMemory(updated.id)
      toast.success('记忆已保存。')
    }
  } catch (error) {
    toast.error(errorToText(error, '记忆保存失败。'))
  }
}

async function setMemoryEnabled(memory: CompanionMemoryItem, enabled: boolean): Promise<void> {
  await updateMemoryStatus(memory, enabled ? 'active' : 'disabled', '记忆状态更新失败。')
}

async function archiveMemory(memory: CompanionMemoryItem): Promise<void> {
  await updateMemoryStatus(memory, 'archived', '记忆归档失败。', '记忆已归档。')
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
    toast.error(errorToText(error, '重要度更新失败。'))
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
    toast.success('记忆已删除。')
  } catch (error) {
    toast.error(errorToText(error, '记忆删除失败。'))
  }
}

async function inspectMemory(memoryId: string): Promise<void> {
  detailLoading.value = true
  try {
    await memoryStore.inspect(memoryId)
  } catch (error) {
    toast.error(errorToText(error, '记忆详情加载失败。'))
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
  <div class="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
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
      @policy="openPolicySettings"
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

    <MemoryPolicyModal
      v-model:open="policyModalOpen"
      :draft="draft"
    />

    <MemoryCreateModal
      v-model:open="createModalOpen"
      :saving="saving"
      @submit="submitCreateMemory"
    />

    <MemoryDetailModal
      v-model:open="detailModalOpen"
      :memory="selectedMemory"
      :sources="selectedSources"
      :loading="detailLoading"
      :saving="saving"
      @submit="submitMemoryUpdate"
    />
  </div>
</template>

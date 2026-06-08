import type {
  CompanionMemoryFilters,
  CompanionMemoryInspectResponse,
  CompanionMemoryItem,
  CompanionMemoryListResponse,
  CreateCompanionMemoryRequest,
  UpdateCompanionMemoryRequest,
} from '@shared/types/memory'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { appBridge } from '@/bridge/app'

export const useMemoryStore = defineStore('memory', () => {
  const items = ref<CompanionMemoryItem[]>([])
  const total = ref(0)
  const selected = ref<CompanionMemoryInspectResponse | null>(null)
  const loading = ref(false)
  const saving = ref(false)
  const error = ref<unknown>(null)

  const available = computed(() => Boolean(appBridge.memory))

  async function load(filters: CompanionMemoryFilters = {}): Promise<CompanionMemoryListResponse> {
    loading.value = true
    error.value = null
    try {
      const response = await requireMemoryBridge().list(filters)
      items.value = response.items
      total.value = response.total
      return response
    } catch (err) {
      error.value = err
      throw err
    } finally {
      loading.value = false
    }
  }

  async function search(
    filters: CompanionMemoryFilters = {}
  ): Promise<CompanionMemoryListResponse> {
    loading.value = true
    error.value = null
    try {
      const response = await requireMemoryBridge().search(filters)
      items.value = response.items
      total.value = response.total
      return response
    } catch (err) {
      error.value = err
      throw err
    } finally {
      loading.value = false
    }
  }

  async function inspect(memoryId: string): Promise<CompanionMemoryInspectResponse | null> {
    const response = await requireMemoryBridge().inspect(memoryId)
    selected.value = response
    return response
  }

  async function create(request: CreateCompanionMemoryRequest): Promise<CompanionMemoryItem> {
    return withSaving(() => requireMemoryBridge().create(request))
  }

  async function update(
    request: UpdateCompanionMemoryRequest
  ): Promise<CompanionMemoryItem | null> {
    return withSaving(() => requireMemoryBridge().update(request))
  }

  async function archive(memoryId: string): Promise<CompanionMemoryItem | null> {
    return withSaving(() => requireMemoryBridge().archive(memoryId))
  }

  async function deleteMemory(memoryId: string): Promise<{ deleted: boolean }> {
    return withSaving(() => requireMemoryBridge().delete({ memoryId }))
  }

  async function setImportance(
    memoryId: string,
    importance: number
  ): Promise<CompanionMemoryItem | null> {
    return withSaving(() => requireMemoryBridge().setImportance({ memoryId, importance }))
  }

  async function withSaving<T>(operation: () => Promise<T>): Promise<T> {
    saving.value = true
    error.value = null
    try {
      return await operation()
    } catch (err) {
      error.value = err
      throw err
    } finally {
      saving.value = false
    }
  }

  return {
    items,
    total,
    selected,
    loading,
    saving,
    error,
    available,
    load,
    search,
    inspect,
    create,
    update,
    archive,
    deleteMemory,
    setImportance,
  }
})

function requireMemoryBridge() {
  if (!appBridge.memory) {
    throw new Error('当前 Electron bridge 缺少 memory API，无法管理记忆。')
  }

  return appBridge.memory
}

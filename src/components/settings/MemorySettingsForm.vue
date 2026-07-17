<script setup lang="ts">
import type {
  CompanionMemoryItem,
  CompanionMemoryMaintenanceProposal,
  CompanionMemoryScope,
  CompanionMemoryStatus,
  CreateCompanionMemoryRequest,
  UpdateCompanionMemoryRequest,
} from '@shared/types/memory'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { BridgeDesktopSettingsConfig } from '@/bridge/app'
import MemoryCreateModal from '@/components/settings/memory-settings/MemoryCreateModal.vue'
import MemoryDetailModal from '@/components/settings/memory-settings/MemoryDetailModal.vue'
import MemoryList from '@/components/settings/memory-settings/MemoryList.vue'
import MemoryPolicyModal from '@/components/settings/memory-settings/MemoryPolicyModal.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useDelayedFlag } from '@/composables/useDelayedFlag'
import { useMemoryStore } from '@/stores/memory'
import { errorToText, useToast } from '@/utils/toast'

defineProps<{
  draft: BridgeDesktopSettingsConfig
}>()

const { t } = useI18n()
const toast = useToast()
const memoryStore = useMemoryStore()
const { items, selected, loading, saving, total, proposals, proposalTotal } =
  storeToRefs(memoryStore)

const searchQuery = ref('')
const includeInactive = ref(false)
const policyModalOpen = ref(false)
const createModalOpen = ref(false)
const detailModalOpen = ref(false)
const detailLoading = ref(false)
const confirmDeleteMemoryId = ref<string | undefined>()
const commonMemoryScopes: CompanionMemoryScope[] = ['global', 'user']

const selectedMemory = computed(() => selected.value?.memory)
const selectedSources = computed(() => selected.value?.sources ?? [])
const selectedLinks = computed(() => selected.value?.links ?? [])
const selectedProposals = computed(() => selected.value?.proposals ?? [])
const showMemoryListSkeleton = useDelayedFlag(() => loading.value)

watch(detailModalOpen, (isOpen) => {
  if (!isOpen) {
    selected.value = null
  }
})

onMounted(() => {
  void reload()
  void reloadProposals()
})

async function reload(): Promise<void> {
  try {
    const filters = {
      query: searchQuery.value.trim() || undefined,
      includeInactive: includeInactive.value,
      scopes: commonMemoryScopes,
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

async function reloadProposals(): Promise<void> {
  try {
    await memoryStore.loadProposals({ status: 'pending', scopes: commonMemoryScopes, limit: 50 })
  } catch (error) {
    toast.error(errorToText(error, t('settings.memory.toast.proposalsLoadFailed')))
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
    const memory = await memoryStore.create({
      ...request,
      scope: request.scope === 'global' ? 'global' : 'user',
      characterId: undefined,
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
    const updated = await memoryStore.update(request)
    if (updated) {
      await reload()
      await inspectMemory(updated.id)
      toast.success(t('settings.memory.toast.saved'))
    }
  } catch (error) {
    toast.error(errorToText(error, t('settings.memory.toast.saveFailed')))
  }
}

async function updateProposal(
  proposal: CompanionMemoryMaintenanceProposal,
  status: 'accepted' | 'ignored'
): Promise<void> {
  try {
    await memoryStore.updateProposal({ proposalId: proposal.id, status })
    await reload()
    if (selectedMemory.value?.id) {
      await inspectMemory(selectedMemory.value.id)
    }
    toast.success(
      status === 'accepted'
        ? t('settings.memory.toast.proposalAccepted')
        : t('settings.memory.toast.proposalIgnored')
    )
  } catch (error) {
    toast.error(errorToText(error, t('settings.memory.toast.proposalFailed')))
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
  <div class="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
    <div
      v-if="proposals.length"
      class="mb-3 flex flex-col gap-2 rounded-md border px-3 py-3"
    >
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <Badge variant="outline">{{ t('settings.memory.maintenance.title') }} {{ proposalTotal }}</Badge>
          <span class="text-sm text-muted-foreground">{{ t('settings.memory.maintenance.description') }}</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          @click="reloadProposals"
        >
          {{ t('settings.memory.maintenance.refresh') }}
        </Button>
      </div>
      <div class="flex flex-col gap-2">
        <div
          v-for="proposal in proposals.slice(0, 3)"
          :key="proposal.id"
          class="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
        >
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{{ proposal.kind }}</Badge>
              <span class="truncate text-muted-foreground">{{ proposal.reason }}</span>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              :disabled="saving"
              @click="updateProposal(proposal, 'ignored')"
            >
              {{ t('settings.memory.maintenance.ignore') }}
            </Button>
            <Button
              type="button"
              size="sm"
              :disabled="saving"
              @click="updateProposal(proposal, 'accepted')"
            >
              {{ t('settings.memory.maintenance.accept') }}
            </Button>
          </div>
        </div>
      </div>
    </div>

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
      :title="t('settings.memory.commonPanelTitle')"
      :empty-title="t('settings.memory.commonEmptyTitle')"
      :empty-hint="t('settings.memory.commonEmptyHint')"
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
      :scope="'user'"
      :title="t('settings.memory.createModal.commonTitle')"
      :description="t('settings.memory.createModal.commonDescription')"
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

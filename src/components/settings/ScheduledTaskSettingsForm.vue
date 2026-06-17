<script setup lang="ts">
import type { CronRun, CronTask } from '@shared/types/cron'
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { BridgeDesktopSettingsConfig } from '@/bridge/app'
import ScheduledTaskAuditModal from '@/components/settings/scheduled-task-settings/ScheduledTaskAuditModal.vue'
import ScheduledTaskDetailModal from '@/components/settings/scheduled-task-settings/ScheduledTaskDetailModal.vue'
import ScheduledTaskEditModal from '@/components/settings/scheduled-task-settings/ScheduledTaskEditModal.vue'
import ScheduledTaskList from '@/components/settings/scheduled-task-settings/ScheduledTaskList.vue'
import ScheduledTaskPolicyModal from '@/components/settings/scheduled-task-settings/ScheduledTaskPolicyModal.vue'
import type { ScheduledTaskSubmitPayload } from '@/components/settings/scheduled-task-settings/types'
import { useDelayedFlag } from '@/composables/useDelayedFlag'
import { useCronStore } from '@/stores/cron'
import { errorToText, useToast } from '@/utils/toast'

defineProps<{
  draft: BridgeDesktopSettingsConfig
}>()

const { t } = useI18n()
const cronStore = useCronStore()
const toast = useToast()
const { tasks, runsByTaskId, loading, saving, persistenceAvailable } = storeToRefs(cronStore)

const editModalOpen = ref(false)
const editingTask = ref<CronTask | undefined>()
const detailModalOpen = ref(false)
const detailTaskId = ref<string | undefined>()
const auditModalOpen = ref(false)
const auditTaskId = ref<string | undefined>()
const auditLoading = ref(false)
const policyModalOpen = ref(false)
const confirmDeleteTaskId = ref<string | undefined>()

const detailTask = computed(() => findTaskById(detailTaskId.value))
const auditTask = computed(() => findTaskById(auditTaskId.value))
const auditRuns = computed<CronRun[]>(() =>
  auditTaskId.value ? (runsByTaskId.value[auditTaskId.value] ?? []) : []
)
const showTaskListSkeleton = useDelayedFlag(() => loading.value)

watch(editModalOpen, (isOpen) => {
  if (!isOpen) {
    editingTask.value = undefined
  }
})

watch(detailModalOpen, (isOpen) => {
  if (!isOpen) {
    detailTaskId.value = undefined
  }
})

watch(auditModalOpen, (isOpen) => {
  if (!isOpen) {
    auditTaskId.value = undefined
  }
})

onMounted(async () => {
  try {
    await cronStore.loadTasks()
  } catch (error) {
    toast.error(errorToText(error, t('settings.scheduledTask.errors.loadFailed')))
  }
})

onBeforeUnmount(() => {
  cronStore.stopCronSubscription()
})

function findTaskById(taskId: string | undefined): CronTask | undefined {
  return taskId ? tasks.value.find((task) => task.id === taskId) : undefined
}

function openCreateTask(): void {
  confirmDeleteTaskId.value = undefined
  editingTask.value = undefined
  editModalOpen.value = true
}

function openPolicySettings(): void {
  confirmDeleteTaskId.value = undefined
  policyModalOpen.value = true
}

function openEditTask(task: CronTask): void {
  confirmDeleteTaskId.value = undefined
  editingTask.value = task
  editModalOpen.value = true
}

async function submitTask(payload: ScheduledTaskSubmitPayload): Promise<void> {
  try {
    if (payload.kind === 'create') {
      await cronStore.createTask(payload.request)
    } else {
      await cronStore.updateTask(payload.request)
    }
    editModalOpen.value = false
  } catch (error) {
    toast.error(errorToText(error, t('settings.scheduledTask.errors.saveFailed')))
  }
}

function showFormError(message: string): void {
  toast.error(message)
}

function openTaskDetail(task: CronTask): void {
  confirmDeleteTaskId.value = undefined
  detailTaskId.value = task.id
  detailModalOpen.value = true
}

async function openTaskAudit(task: CronTask): Promise<void> {
  confirmDeleteTaskId.value = undefined
  auditTaskId.value = task.id
  auditModalOpen.value = true
  await loadAuditRuns(task.id)
}

async function refreshAuditRuns(): Promise<void> {
  if (!auditTaskId.value) {
    return
  }
  await loadAuditRuns(auditTaskId.value)
}

async function loadAuditRuns(taskId: string): Promise<void> {
  auditLoading.value = true
  try {
    await cronStore.loadRuns({ taskId })
  } catch (error) {
    toast.error(errorToText(error, t('settings.scheduledTask.errors.auditLoadFailed')))
  } finally {
    auditLoading.value = false
  }
}

async function runTask(task: CronTask): Promise<void> {
  confirmDeleteTaskId.value = undefined
  try {
    await cronStore.runNow({ taskId: task.id })
  } catch (error) {
    toast.error(errorToText(error, t('settings.scheduledTask.errors.runFailed')))
  }
}

async function setTaskEnabled(task: CronTask, enabled: boolean): Promise<void> {
  confirmDeleteTaskId.value = undefined
  try {
    await cronStore.updateTask({ taskId: task.id, enabled })
  } catch (error) {
    toast.error(errorToText(error, t('settings.scheduledTask.errors.statusUpdateFailed')))
  }
}

async function deleteTask(task: CronTask): Promise<void> {
  if (confirmDeleteTaskId.value !== task.id) {
    confirmDeleteTaskId.value = task.id
    return
  }
  try {
    await cronStore.deleteTask({ taskId: task.id })
    confirmDeleteTaskId.value = undefined
    closeTaskSurfaces(task.id)
  } catch (error) {
    toast.error(errorToText(error, t('settings.scheduledTask.errors.deleteFailed')))
  }
}

function closeTaskSurfaces(taskId: string): void {
  if (editingTask.value?.id === taskId) {
    editModalOpen.value = false
  }
  if (detailTaskId.value === taskId) {
    detailModalOpen.value = false
  }
  if (auditTaskId.value === taskId) {
    auditModalOpen.value = false
  }
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
    <ScheduledTaskList
      class="min-h-0 flex-1"
      :tasks="tasks"
      :loading="loading"
      :saving="saving"
      :show-skeleton="showTaskListSkeleton"
      :confirm-delete-task-id="confirmDeleteTaskId"
      @policy="openPolicySettings"
      @create="openCreateTask"
      @detail="openTaskDetail"
      @audit="openTaskAudit"
      @run="runTask"
      @edit="openEditTask"
      @enable="setTaskEnabled"
      @delete="deleteTask"
    />

    <ScheduledTaskPolicyModal
      v-model:open="policyModalOpen"
      :draft="draft"
    />

    <ScheduledTaskEditModal
      v-model:open="editModalOpen"
      :task="editingTask"
      :saving="saving"
      :persistence-available="persistenceAvailable"
      @submit="submitTask"
      @invalid="showFormError"
    />

    <ScheduledTaskDetailModal
      v-model:open="detailModalOpen"
      :task="detailTask"
    />

    <ScheduledTaskAuditModal
      v-model:open="auditModalOpen"
      :task="auditTask"
      :runs="auditRuns"
      :loading="auditLoading"
      @refresh="refreshAuditRuns"
    />
  </div>
</template>

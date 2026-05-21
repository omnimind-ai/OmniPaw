<script setup lang="ts">
import type { CronRun, CronTask } from '@shared/types/cron'
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { BridgeDesktopSettingsConfig } from '@/bridge/app'
import ScheduledTaskAuditModal from '@/components/settings/scheduled-task-settings/ScheduledTaskAuditModal.vue'
import ScheduledTaskDetailModal from '@/components/settings/scheduled-task-settings/ScheduledTaskDetailModal.vue'
import ScheduledTaskEditModal from '@/components/settings/scheduled-task-settings/ScheduledTaskEditModal.vue'
import ScheduledTaskList from '@/components/settings/scheduled-task-settings/ScheduledTaskList.vue'
import ScheduledTaskPolicySection from '@/components/settings/scheduled-task-settings/ScheduledTaskPolicySection.vue'
import type { ScheduledTaskSubmitPayload } from '@/components/settings/scheduled-task-settings/types'
import { useCronStore } from '@/stores/cron'
import { errorToText, useToast } from '@/utils/toast'

defineProps<{
  draft: BridgeDesktopSettingsConfig
}>()

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
const confirmDeleteTaskId = ref<string | undefined>()

const detailTask = computed(() => findTaskById(detailTaskId.value))
const auditTask = computed(() => findTaskById(auditTaskId.value))
const auditRuns = computed<CronRun[]>(() =>
  auditTaskId.value ? (runsByTaskId.value[auditTaskId.value] ?? []) : []
)

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
    toast.error(errorToText(error, '计划任务加载失败。'))
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
    toast.error(errorToText(error, '计划任务保存失败。'))
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
    toast.error(errorToText(error, '运行记录加载失败。'))
  } finally {
    auditLoading.value = false
  }
}

async function runTask(task: CronTask): Promise<void> {
  confirmDeleteTaskId.value = undefined
  try {
    await cronStore.runNow({ taskId: task.id })
  } catch (error) {
    toast.error(errorToText(error, '计划任务运行失败。'))
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
    toast.error(errorToText(error, '计划任务删除失败。'))
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
  <div class="flex flex-col gap-6">
    <ScheduledTaskPolicySection :draft="draft" />

    <ScheduledTaskList
      :tasks="tasks"
      :loading="loading"
      :saving="saving"
      :confirm-delete-task-id="confirmDeleteTaskId"
      @create="openCreateTask"
      @detail="openTaskDetail"
      @audit="openTaskAudit"
      @run="runTask"
      @edit="openEditTask"
      @delete="deleteTask"
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

import type {
  CreateCronTaskRequest,
  CronRun,
  CronTask,
  DeleteCronTaskRequest,
  ListCronRunsRequest,
  ListCronTasksRequest,
  RunCronTaskNowRequest,
  UpdateCronTaskRequest,
} from '@shared/types/cron'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  appBridge,
  type BridgeUnsubscribe,
  ensureElectronBridge,
  isFallbackBridge,
} from '@/bridge/app'

export const useCronStore = defineStore('cron', () => {
  const tasks = ref<CronTask[]>([])
  const runsByTaskId = ref<Record<string, CronRun[]>>({})
  const loading = ref(false)
  const saving = ref(false)
  const error = ref<unknown>(null)
  const persistenceAvailable = computed(() => !isFallbackBridge)
  let unsubscribe: BridgeUnsubscribe | undefined

  async function loadTasks(request: ListCronTasksRequest = {}): Promise<CronTask[]> {
    loading.value = true
    error.value = null
    try {
      const response = await appBridge.cron.list(request)
      tasks.value = response.tasks
      subscribeToChanges()
      return response.tasks
    } catch (err) {
      error.value = err
      throw err
    } finally {
      loading.value = false
    }
  }

  async function createTask(request: CreateCronTaskRequest): Promise<CronTask> {
    ensureElectronBridge('创建计划任务')
    saving.value = true
    error.value = null
    try {
      const response = await requireCronMethod('create')(request)
      upsertTask(response.task)
      return response.task
    } catch (err) {
      error.value = err
      throw err
    } finally {
      saving.value = false
    }
  }

  async function updateTask(request: UpdateCronTaskRequest): Promise<CronTask> {
    ensureElectronBridge('更新计划任务')
    saving.value = true
    error.value = null
    try {
      const response = await requireCronMethod('update')(request)
      upsertTask(response.task)
      return response.task
    } catch (err) {
      error.value = err
      throw err
    } finally {
      saving.value = false
    }
  }

  async function deleteTask(request: DeleteCronTaskRequest | string): Promise<boolean> {
    ensureElectronBridge('删除计划任务')
    saving.value = true
    error.value = null
    try {
      const taskId = typeof request === 'string' ? request : request.taskId
      const response = await requireCronMethod('delete')(request)
      if (response.deleted) {
        tasks.value = tasks.value.filter((task) => task.id !== taskId)
        delete runsByTaskId.value[taskId]
      }
      return response.deleted
    } catch (err) {
      error.value = err
      throw err
    } finally {
      saving.value = false
    }
  }

  async function runNow(request: RunCronTaskNowRequest | string): Promise<CronRun> {
    ensureElectronBridge('立即运行计划任务')
    saving.value = true
    error.value = null
    try {
      const response = await requireCronMethod('runNow')(request)
      await loadTasks()
      const taskId = typeof request === 'string' ? request : request.taskId
      await loadRuns({ taskId })
      return response.run
    } catch (err) {
      error.value = err
      throw err
    } finally {
      saving.value = false
    }
  }

  async function loadRuns(request: ListCronRunsRequest = {}): Promise<CronRun[]> {
    error.value = null
    try {
      const response = await requireCronMethod('listRuns')(request)
      if (request.taskId) {
        runsByTaskId.value = {
          ...runsByTaskId.value,
          [request.taskId]: response.runs,
        }
      }
      return response.runs
    } catch (err) {
      error.value = err
      throw err
    }
  }

  function subscribeToChanges(): void {
    if (unsubscribe || !appBridge.cron.onChanged) {
      return
    }
    unsubscribe = appBridge.cron.onChanged((event) => {
      if (event.task) {
        upsertTask(event.task)
      }
      if (event.reason === 'deleted' && event.taskId) {
        tasks.value = tasks.value.filter((task) => task.id !== event.taskId)
      }
      if (event.run?.taskId) {
        void loadRuns({ taskId: event.run.taskId })
      }
      void loadTasks()
    })
  }

  function stopCronSubscription(): void {
    unsubscribe?.()
    unsubscribe = undefined
  }

  function upsertTask(task: CronTask): void {
    const index = tasks.value.findIndex((item) => item.id === task.id)
    if (index >= 0) {
      tasks.value[index] = task
    } else {
      tasks.value.unshift(task)
    }
  }

  return {
    tasks,
    runsByTaskId,
    loading,
    saving,
    error,
    persistenceAvailable,
    loadTasks,
    createTask,
    updateTask,
    deleteTask,
    runNow,
    loadRuns,
    subscribeToChanges,
    stopCronSubscription,
  }
})

function requireCronMethod<K extends keyof typeof appBridge.cron>(
  name: K
): NonNullable<(typeof appBridge.cron)[K]> {
  const method = appBridge.cron[name]
  if (typeof method !== 'function') {
    throw new Error(`当前 Electron bridge 缺少 cron.${String(name)} API。`)
  }
  return method as NonNullable<(typeof appBridge.cron)[K]>
}

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import {
  appBridge,
  type BridgeImportSkillResponse,
  type BridgeLocalSkillSummary,
  type BridgeSkillChangedEvent,
  type BridgeSkillListResponse,
  type BridgeSkillStatus,
  type BridgeUnsubscribe,
  isFallbackBridge,
} from '@/bridge/app'
import SkillList from '@/components/settings/skill-settings/SkillList.vue'
import { useDelayedFlag } from '@/composables/useDelayedFlag'
import { errorToText, useToast } from '@/utils/toast'

type LocalSkillStatus = BridgeLocalSkillSummary['status'] | 'valid' | 'error' | 'disabled' | string
type LocalSkillSummary = BridgeLocalSkillSummary
type SkillListResponse = BridgeSkillListResponse

interface LegacySkillSummary {
  id?: string
  name: string
  description?: string
  enabled?: boolean
  status?: LocalSkillStatus
  source?: unknown
  rootName?: string
  relativePath?: string
  compatibility?: string
  metadata?: Record<string, unknown>
  error?: string | { message?: string }
}

const toast = useToast()
const skillBridge = appBridge.skill

const skills = ref<BridgeLocalSkillSummary[]>([])
const loading = ref(false)
const operationError = ref('')
const pendingKeys = ref<Set<string>>(new Set())
const readOnly = ref(false)
const fileInput = ref<HTMLInputElement>()
let unsubscribeSkills: BridgeUnsubscribe | undefined

const skillUnavailable = computed(() => !skillBridge)
const anyPending = computed(() => pendingKeys.value.size > 0)
const persistenceUnavailable = computed(
  () => skillUnavailable.value || isFallbackBridge || !skillBridge?.setEnabled
)
const importUnavailable = computed(() => persistenceUnavailable.value || !skillBridge?.importSkill)
const showListSkeleton = useDelayedFlag(() => loading.value)

onMounted(async () => {
  unsubscribeSkills = skillBridge.onChanged?.((event: BridgeSkillChangedEvent) => {
    applyListResponse(event)
  })

  await loadSkills()
})

onBeforeUnmount(() => {
  unsubscribeSkills?.()
  unsubscribeSkills = undefined
})

async function loadSkills() {
  loading.value = true
  operationError.value = ''

  try {
    applyListResponse(await skillBridge.list())
  } catch (error) {
    showOperationError(error, '技能列表加载失败。')
  } finally {
    loading.value = false
  }
}

async function refreshSkills() {
  await withPending('refresh:all', async () => {
    try {
      const response = skillBridge.refresh ? await skillBridge.refresh() : await skillBridge.list()
      applyListResponse(response)
      toast.success('技能列表已刷新。')
    } catch (error) {
      showOperationError(error, '技能列表刷新失败。')
    }
  })
}

function openImportPicker() {
  if (importUnavailable.value || anyPending.value) {
    return
  }
  fileInput.value?.click()
}

async function importSkillFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) {
    return
  }
  if (!skillBridge.importSkill) {
    showOperationError(new Error('当前运行时不支持导入技能。'), '技能导入失败。')
    return
  }

  await withPending('import:file', async () => {
    try {
      const response = await skillBridge.importSkill?.({
        fileName: file.name,
        bytes: await file.arrayBuffer(),
        overwrite: true,
      })
      if (response) {
        applyImportResponse(response)
        const names = response.imported.map((skill) => skill.name).join('、')
        toast.success(names ? `已导入 ${names}。` : '技能已导入。')
      }
    } catch (error) {
      showOperationError(error, '技能导入失败。')
    }
  })
}

async function setSkillEnabled(skill: LocalSkillSummary, enabled: boolean) {
  if (!skillBridge.setEnabled) {
    showOperationError(new Error('当前运行时不支持保存技能启用状态。'), '技能状态更新失败。')
    return
  }

  await withPending(`enable:${skill.id}`, async () => {
    try {
      const updated = await skillBridge.setEnabled?.({ skillId: skill.id, enabled })
      if (updated) upsertSkill(updated)
      toast.success(`${skill.name} 已${enabled ? '启用' : '停用'}。`)
    } catch (error) {
      showOperationError(error, '技能状态更新失败。')
    }
  })
}

function applyListResponse(
  response: SkillListResponse | BridgeSkillChangedEvent | LegacySkillSummary[]
) {
  if (Array.isArray(response)) {
    skills.value = normalizeLegacySkills(response)
    readOnly.value = isFallbackBridge
    return
  }

  skills.value = normalizeLegacySkills(response.skills || [])
  readOnly.value = false
  const responseError = response.status?.error
  if (responseError?.message) {
    operationError.value = responseError.message
  }
}

function applyImportResponse(response: BridgeImportSkillResponse) {
  skills.value = normalizeLegacySkills(response.skills || [])
  readOnly.value = false
  const responseError = response.status?.error
  if (responseError?.message) {
    operationError.value = responseError.message
  }
}

function normalizeLegacySkills(items: LegacySkillSummary[]): BridgeLocalSkillSummary[] {
  return items.map((item) => ({
    id: item.id || item.name,
    name: item.name,
    description: item.description || '',
    source: 'local',
    rootName: item.rootName || 'local',
    relativePath: item.relativePath || '',
    metadata: normalizeMetadata(item.metadata),
    compatibility: item.compatibility,
    error: typeof item.error === 'string' ? item.error : item.error?.message,
    enabled: Boolean(item.enabled),
    status: (item.status === 'valid'
      ? 'available'
      : item.status === 'error'
        ? 'invalid'
        : item.status || 'available') as BridgeSkillStatus,
  }))
}

function upsertSkill(skill: LocalSkillSummary) {
  const normalized = normalizeLegacySkills([skill])[0]
  if (!normalized) return
  skills.value = skills.value.map((item) => (item.id === normalized.id ? normalized : item))
}

async function withPending(key: string, operation: () => Promise<void>) {
  if (pendingKeys.value.has(key)) return
  pendingKeys.value = new Set([...pendingKeys.value, key])
  try {
    await operation()
  } finally {
    const next = new Set(pendingKeys.value)
    next.delete(key)
    pendingKeys.value = next
  }
}

function isPending(key: string) {
  return pendingKeys.value.has(key)
}

function isSkillPending(skillId: string) {
  return Array.from(pendingKeys.value).some((key) => key.endsWith(`:${skillId}`))
}

function showOperationError(error: unknown, fallback: string) {
  const message = errorToText(error, fallback)
  operationError.value = message
  toast.error(message)
}

function normalizeMetadata(value: unknown): Record<string, string | undefined> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  )
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
    <input
      ref="fileInput"
      type="file"
      accept=".md,.zip"
      class="hidden"
      @change="importSkillFile"
    >

    <SkillList
      class="min-h-0 flex-1"
      :skills="skills"
      :loading="loading"
      :show-skeleton="showListSkeleton"
      :any-pending="anyPending"
      :skill-unavailable="skillUnavailable"
      :import-unavailable="importUnavailable"
      :persistence-unavailable="persistenceUnavailable"
      :read-only="isFallbackBridge || readOnly"
      :operation-error="operationError"
      :is-refresh-pending="isPending('refresh:all')"
      :is-skill-pending="isSkillPending"
      @import-file="openImportPicker"
      @refresh="refreshSkills"
      @enable="setSkillEnabled"
    />
  </div>
</template>

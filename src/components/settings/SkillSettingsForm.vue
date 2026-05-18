<script setup lang="ts">
import {
  AlertCircleIcon,
  BookOpenIcon,
  RefreshCwIcon,
  UploadIcon,
} from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import {
  appBridge,
  isFallbackBridge,
  type BridgeImportSkillResponse,
  type BridgeLocalSkillSummary,
  type BridgeSkillChangedEvent,
  type BridgeSkillListResponse,
  type BridgeSkillStatus,
  type BridgeUnsubscribe,
} from '@/bridge/app'
import SettingsSection from '@/components/settings/SettingsSection.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from '@/components/ui/field'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
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
const enabledCount = computed(() => skills.value.filter((skill) => skill.enabled).length)
const invalidCount = computed(() => skills.value.filter((skill) => isInvalidSkill(skill)).length)
const anyPending = computed(() => pendingKeys.value.size > 0)
const persistenceUnavailable = computed(() => skillUnavailable.value || isFallbackBridge || !skillBridge?.setEnabled)
const importUnavailable = computed(() => persistenceUnavailable.value || !skillBridge?.importSkill)

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
      const response = skillBridge.refresh
        ? await skillBridge.refresh()
        : await skillBridge.list()
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

function applyListResponse(response: SkillListResponse | BridgeSkillChangedEvent | LegacySkillSummary[]) {
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
    status: (item.status === 'valid' ? 'available' : item.status === 'error' ? 'invalid' : item.status || 'available') as BridgeSkillStatus,
  }))
}

function upsertSkill(skill: LocalSkillSummary) {
  const normalized = normalizeLegacySkills([skill])[0]
  if (!normalized) return
  skills.value = skills.value.map((item) => item.id === normalized.id ? normalized : item)
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

function isInvalidSkill(skill: LocalSkillSummary) {
  return isInvalidStatus(skill.status)
}

function statusLabel(status?: LocalSkillStatus) {
  const labels: Record<string, string> = {
    valid: '可用',
    available: '可用',
    invalid: '无效',
    error: '错误',
    disabled: '已停用',
    missing: '缺失',
  }
  return labels[String(status || 'valid')] || String(status)
}

function statusVariant(status?: LocalSkillStatus) {
  return isInvalidStatus(status) ? 'destructive' : 'secondary'
}

function sourceLabel(source: LocalSkillSummary['source']) {
  return source === 'local' ? '本地' : '本地'
}

function safeLocationLabel(skill: LocalSkillSummary) {
  if (skill.rootName && skill.relativePath) return `${skill.rootName}/${skill.relativePath}`
  if (skill.rootName) return skill.rootName
  return ''
}

function skillErrorMessage(skill: LocalSkillSummary) {
  return skill.error || ''
}

function metadataBadges(skill: LocalSkillSummary) {
  return [
    skill.compatibility ? `兼容性: ${skill.compatibility}` : '',
    skill.metadata.license ? `许可: ${skill.metadata.license}` : '',
  ].filter(Boolean)
}

function isInvalidStatus(status?: LocalSkillStatus) {
  return ['invalid', 'error', 'missing'].includes(String(status || ''))
}

function normalizeMetadata(value: unknown): Record<string, string | undefined> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  )
}
</script>

<template>
  <SettingsSection
    title="技能"
    description="管理本地 SKILL.md 技能包。"
  >
    <div class="flex flex-col">
      <div class="flex flex-col gap-3 border-b px-4 py-4 md:flex-row md:items-center md:justify-between">
        <div class="flex min-w-0 flex-col gap-1">
          <div class="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">
              {{ skills.length }} 个技能
            </Badge>
            <Badge variant="outline">
              {{ enabledCount }} 个已启用
            </Badge>
            <Badge
              v-if="invalidCount"
              variant="destructive"
            >
              {{ invalidCount }} 个异常
            </Badge>
          </div>
          <p class="text-sm text-muted-foreground">
            技能只提供本地提示词说明，不会授予新的文件、命令或网络权限。
          </p>
        </div>

        <div class="flex flex-wrap gap-2">
          <input
            ref="fileInput"
            type="file"
            accept=".md,.zip"
            class="hidden"
            @change="importSkillFile"
          >
          <Button
            variant="outline"
            size="sm"
            :disabled="loading || anyPending || importUnavailable"
            @click="openImportPicker"
          >
            <UploadIcon data-icon="inline-start" />
            导入
          </Button>
          <Button
            variant="outline"
            size="sm"
            :disabled="loading || anyPending || skillUnavailable"
            @click="refreshSkills"
          >
            <RefreshCwIcon
              data-icon="inline-start"
              :class="cn(isPending('refresh:all') && 'animate-spin')"
            />
            刷新
          </Button>
        </div>
      </div>

      <div
        v-if="skillUnavailable"
        class="border-b px-4 py-4 text-sm text-muted-foreground"
      >
        技能管理桥接尚未就绪，请在 Electron 运行时中打开设置。
      </div>

      <div
        v-if="isFallbackBridge || readOnly"
        class="border-b px-4 py-3 text-sm text-muted-foreground"
      >
        当前是预览或只读运行时，可以查看技能列表，但导入和启用状态不会写入本地技能状态。
      </div>

      <div
        v-if="operationError"
        class="border-b px-4 py-4"
      >
        <div class="flex gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircleIcon class="mt-0.5 shrink-0" />
          <span>{{ operationError }}</span>
        </div>
      </div>

      <div
        v-if="loading"
        class="flex flex-col gap-3 px-4 py-4"
      >
        <Skeleton class="h-24 w-full" />
        <Skeleton class="h-24 w-full" />
      </div>

      <div
        v-else-if="!skills.length"
        class="flex flex-col items-start gap-3 px-4 py-8"
      >
        <div class="flex items-center gap-2 text-sm font-medium">
          <BookOpenIcon class="text-muted-foreground" />
          暂无本地技能
        </div>
        <p class="max-w-2xl text-sm text-muted-foreground">
          本地技能根目录中发现包含 SKILL.md 的技能包后，会显示在这里。
        </p>
        <div class="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            :disabled="anyPending || importUnavailable"
            @click="openImportPicker"
          >
            <UploadIcon data-icon="inline-start" />
            导入
          </Button>
          <Button
            variant="outline"
            size="sm"
            :disabled="skillUnavailable || anyPending"
            @click="refreshSkills"
          >
            <RefreshCwIcon
              data-icon="inline-start"
              :class="cn(isPending('refresh:all') && 'animate-spin')"
            />
            刷新
          </Button>
        </div>
      </div>

      <ul
        v-else
        class="flex flex-col"
      >
        <li
          v-for="skill in skills"
          :key="skill.id"
          class="flex flex-col gap-3 border-b px-4 py-4 last:border-b-0"
        >
          <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div class="flex min-w-0 flex-col gap-2">
              <div class="flex flex-wrap items-center gap-2">
                <h3 class="truncate text-sm font-medium">
                  {{ skill.name }}
                </h3>
                <Badge :variant="statusVariant(skill.status)">
                  {{ statusLabel(skill.status) }}
                </Badge>
                <Badge variant="outline">
                  {{ sourceLabel(skill.source) }}
                </Badge>
                <Badge :variant="skill.enabled ? 'secondary' : 'outline'">
                  {{ skill.enabled ? '已启用' : '已停用' }}
                </Badge>
              </div>

              <p class="truncate text-xs text-muted-foreground">
                {{ skill.id }}
              </p>
              <p
                v-if="safeLocationLabel(skill)"
                class="truncate text-xs text-muted-foreground"
              >
                {{ safeLocationLabel(skill) }}
              </p>
              <p class="line-clamp-2 text-sm text-muted-foreground">
                {{ skill.description || '未提供描述。' }}
              </p>
              <div
                v-if="metadataBadges(skill).length"
                class="flex flex-wrap gap-2"
              >
                <Badge
                  v-for="badge in metadataBadges(skill)"
                  :key="badge"
                  variant="outline"
                >
                  {{ badge }}
                </Badge>
              </div>
            </div>

            <Field
              orientation="horizontal"
              class="items-center gap-2"
              :data-disabled="isSkillPending(skill.id) || persistenceUnavailable || isInvalidSkill(skill) ? '' : undefined"
            >
              <Switch
                :id="`skill-enabled-${skill.id}`"
                :model-value="skill.enabled"
                :disabled="isSkillPending(skill.id) || persistenceUnavailable || isInvalidSkill(skill)"
                :aria-label="`${skill.enabled ? '停用' : '启用'} ${skill.name}`"
                @update:model-value="setSkillEnabled(skill, $event)"
              />
              <FieldLabel :for="`skill-enabled-${skill.id}`">
                启用
              </FieldLabel>
            </Field>
          </div>

          <Field
            v-if="skillErrorMessage(skill)"
            data-invalid
            class="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2"
          >
            <FieldContent>
              <FieldLabel class="text-destructive">
                技能异常
              </FieldLabel>
              <FieldDescription class="text-destructive">
                {{ skillErrorMessage(skill) }}
              </FieldDescription>
            </FieldContent>
          </Field>
        </li>
      </ul>
    </div>
  </SettingsSection>
</template>

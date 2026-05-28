<script setup lang="ts">
import { AlertCircleIcon, BookOpenIcon, RefreshCwIcon, UploadIcon } from 'lucide-vue-next'
import { computed } from 'vue'
import type { BridgeLocalSkillSummary } from '@/bridge/app'

import SettingsListItem from '@/components/settings/SettingsListItem.vue'
import SettingsListSection from '@/components/settings/SettingsListSection.vue'
import { Badge, type BadgeVariants } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldContent, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

type LocalSkillStatus = BridgeLocalSkillSummary['status'] | 'valid' | 'error' | 'disabled' | string

const props = defineProps<{
  skills: BridgeLocalSkillSummary[]
  loading: boolean
  showSkeleton: boolean
  anyPending: boolean
  skillUnavailable: boolean
  importUnavailable: boolean
  persistenceUnavailable: boolean
  readOnly: boolean
  operationError: string
  isRefreshPending: boolean
  isSkillPending: (skillId: string) => boolean
}>()

const emit = defineEmits<{
  'import-file': []
  refresh: []
  enable: [skill: BridgeLocalSkillSummary, enabled: boolean]
}>()

const enabledCount = computed(() => props.skills.filter((skill) => skill.enabled).length)
const invalidCount = computed(() => props.skills.filter((skill) => isInvalidSkill(skill)).length)

function isInvalidSkill(skill: BridgeLocalSkillSummary) {
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

function statusVariant(status?: LocalSkillStatus): BadgeVariants['variant'] {
  return isInvalidStatus(status) ? 'destructive' : 'secondary'
}

function sourceLabel(source: BridgeLocalSkillSummary['source']) {
  return source === 'local' ? '本地' : '本地'
}

function safeLocationLabel(skill: BridgeLocalSkillSummary) {
  if (skill.rootName && skill.relativePath) return `${skill.rootName}/${skill.relativePath}`
  if (skill.rootName) return skill.rootName
  return ''
}

function skillErrorMessage(skill: BridgeLocalSkillSummary) {
  return skill.error || ''
}

function metadataBadges(skill: BridgeLocalSkillSummary) {
  return [
    skill.compatibility ? `兼容性: ${skill.compatibility}` : '',
    skill.metadata.license ? `许可: ${skill.metadata.license}` : '',
  ].filter(Boolean)
}

function isInvalidStatus(status?: LocalSkillStatus) {
  return ['invalid', 'error', 'missing'].includes(String(status || ''))
}
</script>

<template>
  <SettingsListSection
    title="技能"
    :description="`${skills.length} 个技能`"
    lead="技能只提供本地提示词说明，不会授予新的文件、命令或网络权限。"
    :loading="loading"
    :show-skeleton="showSkeleton"
    :empty="!skills.length"
    empty-title="暂无本地技能"
    empty-description="本地技能根目录中发现包含 SKILL.md 的技能包后，会显示在这里。"
    :empty-icon="BookOpenIcon"
  >
    <template #actions>
      <Button
        variant="outline"
        size="sm"
        :disabled="loading || anyPending || importUnavailable"
        @click="emit('import-file')"
      >
        <UploadIcon data-icon="inline-start" />
        导入
      </Button>
      <Button
        variant="outline"
        size="sm"
        :disabled="loading || anyPending || skillUnavailable"
        @click="emit('refresh')"
      >
        <RefreshCwIcon
          data-icon="inline-start"
          :class="cn(isRefreshPending && 'animate-spin')"
        />
        刷新
      </Button>
    </template>

    <template #summary>
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
    </template>

    <template #notices>
      <div
        v-if="skillUnavailable"
        class="border-b px-4 py-4 text-sm text-muted-foreground"
      >
        技能管理桥接尚未就绪，请在 Electron 运行时中打开设置。
      </div>

      <div
        v-if="readOnly"
        class="border-b px-4 py-3 text-sm text-muted-foreground"
      >
        当前是预览或只读运行时，可以查看技能列表，但导入和启用状态不会写入本地技能状态。
      </div>
    </template>

    <template #error>
      <div
        v-if="operationError"
        class="border-b px-4 py-4"
      >
        <div class="flex gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircleIcon class="mt-0.5 shrink-0" />
          <span>{{ operationError }}</span>
        </div>
      </div>
    </template>

    <template #empty-actions>
      <Button
        variant="outline"
        size="sm"
        :disabled="anyPending || importUnavailable"
        @click="emit('import-file')"
      >
        <UploadIcon data-icon="inline-start" />
        导入
      </Button>
      <Button
        variant="outline"
        size="sm"
        :disabled="skillUnavailable || anyPending"
        @click="emit('refresh')"
      >
        <RefreshCwIcon
          data-icon="inline-start"
          :class="cn(isRefreshPending && 'animate-spin')"
        />
        刷新
      </Button>
    </template>

    <SettingsListItem
      v-for="skill in skills"
      :key="skill.id"
    >
      <template #title>
        {{ skill.name }}
      </template>

      <template #badges>
        <Badge :variant="statusVariant(skill.status)">
          {{ statusLabel(skill.status) }}
        </Badge>
        <Badge variant="outline">
          {{ sourceLabel(skill.source) }}
        </Badge>
        <Badge :variant="skill.enabled ? 'secondary' : 'outline'">
          {{ skill.enabled ? '已启用' : '已停用' }}
        </Badge>
      </template>

      <template #meta>
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
      </template>

      <template #actions>
        <Switch
          :id="`skill-enabled-${skill.id}`"
          size="sm"
          :model-value="skill.enabled"
          :disabled="isSkillPending(skill.id) || persistenceUnavailable || isInvalidSkill(skill)"
          :aria-label="`${skill.enabled ? '停用' : '启用'} ${skill.name}`"
          @update:model-value="emit('enable', skill, $event)"
        />
      </template>

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
    </SettingsListItem>
  </SettingsListSection>
</template>

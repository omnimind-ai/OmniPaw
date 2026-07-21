<script setup lang="ts">
import {
  AlertCircleIcon,
  BookOpenIcon,
  RefreshCwIcon,
  SearchIcon,
  UploadIcon,
  XIcon,
} from '@lucide/vue'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { BridgeLocalSkillSummary } from '@/bridge/app'

import SettingsPanelHeader from '@/components/settings/common/SettingsPanelHeader.vue'
import SettingsPanelItem from '@/components/settings/common/SettingsPanelItem.vue'
import SettingsSearchBar from '@/components/settings/common/SettingsSearchBar.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Field, FieldContent, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Skeleton } from '@/components/ui/skeleton'
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
  details: [skill: BridgeLocalSkillSummary]
}>()

const { t } = useI18n()
const searchQuery = ref('')
const enabledCount = computed(() => props.skills.filter((skill) => skill.enabled).length)
const invalidCount = computed(() => props.skills.filter((skill) => isInvalidSkill(skill)).length)
const filteredSkills = computed(() => {
  const query = normalizeSearchText(searchQuery.value)
  if (!query) return props.skills
  return props.skills.filter((skill) => {
    const searchable = [
      skill.name,
      skill.id,
      skill.description,
      safeLocationLabel(skill),
      skill.compatibility,
      skill.metadata.license,
    ]
      .filter(Boolean)
      .join(' ')
    return normalizeSearchText(searchable).includes(query)
  })
})
const searchEmpty = computed(() => props.skills.length > 0 && filteredSkills.value.length === 0)

function isInvalidSkill(skill: BridgeLocalSkillSummary) {
  return isInvalidStatus(skill.status)
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
    skill.compatibility ? `${t('settings.skill.title')}: ${skill.compatibility}` : '',
    skill.metadata.license
      ? t('settings.skill.licensePrefix', { license: skill.metadata.license })
      : '',
  ].filter(Boolean)
}

function isInvalidStatus(status?: LocalSkillStatus) {
  return ['invalid', 'error', 'missing'].includes(String(status || ''))
}

function normalizeSearchText(value: string) {
  return value.trim().toLocaleLowerCase()
}

function clearSearch() {
  searchQuery.value = ''
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
    <Card class="grid h-full min-h-0 flex-1 grid-rows-[auto_auto_minmax(0,1fr)] gap-0 rounded-md border border-border py-0 ring-0">
      <SettingsPanelHeader
        :title="t('settings.skill.title')"
        :icon="BookOpenIcon"
      />

      <SettingsSearchBar
        v-model="searchQuery"
        class="border-b-0"
        :label="t('settings.skill.searchLabel')"
        :placeholder="t('settings.skill.searchPlaceholder')"
        :clear-label="t('settings.skill.clearSearchLabel')"
      >
        <template #summary>
          <Badge variant="secondary">
            {{ t('settings.skill.skillCount', { count: skills.length }) }}
          </Badge>
        </template>

        <template #actions>
          <Button
            type="button"
            variant="outline"
            :disabled="loading || anyPending || skillUnavailable"
            @click="emit('refresh')"
          >
            <RefreshCwIcon
              data-icon="inline-start"
              :class="cn(isRefreshPending && 'animate-spin')"
            />
            {{ t('settings.skill.refreshSkills') }}
          </Button>
          <Button
            type="button"
            variant="outline"
            :disabled="loading || anyPending || importUnavailable"
            @click="emit('import-file')"
          >
            <UploadIcon data-icon="inline-start" />
            {{ t('settings.skill.importSkill') }}
          </Button>
        </template>
      </SettingsSearchBar>

      <CardContent class="flex min-h-0 flex-1 flex-col overflow-y-auto p-0">
        <div class="flex min-h-full flex-1 flex-col">
          <div
            v-if="skillUnavailable"
            class="shrink-0 border-b px-4 py-4 text-sm text-muted-foreground sm:px-5"
          >
            {{ t('settings.skill.bridgeNotReady') }}
          </div>

          <div
            v-if="readOnly"
            class="shrink-0 border-b px-4 py-3 text-sm text-muted-foreground sm:px-5"
          >
            {{ t('settings.skill.readOnlyMode') }}
          </div>

          <div
            v-if="operationError"
            class="shrink-0 border-b px-4 py-4 sm:px-5"
          >
            <div class="flex gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircleIcon class="mt-0.5 shrink-0" />
              <span>{{ operationError }}</span>
            </div>
          </div>

          <div
            v-if="loading"
            class="flex shrink-0 flex-col gap-3 px-4 py-4 sm:px-5"
          >
            <template v-if="showSkeleton">
              <Skeleton class="h-24 w-full" />
              <Skeleton class="h-24 w-full" />
            </template>
          </div>

          <div
            v-else-if="!skills.length"
            class="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-10 text-center text-sm text-muted-foreground sm:px-5"
          >
            <BookOpenIcon class="size-8 opacity-50" />
            <div class="flex flex-col gap-1">
              <p class="font-medium text-foreground">{{ t('settings.skill.noSkills') }}</p>
              <p>{{ t('settings.skill.noSkillsHint') }}</p>
            </div>
            <div class="flex flex-wrap justify-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                :disabled="anyPending || importUnavailable"
                @click="emit('import-file')"
              >
                <UploadIcon data-icon="inline-start" />
                {{ t('settings.skill.importSkill') }}
              </Button>
            </div>
          </div>

          <div
            v-else-if="searchEmpty"
            class="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-10 text-center text-sm text-muted-foreground sm:px-5"
          >
            <SearchIcon class="size-8 opacity-50" />
            <div class="flex flex-col gap-1">
              <p class="font-medium text-foreground">{{ t('settings.skill.noMatch') }}</p>
              <p>{{ t('settings.skill.noMatchHint') }}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              @click="clearSearch"
            >
              <XIcon data-icon="inline-start" />
              {{ t('settings.skill.clearSearch') }}
            </Button>
          </div>

          <div
            v-else
            class="flex flex-1 flex-col gap-3 px-4 py-4 sm:px-5"
          >
            <SettingsPanelItem
              v-for="skill in filteredSkills"
              :key="skill.id"
              :title="skill.name"
              :description="skill.description || t('settings.skill.noDescription')"
              :icon="BookOpenIcon"
              :pending="isSkillPending(skill.id)"
              :avatar-class="isInvalidSkill(skill) ? 'bg-destructive/10 text-destructive' : undefined"
              interactive
              :activation-label="t('settings.skill.details.view', { name: skill.name })"
              class="cursor-pointer"
              @activate="emit('details', skill)"
            >
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
                  :model-value="skill.enabled"
                  :disabled="isSkillPending(skill.id) || persistenceUnavailable || isInvalidSkill(skill)"
                  :aria-label="`${skill.enabled ? t('settings.skill.toggleAction.disable') : t('settings.skill.toggleAction.enable')} ${skill.name}`"
                  @click.stop
                  @update:model-value="emit('enable', skill, $event)"
                />
              </template>

              <Field
                v-if="skillErrorMessage(skill)"
                data-invalid
                class="mt-3 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2"
              >
                <FieldContent>
                  <FieldLabel class="text-destructive">
                    {{ t('settings.skill.errorLabel') }}
                  </FieldLabel>
                  <FieldDescription class="text-destructive">
                    {{ skillErrorMessage(skill) }}
                  </FieldDescription>
                </FieldContent>
              </Field>
            </SettingsPanelItem>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
</template>

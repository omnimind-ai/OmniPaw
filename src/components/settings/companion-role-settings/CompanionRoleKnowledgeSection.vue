<script setup lang="ts">
import {
  BookOpenIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  Trash2Icon,
  XIcon,
} from '@lucide/vue'
import type { CompanionRoleKnowledgeEntry } from '@shared/types/companion-role'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsPanelHeader from '@/components/settings/common/SettingsPanelHeader.vue'
import SettingsPanelItem from '@/components/settings/common/SettingsPanelItem.vue'
import SettingsSearchBar from '@/components/settings/common/SettingsSearchBar.vue'
import CompanionRoleKnowledgeCreateDialog, {
  type CreateCompanionRoleKnowledgeEntryPayload,
} from '@/components/settings/companion-role-settings/CompanionRoleKnowledgeCreateDialog.vue'
import CompanionRoleKnowledgeDeleteModal from '@/components/settings/companion-role-settings/CompanionRoleKnowledgeDeleteModal.vue'
import CompanionRoleKnowledgeSettingsModal from '@/components/settings/companion-role-settings/CompanionRoleKnowledgeSettingsModal.vue'
import type { CompanionRole } from '@/components/settings/companion-role-settings/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'

const props = defineProps<{
  entries: CompanionRole['knowledgeEntries']
  settings: CompanionRole['knowledgeSettings']
}>()

const emit = defineEmits<{
  'update:entries': [entries: CompanionRole['knowledgeEntries']]
  'update:settings': [settings: CompanionRole['knowledgeSettings']]
}>()

const { t } = useI18n()
const knowledgeSearchQuery = ref('')
const knowledgeEntryDialogOpen = ref(false)
const knowledgeSettingsModalOpen = ref(false)
const editingKnowledgeEntryId = ref<string>()
const knowledgeDeleteTargetId = ref<string>()

const filteredKnowledgeEntries = computed(() => {
  const query = normalizeKnowledgeSearchText(knowledgeSearchQuery.value)
  return props.entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => !query || knowledgeEntryMatchesSearch(entry, query))
})
const searchEmpty = computed(
  () => props.entries.length > 0 && filteredKnowledgeEntries.value.length === 0
)
const editingKnowledgeEntry = computed(() =>
  props.entries.find((entry) => entry.id === editingKnowledgeEntryId.value)
)
const knowledgeDeleteTarget = computed(() =>
  props.entries.find((entry) => entry.id === knowledgeDeleteTargetId.value)
)
const knowledgeDeleteDialogOpen = computed({
  get: () => Boolean(knowledgeDeleteTarget.value),
  set: (open) => {
    if (!open) {
      knowledgeDeleteTargetId.value = undefined
    }
  },
})

watch(knowledgeEntryDialogOpen, (isOpen) => {
  if (!isOpen) {
    editingKnowledgeEntryId.value = undefined
  }
})

function openKnowledgeCreateDialog(): void {
  editingKnowledgeEntryId.value = undefined
  knowledgeEntryDialogOpen.value = true
}

function openKnowledgeEditDialog(entry: CompanionRoleKnowledgeEntry): void {
  editingKnowledgeEntryId.value = entry.id
  knowledgeEntryDialogOpen.value = true
}

function openKnowledgeSettings(): void {
  knowledgeSettingsModalOpen.value = true
}

function submitKnowledgeEntry(payload: CreateCompanionRoleKnowledgeEntryPayload): void {
  const entries = ensureKnowledgeEntries()
  const now = Date.now()

  if (editingKnowledgeEntryId.value) {
    emit(
      'update:entries',
      entries.map((entry) =>
        entry.id === editingKnowledgeEntryId.value
          ? {
              ...entry,
              title: payload.title || t('settings.catAppearance.role.knowledge.untitled'),
              content: payload.content,
              keys: payload.keys,
              constant: payload.constant,
              priority: payload.priority,
              tokenBudget: payload.tokenBudget,
              updatedAt: now,
            }
          : entry
      )
    )
  } else {
    emit('update:entries', [
      ...entries,
      {
        id: createRoleKnowledgeId(entries.length),
        enabled: true,
        title: payload.title || t('settings.catAppearance.role.knowledge.newTitle'),
        content: payload.content,
        keys: payload.keys,
        constant: payload.constant,
        priority: payload.priority,
        order: entries.length,
        tokenBudget: payload.tokenBudget,
        createdAt: now,
        updatedAt: now,
      },
    ])
  }

  knowledgeEntryDialogOpen.value = false
}

function updateKnowledgeSettings(settings: CompanionRole['knowledgeSettings']): void {
  emit('update:settings', settings)
}

function updateKnowledgeEntry(
  targetId: string,
  patch: Partial<Omit<CompanionRoleKnowledgeEntry, 'id' | 'createdAt'>>
): void {
  emit(
    'update:entries',
    ensureKnowledgeEntries().map((entry) =>
      entry.id === targetId ? { ...entry, ...patch, updatedAt: Date.now() } : entry
    )
  )
}

function requestDeleteKnowledgeEntry(targetId: string): void {
  knowledgeDeleteTargetId.value = targetId
}

function confirmDeleteKnowledgeEntry(): void {
  if (!knowledgeDeleteTargetId.value) return
  emit(
    'update:entries',
    ensureKnowledgeEntries().filter((entry) => entry.id !== knowledgeDeleteTargetId.value)
  )
  knowledgeDeleteTargetId.value = undefined
}

function clearSearch(): void {
  knowledgeSearchQuery.value = ''
}

function ensureKnowledgeEntries(): CompanionRole['knowledgeEntries'] {
  return Array.isArray(props.entries) ? props.entries : []
}

function normalizeKnowledgeSearchText(value: string): string {
  return value.trim().toLocaleLowerCase()
}

function knowledgeEntryMatchesSearch(entry: CompanionRoleKnowledgeEntry, query: string): boolean {
  return [
    entry.title,
    entry.content,
    ...entry.keys,
    entry.constant ? t('settings.catAppearance.role.knowledge.fields.constant') : '',
  ]
    .join(' ')
    .toLocaleLowerCase()
    .includes(query)
}

function createRoleKnowledgeId(index: number): string {
  return `role-knowledge-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 8)}`
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-1 flex-col overflow-hidden p-4 sm:p-5">
    <Card class="grid h-full min-h-0 flex-1 grid-rows-[auto_auto_minmax(0,1fr)] gap-0 rounded-md border border-border py-0 ring-0">
      <SettingsPanelHeader
        :title="t('settings.catAppearance.role.knowledge.title')"
        :description="t('settings.catAppearance.role.knowledge.description')"
        :icon="BookOpenIcon"
      />

      <SettingsSearchBar
        v-model="knowledgeSearchQuery"
        class="border-b-0"
        :placeholder="t('settings.catAppearance.role.knowledge.searchPlaceholder')"
        :label="t('settings.catAppearance.role.knowledge.search')"
        :clear-label="t('settings.catAppearance.role.knowledge.clearSearch')"
        :disabled="!entries.length"
        @clear="clearSearch"
      >
        <template #summary>
          <Badge variant="secondary">
            {{ t('settings.catAppearance.role.knowledge.count', { count: entries.length }) }}
          </Badge>
        </template>

        <template #actions>
          <Button
            type="button"
            variant="outline"
            @click="openKnowledgeSettings"
          >
            <SlidersHorizontalIcon data-icon="inline-start" />
            {{ t('settings.catAppearance.role.knowledge.settingsAction') }}
          </Button>
          <Button
            type="button"
            @click="openKnowledgeCreateDialog"
          >
            <PlusIcon data-icon="inline-start" />
            {{ t('settings.catAppearance.role.knowledge.add') }}
          </Button>
        </template>
      </SettingsSearchBar>

      <CardContent class="flex min-h-0 flex-1 flex-col overflow-y-auto p-0">
        <div class="flex min-h-full flex-1 flex-col">
          <div
            v-if="!entries.length"
            class="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-10 text-center text-sm text-muted-foreground sm:px-5"
          >
            <BookOpenIcon class="size-8 opacity-50" />
            <div class="flex max-w-lg flex-col gap-1">
              <p class="font-medium text-foreground">
                {{ t('settings.catAppearance.role.knowledge.empty') }}
              </p>
              <p>{{ t('settings.catAppearance.role.knowledge.emptyHint') }}</p>
            </div>
            <Button
              type="button"
              @click="openKnowledgeCreateDialog"
            >
              <PlusIcon data-icon="inline-start" />
              {{ t('settings.catAppearance.role.knowledge.add') }}
            </Button>
          </div>

          <div
            v-else-if="searchEmpty"
            class="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-10 text-center text-sm text-muted-foreground sm:px-5"
          >
            <SearchIcon class="size-8 opacity-50" />
            <div class="flex max-w-lg flex-col gap-1">
              <p class="font-medium text-foreground">
                {{ t('settings.catAppearance.role.knowledge.noSearchMatch', { query: knowledgeSearchQuery }) }}
              </p>
              <p>{{ t('settings.catAppearance.role.knowledge.noSearchMatchHint') }}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              @click="clearSearch"
            >
              <XIcon data-icon="inline-start" />
              {{ t('settings.catAppearance.role.knowledge.clearSearch') }}
            </Button>
          </div>

          <div
            v-else
            class="flex flex-col gap-3 px-4 py-4 sm:px-5"
          >
            <SettingsPanelItem
              v-for="item in filteredKnowledgeEntries"
              :key="item.entry.id"
              :title="item.entry.title || t('settings.catAppearance.role.knowledge.untitled')"
              :icon="BookOpenIcon"
            >
              <template #badges>
                <Badge :variant="item.entry.enabled ? 'secondary' : 'outline'">
                  {{
                    t(
                      item.entry.enabled
                        ? 'settings.catAppearance.role.knowledge.enabled'
                        : 'settings.catAppearance.role.knowledge.disabled'
                    )
                  }}
                </Badge>
                <Badge
                  v-if="item.entry.constant"
                  variant="outline"
                >
                  {{ t('settings.catAppearance.role.knowledge.fields.constant') }}
                </Badge>
                <Badge variant="outline">
                  {{ t('settings.catAppearance.role.knowledge.prioritySummary', { value: item.entry.priority }) }}
                </Badge>
                <Badge
                  v-if="item.entry.tokenBudget"
                  variant="outline"
                >
                  {{ t('settings.catAppearance.role.knowledge.tokenBudgetSummary', { value: item.entry.tokenBudget }) }}
                </Badge>
              </template>

              <template #meta>
                <p class="line-clamp-2 text-sm text-muted-foreground">
                  {{ item.entry.content }}
                </p>
                <p
                  v-if="item.entry.keys.length"
                  class="truncate text-xs text-muted-foreground"
                >
                  {{
                    t('settings.catAppearance.role.knowledge.keywordSummary', {
                      keywords: item.entry.keys.join('、'),
                    })
                  }}
                </p>
                <p
                  v-else-if="!item.entry.constant"
                  class="text-xs text-muted-foreground"
                >
                  {{ t('settings.catAppearance.role.knowledge.noTrigger') }}
                </p>
              </template>

              <template #actions>
                <Switch
                  :id="`role-knowledge-enabled-${item.entry.id}`"
                  size="sm"
                  :model-value="item.entry.enabled"
                  :aria-label="
                    t(
                      item.entry.enabled
                        ? 'settings.catAppearance.role.knowledge.disable'
                        : 'settings.catAppearance.role.knowledge.enable',
                      { title: item.entry.title || t('settings.catAppearance.role.knowledge.untitled') }
                    )
                  "
                  @update:model-value="updateKnowledgeEntry(item.entry.id, { enabled: Boolean($event) })"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  :aria-label="t('settings.catAppearance.role.knowledge.edit')"
                  @click="openKnowledgeEditDialog(item.entry)"
                >
                  <PencilIcon />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  :aria-label="t('settings.catAppearance.role.knowledge.delete')"
                  @click="requestDeleteKnowledgeEntry(item.entry.id)"
                >
                  <Trash2Icon />
                </Button>
              </template>
            </SettingsPanelItem>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>

  <CompanionRoleKnowledgeCreateDialog
    v-model:open="knowledgeEntryDialogOpen"
    :entry="editingKnowledgeEntry"
    @submit="submitKnowledgeEntry"
  />

  <CompanionRoleKnowledgeSettingsModal
    v-model:open="knowledgeSettingsModalOpen"
    :settings="settings"
    @submit="updateKnowledgeSettings"
  />

  <CompanionRoleKnowledgeDeleteModal
    v-if="knowledgeDeleteTarget"
    v-model:open="knowledgeDeleteDialogOpen"
    :title="knowledgeDeleteTarget.title || t('settings.catAppearance.role.knowledge.untitled')"
    @confirm="confirmDeleteKnowledgeEntry"
  />
</template>
